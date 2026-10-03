import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_DRIVE_ATTEMPTS,
  photoCanRetry,
  photoHint,
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
import { BUSY_MESSAGE, claimUpload, releaseUpload } from '../lib/autoResume'
import { refreshPhotos } from '../lib/photoRefresh'
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
  /**
   * 由外面（向下拉刷新）迫佢攞多次。**個數一變就 reload 一次。**
   *
   * ⛔⛔ 刷新**淨係「攞」** —— ⛔ 唔取消上載中嗰張、⛔ 唔令佢重頭再傳、
   *    ⛔ 唔令佢消失、⛔ 唔會傳兩次。點解做唔到嗰四樣，見
   *    `src/lib/photoRefresh.ts` 檔頭，四條各有測試釘住。
   */
  refreshToken?: number
}

/** 畫面上一格相：本機嗰份（有縮圖）加雲端嗰行（有狀態）。 */
type SlotItem = {
  operationId: string
  status: PhotoStatus
  message: string
  thumbUrl: string | null
  capturedAt: string
  /* ⛔⛔ 下面兩個⛔ 唔可以慳 —— 見 `photos.ts` 個 `photoHint()`：
     同一個 `status` 之下「你而家做得到咩」可以完全唔同。 */
  /** 雲端（R2）嗰份有冇。⭐ 有 ＝ 張相安全咗。 */
  r2Done: boolean
  /** 呢部機仲有冇呢張相嘅 bytes。⛔ 冇就重試唔到。 */
  hasLocal: boolean
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
        r2Done: row ? row.r2_synced_at !== null : false,
        // 由本機清單嚟嘅 ⇒ 部機一定仲有份。
        hasLocal: true,
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
      r2Done: row.r2_synced_at !== null,
      // ⛔ 呢批係「得 DB 一行，冇本機副本」—— 定義上就係冇。
      hasLocal: false,
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
  hint = 'P3a 只做這一格。近景、工程相、畫線屬於之後的階段。',
  refreshToken = 0,
}: Props) {
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [rows, setRows] = useState<QuotePhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  /** 攞唔到雲端嗰份。⛔ 唔係出錯，係「而家只睇到部機嗰份」。 */
  const [stale, setStale] = useState(false)
  /**
   * 而家喺度重試緊邊張。
   *
   * ⛔⛔ 2026-09-05 真機中過：撳完「再試一次」，粒掣淨係變灰，個字冇變 ——
   *    喺手機上面讀落就係**乜都冇發生**，人會一路撳一路以為壞咗。
   *    ⭐ 一粒做緊嘢嘅掣，一定要自己講返佢做緊嘢。
   */
  const [retrying, setRetrying] = useState<string | null>(null)
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
    // ⛔⛔ 由 `refreshPhotos()` 攞 —— **同「向下拉刷新」行同一個 function**。
    //    ⚠️ 兩套嘅話，`photoRefresh.test.ts` 嗰四條保證就只釘住其中一套。
    const { local, rows: fresh, stale: missed } = await refreshPhotos({
      listLocal: () => (storeReady ? photoStore.listByRecord(recordId) : Promise.resolve([])),
      listRows: () => api.listByRecord(recordId),
    })

    if (storeReady) {
      setPending(local)

      const next: Record<string, string> = {}
      for (const item of local) {
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
    // ⛔ `fresh` 係 `null`（問唔到）就唔准清空 `rows` —— 上一批仍然係啱嘅。
    if (fresh !== null) setRows(fresh)
    setStale(missed)
  }, [api, recordId, treeId, mitigation, storeReady])

  useEffect(() => {
    void reload().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    })
    // ⭐ `refreshToken` 一變就再攞一次 —— 呢個就係「向下拉刷新」條路。
  }, [reload, refreshToken])


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
      // ⭐ 另一部裝置抄緊（P10）⇒ ⛔ 唔數多一次、⛔ 唔記錯誤：佢抄完，下次 reload 就見到。
      if (!result.ok && result.busy) return result
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
    // ⛔⛔ 背景自動重傳有機會啱啱都揀中同一張。⛔ 兩條路一齊上會撞
    //    `operation_id` 個 unique index（`src/lib/autoResume.ts` 個鎖有解釋）。
    //    ⛔ 讓開唔准靜靜咁讓 —— 撳咗掣就一定要有句嘢答返佢。
    if (!claimUpload(item.operationId)) {
      setError(BUSY_MESSAGE)
      return
    }

    try {
      await photoStore.put({
        ...item,
        status: 'uploading',
        error: '',
        uploadingSince: new Date().toISOString(),
      })
      setPending((current) =>
        current.map((one) =>
          one.operationId === item.operationId ? { ...one, status: 'uploading', error: '' } : one,
        ),
      )

      const result = await uploadPending(item, createUploadDeps(accessToken, api))

      if (result.ok) {
        await photoStore.put({ ...item, status: 'uploaded', error: '', uploadingSince: undefined })
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
          uploadingSince: undefined,
        })
        setError(result.message)
      }
    } finally {
      // ⛔ 一定要放返個鎖，唔係嘅話呢張相之後永遠冇人傳得到。
      releaseUpload(item.operationId)
    }
    await reload()
  }

  async function handleFile(file: File | null) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      if (!storeReady) {
        /* ⛔⛔ 「**本機儲存**」係個**術語**（瀏覽器嗰個 local storage），
           ⛔ 唔准跟住書面語詞彙表換成「本裝置儲存」。
           ⚠️ 2026-09-19 中過：一句入面出咗兩次「本裝置」——
           「本裝置的瀏覽器不支援本裝置儲存」。
           ⭐ 詞彙表換嘅係「**你部機**」嗰個意思，⛔ 唔係所有寫住「機」嘅詞。 */
        throw new Error('本裝置的瀏覽器不支援本機儲存，拍攝後無法保留。請截圖並聯絡 Jason。')
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
      if (!saved) throw new Error('相片無法寫入本裝置。請重新拍攝，或截圖並聯絡 Jason。')
      const savedBytes = await saved.blob.arrayBuffer()
      if (savedBytes.byteLength !== item.size || (await sha256Hex(savedBytes)) !== item.sha256) {
        throw new Error('相片存入本裝置後核對不符。請重新拍攝，或截圖並聯絡 Jason。')
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
    setRetrying(operationId)
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
      setRetrying(null)
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
          現在無法連接伺服器，下面顯示的是本裝置記住的內容。仍然可以拍攝，有網絡時會自動補上。
        </p>
      )}

      {/* ⛔ 唔畀影嗰陣連掣都唔出 —— 出咗個灰掣，人會一路撳一路以為壞咗。
          相仲係睇得晒，所以唔係成張卡收埋。 */}
      {readOnly ? (
        <p className="hint">{readOnlyNote ?? '這一格不需要拍攝。'}</p>
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
        <p className="muted empty">尚未拍攝相片。</p>
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
                <span className="photo-list__hint">{photoHint(item)}</span>
                {item.message && (
                  <span className="photo-list__error" role="alert">
                    {item.message}
                  </span>
                )}
                {/* ⛔⛔ ⛔ 唔准改返做 `item.status === 'error'` —— 見
                    `photos.ts` 個 `photoCanRetry()`：Drive 試夠三次嗰種，
                    粒掣撳落去**一個請求都唔會發**，而畫面就係咁叫咗人白撳。 */}
                {photoCanRetry(item) && (
                  <button
                    className="button button--secondary button--small"
                    type="button"
                    disabled={busy}
                    onClick={() => void retry(item.operationId)}
                  >
                    {/* ⛔ 唔准淨係變灰 —— 粒掣要自己講返佢做緊嘢。 */}
                    {retrying === item.operationId ? '上傳中⋯' : '再試一次'}
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
