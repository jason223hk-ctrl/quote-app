import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PHOTO_STATUS_HINT,
  PHOTO_STATUS_LABEL,
  newOperationId,
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
  photoWorkerBase,
} from '../lib/photoTransport'

type Props = {
  api: PhotosApi
  accessToken: string
  recordId: string
  treeId: string
}

/** 畫面上一格相：本機嗰份（有縮圖）加雲端嗰行（有狀態）。 */
type SlotItem = {
  operationId: string
  status: PhotoStatus
  message: string
  thumbUrl: string | null
  capturedAt: string
}

function mergeItems(pending: PendingPhoto[], rows: QuotePhoto[], treeId: string): SlotItem[] {
  const byOperation = new Map(rows.map((row) => [row.operation_id, row]))
  const seen = new Set<string>()

  const fromLocal = pending
    .filter((item) => item.treeId === treeId)
    .map((item) => {
      seen.add(item.operationId)
      const row = byOperation.get(item.operationId)
      // DB 嗰行係準嘅。本機嗰個 status 只係「未有行」嗰陣先用。
      const status: PhotoStatus = row ? statusOfRow(row) : item.status === 'uploaded' ? 'local' : item.status
      return {
        operationId: item.operationId,
        status,
        message: row ? '' : item.error,
        thumbUrl: null as string | null,
        capturedAt: item.capturedAt,
      }
    })

  // 第二部機影嘅相：得 DB 一行，冇本機副本，一樣要見到。
  const fromRows = rows
    .filter((row) => row.tree_id === treeId && !seen.has(row.operation_id))
    .map((row) => ({
      operationId: row.operation_id,
      status: statusOfRow(row),
      message: row.r2_error,
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
export default function PhotoSlot({ api, accessToken, recordId, treeId }: Props) {
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [rows, setRows] = useState<QuotePhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const cameraRef = useRef<HTMLInputElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)

  const workerReady = photoWorkerBase() !== ''
  const storeReady = localStorageAvailable()

  const reload = useCallback(async () => {
    const [localItems, remoteRows] = await Promise.all([
      storeReady ? photoStore.listByRecord(recordId) : Promise.resolve([]),
      api.listByRecord(recordId),
    ])
    setPending(localItems)
    setRows(remoteRows)

    const next: Record<string, string> = {}
    for (const item of localItems) {
      if (item.treeId === treeId) next[item.operationId] = URL.createObjectURL(item.blob)
    }
    setThumbs((current) => {
      for (const url of Object.values(current)) URL.revokeObjectURL(url)
      return next
    })
  }, [api, recordId, treeId, storeReady])

  useEffect(() => {
    void reload().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    })
  }, [reload])

  const items = useMemo(() => mergeItems(pending, rows, treeId), [pending, rows, treeId])

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
    if (!item) return
    setBusy(true)
    setError(null)
    try {
      await send(item)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card photo-slot" data-testid="photo-slot">
      <h3 className="photo-slot__title">全景相（成棵樹）</h3>
      <p className="hint">P3a 只做呢一格。近景、工程相、畫線係之後嘅階段。</p>

      {!workerReady && (
        <p className="notice notice--warning" role="status">
          {WORKER_MISSING_MESSAGE}
        </p>
      )}

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
