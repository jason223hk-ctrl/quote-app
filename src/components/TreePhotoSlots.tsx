import { useCallback, useEffect, useRef, useState } from 'react'
import PhotoSlot from './PhotoSlot'
import { LEGACY_NO_SLOT_MESSAGE, needsLegacyNotice, slotsFor } from '../lib/photoSlots'
import {
  MAX_DRIVE_ATTEMPTS,
  pickMirrorBatch,
  type PhotosApi,
  type QuotePhoto,
} from '../lib/photos'
import { photoStore } from '../lib/photoStore'
import { mirrorPhoto, photoWorkerBase } from '../lib/photoTransport'
import type { QuoteTree } from '../lib/trees'

type Props = {
  photos: PhotosApi
  accessToken: string
  recordId: string
  tree: QuoteTree
}

/**
 * 一棵樹上面全部影相格：全景格 ＋ 每個揀咗嘅工序一格（D7 甲）。
 *
 * ⛔ 揀咗幾多個工序就出幾多格，唔另開一版（Jason 2026-08-23）。
 */
export default function TreePhotoSlots({ photos, accessToken, recordId, tree }: Props) {
  const mitigations = tree.mitigations ?? []
  const slots = slotsFor(mitigations)

  /**
   * ⛔ 補鏡像**只可以有一個擁有者**，就係呢度。
   *
   * 2026-08-23 出事：補鏡像本來喺每個 `PhotoSlot` 入面，
   * 而每個 slot 都攞成單所有 rows、各自有一個 `triedRef`。
   * P3c-1 加多咗工序格之後，**兩個格同時撿走同一張相、同時叫 `/mirror`**，
   * Drive `files.list` 係最終一致，兩道保護（`findMirroredFile`、
   * `findNameClash`）都係查 Drive，所以**兩道都擋唔到「同時」** ——
   * 結果 Drive 出咗兩個同名檔、DB 得一行。
   *
   * 所以：**一棵樹一個迴圈**，而且**只揀返自己棵樹嘅 rows**
   * （⛔ 唔准靠「而家一次淨係 render 一棵樹」——今晚就係咁樣由「當時啱」變唔啱）。
   */
  const triedRef = useRef<Set<string>>(new Set())
  const [tick, setTick] = useState(0)
  const onChanged = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (photoWorkerBase() === '') return
    let live = true

    void (async () => {
      let rows: QuotePhoto[]
      try {
        rows = await photos.listByRecord(recordId)
      } catch {
        return
      }
      if (!live) return

      // ⚠️ 次數要問 IndexedDB，唔可以問 React state —— state 落後一拍，
      //    落後嗰陣就會超過 MAX_DRIVE_ATTEMPTS 再試（2026-08-22 harness 捉到）。
      const pendingAttempts = new Map<string, number>()
      for (const item of await photoStore.listByRecord(recordId).catch(() => [])) {
        pendingAttempts.set(item.operationId, item.driveAttempts ?? 0)
      }
      if (!live) return

      const attemptsOf = (photoId: string) => {
        const row = rows.find((one) => one.id === photoId)
        return row ? (pendingAttempts.get(row.operation_id) ?? 0) : 0
      }

      const batch = pickMirrorBatch(rows, attemptsOf, tree.id).filter(
        (row) => !triedRef.current.has(row.id),
      )
      for (const row of batch) triedRef.current.add(row.id)

      for (const row of batch) {
        if (!live) return
        // ⚠️ 上載之前再問一次 DB —— 收窄個窗口。
        // ⛔ 但佢唔係互斥：兩個請求真係同時讀到 null 就一樣會兩邊都上。
        //    閂死個窗口係 CAS claim（丙），已知下一步，而家唔做。
        const fresh = await photos.findByOperationId(row.operation_id).catch(() => null)
        if (fresh?.drive_synced_at) continue

        const item = await photoStore.get(row.operation_id).catch(() => null)
        if (item && (item.driveAttempts ?? 0) >= MAX_DRIVE_ATTEMPTS) continue

        const result = await mirrorPhoto(accessToken, row.id, item?.compressFallback ?? '')
        if (item) {
          await photoStore.put({
            ...item,
            driveAttempts: result.ok ? 0 : (item.driveAttempts ?? 0) + 1,
            driveError: result.ok ? '' : result.message,
          })
        }
      }
      if (live) setTick((n) => n + 1)
    })()

    return () => {
      live = false
    }
    // ⚠️ `tick` 特登唔喺依賴入面：補完之後 `tick` 會加一，
    //    如果佢喺依賴度就會再觸發自己，變成無限迴圈。
  }, [photos, recordId, tree.id, accessToken])

  return (
    <>
      {slots.map((slot) => (
        <PhotoSlot
          key={`${slot.mitigation ?? '__whole__'}-${tick}`}
          api={photos}
          accessToken={accessToken}
          recordId={recordId}
          treeId={tree.id}
          mitigation={slot.mitigation}
          title={slot.title}
          hint={slot.hint}
          onChanged={onChanged}
        />
      ))}

      {/* ⛔ 只有 legacy 代號嘅樹唔出工序格（D8）。要講到明點做，唔好淨係冇咗個掣。 */}
      {needsLegacyNotice(mitigations) && (
        <p className="notice notice--warning" role="status">
          {LEGACY_NO_SLOT_MESSAGE}
        </p>
      )}
    </>
  )
}
