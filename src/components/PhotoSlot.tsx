import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_DRIVE_ATTEMPTS,
  PHOTO_STATUS_HINT,
  PHOTO_STATUS_LABEL,
  newOperationId,
  pickMirrorBatch,
  sha256Hex,
  statusOfRow,
  type PhotoStatus,
  type PhotosApi,
  type QuotePhoto,
} from '../lib/photos'
import { photoStore, localStorageAvailable } from '../lib/photoStore'
import { uploadPending, type PendingPhoto } from '../lib/photoUpload'
import {
  WORKER_MISSING_MESSAGE,
  compressToJpeg,
  createUploadDeps,
  mirrorPhoto,
  photoWorkerBase,
} from '../lib/photoTransport'

type Props = {
  api: PhotosApi
  accessToken: string
  recordId: string
  /** ⛔ null ＝ 環境相：成個工程一份，唔屬於任何一棵樹。 */
  treeId: string | null
  /** 邊個工序。⛔ null ＝ 全景相。環境相亦都係 null。 */
  mitigation?: string | null
  /** ⛔ 唔畀影（例如「移除」——全景相已經足夠）。相仲係睇得晒。 */
  readOnly?: boolean
  /** 唔畀影嗰陣寫嘅原因。 */
  readOnlyNote?: string
  /** 卡面標題。唔寫就用返全景相嗰個。 */
  title?: string
  /** 標題下面一行細字。寫 `null` 就唔出。 */
  hint?: string | null
}

/** 畫面上一格相：本機嗰份（有縮圖）加雲端嗰行（有狀態）。 */
type SlotItem = {
  operationId: string
  status: PhotoStatus
  message: string
  thumbUrl: string | null
  capturedAt: string
}

function mergeItems(
  pending: PendingPhoto[],
  rows: QuotePhoto[],
  treeId: string | null,
  mitigation: string | null,
  attempts: (photoId: string) => number,
): SlotItem[] {
  const byOperation = new Map(rows.map((row) => [row.operation_id, row]))
  const seen = new Set<string>()

  const fromLocal = pending
    .filter((item) => item.treeId === treeId && (item.mitigation ?? null) === mitigation)
    .map((item) => {
      seen.add(item.operationId)
      const row = byOperation.get(item.operationId)
      // DB 嗰行係準嘅。本機嗰個 status 只係「未有行」嗰陣先用。
      const status: PhotoStatus = row
        ? statusOfRow(row, attempts(row.id))
        : item.status === 'uploaded'
          ? 'local'
          : item.status
      return {
        operationId: item.operationId,
        status,
        message: row ? (row.drive_synced_at ? '' : (item.driveError ?? '')) : item.error,
        thumbUrl: null as string | null,
        capturedAt: item.capturedAt,
      }
    })

  // 第二部機影嘅相：得 DB 一行，冇本機副本，一樣要見到。
  const fromRows = rows
    .filter(
      (row) =>
        row.tree_id === treeId &&
        row.mitigation === mitigation &&
        !seen.has(row.operation_id),
    )
    .map((row) => ({
      operationId: row.operation_id,
      status: statusOfRow(row, attempts(row.id)),
      message: row.r2_error || row.drive_error,
      thumbUrl: null as string | null,
      capturedAt: row.captured_at ?? row.created_at,
    }))

  return [...fromLocal, ...fromRows].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
}

/**
 * P3a 嗰一格：一棵樹嘅全景相。
 *
 * 條路：撳「拍攝／相簿」→ 壓一次 → 寫落部機 → 上 R2 → 讀返出嚟對數 → 寫一行。
 * ⛔ 每一步失敗都要有一句寫得出嘅中文，唔准靜靜過骨。
 */
export default function PhotoSlot({
  api,
  accessToken,
  recordId,
  treeId,
  mitigation = null,
  readOnly = false,
  readOnlyNote,
  title = '全景相（成棵樹）',
  hint = 'P3a 只做呢一格。近景、工程相、畫線係之後嘅階段。',
}: Props) {
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [rows, setRows] = useState<QuotePhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  /** 攞唔到雲端嗰份。⛔ 唔係出錯，係「而家只睇到部機嗰份」。 */
  const [stale, setStale] = useState(false)
  /**
   * ⛔ 今次開 app 已經試過補鏡像嘅相。
   *
   * 冇呢個就會炒車：補完 → `reload()` → `rows` 換咗個新 array →
   * useEffect 再行 → 再補一次…… 一次開 app 就燒晒三次配額，
   * 而且變成連環重試，正正係「一次三張」想避免嗰件事。
   * 「下次開 app 補做」＝**一次開 app 一張相試一次**。
   */
  const triedRef = useRef<Set<string>>(new Set())
  const cameraRef = useRef<HTMLInputElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)

  const workerReady = photoWorkerBase() !== ''
  const storeReady = localStorageAvailable()

  /**
   * 攞返最新狀態。
   *
   * ⛔⛔ 兩邊要**分開**，⛔ 唔准再用 `Promise.all` 綁住佢哋。
   *
   * ⚠️ 2026-09-05 真機中過：本來兩樣一齊 `Promise.all`，雲端嗰邊一失敗，
   *    **連部機嗰份都唔會 set 落畫面**。飛航模式下嘅實際後果係：
   *      · 張相真係寫咗入部機 ✅
   *      · 狀態真係改成「有事要人睇」✅
   *      · ⛔ 但畫面永遠刷新唔到 ⇒ 見唔到張相、見唔到「再試一次」
   *    ⇒ 正正踩爛 `上線清單.md` 第 1 條嗰句「畫面永遠見到『未上載 N 張』」。
   *
   * ⭐ 部機嗰份係**唯一唔使網絡都有**嘅嘢，所以佢一定要行先、一定要出到。
   */
  const reload = useCallback(async () => {
    if (storeReady) {
      const localItems = await photoStore.listByRecord(recordId)
      setPending(localItems)

      const next: Record<string, string> = {}
      for (const item of localItems) {
        if (item.treeId === treeId && (item.mitigation ?? null) === mitigation)
          next[item.operationId] = URL.createObjectURL(item.blob)
      }
      setThumbs((current) => {
        for (const url of Object.values(current)) URL.revokeObjectURL(url)
        return next
      })
    }

    // 雲端嗰份攞唔到⛔ 唔算大件事：影相、睇「未上載幾多張」、撳「再試一次」
    // 三樣都唔需要佢。⛔ 但亦唔准當冇事發生 —— 出一句話俾人知睇緊嘅係部機嗰份。
    try {
      setRows(await api.listByRecord(recordId))
      setStale(false)
    } catch {
      // ⛔ 唔准清空 `rows` —— 上一次攞到嗰批仍然係啱嘅，清咗反而少咗嘢睇。
      setStale(true)
    }
  }, [api, recordId, treeId, mitigation, storeReady])

  useEffect(() => {
    void reload().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    })
  }, [reload])


  // Drive 試咗幾多次係本機記住嘅（DB 冇呢個欄）。第二部機影嘅相冇本機紀錄，當 0。
  const attemptsOf = useCallback(
    (photoId: string) => {
      const row = rows.find((one) => one.id === photoId)
      const item = row ? pending.find((one) => one.operationId === row.operation_id) : undefined
      return item?.driveAttempts ?? 0
    },
    [pending, rows],
  )

  const items = useMemo(
    () => mergeItems(pending, rows, treeId, mitigation, attemptsOf),
    [pending, rows, treeId, mitigation, attemptsOf],
  )

  /**
   * 抄一張相上 Drive，然後記低結果。
   * ⛔ 失敗要留低痕跡，唔准靜靜過骨。
   */
  const runMirror = useCallback(
    async (row: QuotePhoto) => {
      // ⛔ 由 store 度讀返最新嗰個，唔用 React state ——
      // state 有機會落後半拍，而「試咗幾多次」數少咗就會無限試落去。
      const before = await photoStore.get(row.operation_id)
      if (before && (before.driveAttempts ?? 0) >= MAX_DRIVE_ATTEMPTS) {
        return { ok: false as const, message: before.driveError ?? '' }
      }

      const result = await mirrorPhoto(accessToken, row.id)
      if (before) {
        await photoStore.put({
          ...before,
          driveAttempts: result.ok ? 0 : (before.driveAttempts ?? 0) + 1,
          driveError: result.ok ? '' : result.message,
        })
      }
      return result
    },
    [accessToken],
  )

  /**
   * 開返 app 嗰陣補鏡像。
   *
   * ⛔ 一次三張，唔准一次過發成個工程嘅請求 —— 地盤網絡差，三十個會一齊死。
   * ⛔ 試夠三次嘅唔會再自動試，要人手撳。
   */
  useEffect(() => {
    if (!workerReady || rows.length === 0) return
    const batch = pickMirrorBatch(rows, attemptsOf).filter(
      (row) => !triedRef.current.has(row.id),
    )
    if (batch.length === 0) return
    for (const row of batch) triedRef.current.add(row.id)

    let live = true
    void (async () => {
      for (const row of batch) {
        if (!live) return
        await runMirror(row)
      }
      if (live) await reload()
    })()
    return () => {
      live = false
    }
    // rows 一變就再睇有冇嘢要補；補完 reload 會令 rows 再變，
    // 但嗰陣 pickMirrorBatch 會回空，所以唔會無限行落去。
  }, [rows, workerReady, attemptsOf, runMirror, reload])

  async function send(item: PendingPhoto) {
    await photoStore.put({ ...item, status: 'uploading', error: '' })
    setPending((current) =>
      current.map((one) =>
        one.operationId === item.operationId ? { ...one, status: 'uploading', error: '' } : one,
      ),
    )

    const result = await uploadPending(item, createUploadDeps(accessToken, api))

    if (result.ok) {
      await photoStore.put({ ...item, status: 'uploaded', error: '' })
      // 影完即刻試一次鏡像。唔成功就留低狀態，下次開 app 補（§7.5）。
      triedRef.current.add(result.row.id)
      const mirrored = await runMirror(result.row)
      if (!mirrored.ok) setError(mirrored.message)
    } else {
      // ⛔ 失敗就係失敗。部機嗰份照留住，唔會刪。
      await photoStore.put({
        ...item,
        status: 'error',
        error: result.message,
        attempts: item.attempts + 1,
      })
      setError(result.message)
    }
    await reload()
  }

  async function handleFile(file: File | null) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      if (!storeReady) {
        throw new Error('呢部機嘅瀏覽器唔支援本機儲存，影咗都留唔住。請截圖搵 Jason。')
      }

      const blob = await compressToJpeg(file)
      const buffer = await blob.arrayBuffer()
      const item: PendingPhoto = {
        operationId: newOperationId(),
        recordId,
        treeId,
        mitigation,
        capturedAt: new Date().toISOString(),
        size: buffer.byteLength,
        sha256: await sha256Hex(buffer),
        blob,
        status: 'local',
        error: '',
        attempts: 0,
      }

      // 先寫落部機，再讀返出嚟對數 —— 對到先算存到，先至好講上傳。
      await photoStore.put(item)
      const saved = await photoStore.get(item.operationId)
      if (!saved) throw new Error('張相寫唔入部機。請再影一次，或者截圖搵 Jason。')
      const savedBytes = await saved.blob.arrayBuffer()
      if (savedBytes.byteLength !== item.size || (await sha256Hex(savedBytes)) !== item.sha256) {
        throw new Error('張相存落部機之後對唔返數。請再影一次，或者截圖搵 Jason。')
      }

      await reload()

      if (!workerReady) {
        setError(WORKER_MISSING_MESSAGE)
        return
      }
      await send(item)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (albumRef.current) albumRef.current.value = ''
    }
  }

  async function retry(operationId: string) {
    const item = pending.find((one) => one.operationId === operationId)
    const row = rows.find((one) => one.operation_id === operationId)
    setBusy(true)
    setError(null)
    try {
      // R2 已經有咗就唔使再上一次 —— 差嘅係 Drive 嗰份。
      if (row && row.r2_synced_at !== null) {
        // 人手撳係人手撳 —— 唔受「今次開 app 試過」嗰個限制。
        const result = await runMirror(row)
        if (!result.ok) setError(result.message)
        await reload()
        return
      }
      if (item) await send(item)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card photo-slot" data-testid="photo-slot">
      <h3 className="photo-slot__title">{title}</h3>
      {hint !== null && <p className="hint">{hint}</p>}

      {!workerReady && (
        <p className="notice notice--warning" role="status">
          {WORKER_MISSING_MESSAGE}
        </p>
      )}

      {/* ⛔ 唔講嘅話，人會以為畫面上面就係全部。實情係雲端嗰份而家攞唔到。 */}
      {stale && (
        <p className="notice notice--warning" role="status">
          而家連唔到伺服器，下面顯示嘅係呢部機記住嘅嘢。影相照影得，有網會自己補返。
        </p>
      )}

      {/* ⛔ 唔畀影嗰陣連掣都唔出 —— 出咗個灰掣，人會一路撳一路以為壞咗。
          相仲係睇得晒，所以唔係成張卡收埋。 */}
      {readOnly ? (
        <p className="hint">{readOnlyNote ?? '呢格唔使影相。'}</p>
      ) : (
        <div className="photo-slot__buttons">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          >
            {busy ? '處理中…' : '拍攝'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => albumRef.current?.click()}
          >
            相簿
          </button>
        </div>
      )}

      <input
        ref={cameraRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="拍攝"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />
      <input
        ref={albumRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        aria-label="相簿"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="muted empty">仲未影過相。</p>
      ) : (
        <ul className="photo-list">
          {items.map((item) => (
            <li className="photo-list__item" key={item.operationId} data-status={item.status}>
              {thumbs[item.operationId] ? (
                <img className="photo-list__thumb" src={thumbs[item.operationId]} alt="" />
              ) : (
                <div className="photo-list__thumb photo-list__thumb--none" aria-hidden="true" />
              )}
              <div className="photo-list__text">
                <strong className="photo-list__status">{PHOTO_STATUS_LABEL[item.status]}</strong>
                <span className="photo-list__hint">{PHOTO_STATUS_HINT[item.status]}</span>
                {item.message && (
                  <span className="photo-list__error" role="alert">
                    {item.message}
                  </span>
                )}
                {item.status === 'error' && (
                  <button
                    className="button button--secondary button--small"
                    type="button"
                    disabled={busy}
                    onClick={() => void retry(item.operationId)}
                  >
                    再試一次
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
