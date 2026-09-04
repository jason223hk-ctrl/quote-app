import { sha256Hex, type PhotosApi } from './photos'
import { targetSize, type SignedUrls, type UploadDeps } from './photoUpload'

/**
 * 真實世界嗰邊：壓縮、同 Worker 攞簽名網址、直接同 R2 講。
 *
 * ⛔ bytes 一個 byte 都唔經 Worker —— Worker 淨係簽網址。
 * 一個 145 張相嘅工程應該問一次攞晒，唔係問 145 次
 * （`docs/P3-現場影相-設計.md` 第三章）。P3a 一次得一張，但條路要行得通。
 */
/**
 * 長邊 2800 —— **跟返 tree app**（`src/lib/imageCompress.ts:110`
 * 嘅 `{ longEdge = 2800, quality = 85 }`）。
 *
 * 唔係為咗一樣而一樣：quote app 影嘅相會**原封不動轉入 tree app 做事前相**，
 * 兩邊解像度唔同，同一棵樹嘅事前相同事後相就會一大一細，
 * **PDF 兩欄擺埋一齊會好明顯**。同一條規則亦即係將來改畫質只改一個地方。
 */
export const MAX_EDGE = 2800
export const JPEG_QUALITY = 0.85

/** Worker 未設定唔會白畫面，亦唔會靜靜失敗——影相個掣會講到明。 */
export function photoWorkerBase(): string {
  return (import.meta.env.VITE_PHOTO_WORKER_URL ?? '').trim().replace(/\/+$/, '')
}

export const WORKER_MISSING_MESSAGE =
  '未設定相片上傳服務（VITE_PHOTO_WORKER_URL）。相會照存喺部機，但上唔到雲端。請截圖搵 Jason。'

/**
 * 壓一次：長邊 2048、JPEG 85。R2 同 Drive 之後存嘅係同一份 bytes，
 * 所以壓縮只可以喺呢一個位發生，之後唔准再壓第二次（sha256 會唔同）。
 */
export async function compressToJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const size = targetSize(bitmap.width, bitmap.height, MAX_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('部機嘅瀏覽器整唔到縮圖，影唔到相。請截圖搵 Jason。')
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('壓縮相片失敗。請再影一次，或者截圖搵 Jason。')
  return blob
}

async function signedFromWorker(
  base: string,
  accessToken: string,
  operationId: string,
  contentType: string,
): Promise<SignedUrls> {
  const response = await fetch(`${base}/sign`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ operationId, contentType }),
  })
  if (!response.ok) {
    throw new Error(`上傳服務回覆 ${response.status}`)
  }
  const body = (await response.json()) as Partial<SignedUrls>
  if (!body.key || !body.put || !body.get) {
    throw new Error('上傳服務回覆嘅內容唔完整')
  }
  return { key: body.key, put: body.put, get: body.get }
}

export function createUploadDeps(accessToken: string, photos: PhotosApi): UploadDeps {
  const base = photoWorkerBase()

  return {
    sign(operationId, contentType) {
      if (base === '') throw new Error(WORKER_MISSING_MESSAGE)
      return signedFromWorker(base, accessToken, operationId, contentType)
    },

    async putBytes(url, bytes, contentType) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: bytes,
      })
      if (!response.ok) throw new Error(`R2 回覆 ${response.status}`)
    },

    async getBytes(url) {
      const response = await fetch(url, { method: 'GET', cache: 'no-store' })
      if (!response.ok) throw new Error(`R2 回覆 ${response.status}`)
      return response.arrayBuffer()
    },

    digest: sha256Hex,
    findRow: photos.findByOperationId,
    saveRow: photos.create,
  }
}

export type MirrorResult = { ok: true; alreadyDone: boolean } | { ok: false; message: string }

/**
 * 叫 Worker 抄一份上 Drive。
 *
 * ⛔ bytes 唔會經前端 —— 呢度淨係傳一個相片 id 過去，
 * Worker 自己由 R2 讀返出嚟原封不動上 Drive。
 */
export async function mirrorPhoto(accessToken: string, photoId: string): Promise<MirrorResult> {
  const base = photoWorkerBase()
  if (base === '') return { ok: false, message: WORKER_MISSING_MESSAGE }

  try {
    const response = await fetch(`${base}/mirror`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ photoId }),
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    if (!response.ok) {
      const detail = body.message ?? `上傳服務回覆 ${response.status}`
      console.error('[quote-app] drive mirror failed:', detail)
      return { ok: false, message: `抄唔到去 Drive：${detail}` }
    }
    return { ok: true, alreadyDone: Boolean((body as { alreadyDone?: boolean }).alreadyDone) }
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught)
    console.error('[quote-app] drive mirror failed:', detail)
    return { ok: false, message: `抄唔到去 Drive：${detail}。R2 嗰份仲喺，唔會冇咗。` }
  }
}

/**
 * 攞返一張相嘅 bytes（匯出 PDF 用）。
 *
 * ⛔⛔ ⛔ 唔可以用 `sign()` —— 佢個 key 係 `${呼叫者}/${operationId}.jpg`，
 *    即係淨係簽得到你自己影嗰啲。阿耀影嘅相，Jason 匯出就簽唔到，
 *    出嚟嘅 PDF 會靜靜咁少咗幾張。⇒ 一律行 Worker 條 `/read`（用行入面個 `r2_key`）。
 *
 * ⛔ 攞唔到就 throw 一句中文，⛔ 唔准回一個空白 buffer 扮攞到。
 */
export async function fetchPhotoBytes(
  accessToken: string,
  photoId: string,
): Promise<ArrayBuffer> {
  const base = photoWorkerBase()
  if (base === '') throw new Error(WORKER_MISSING_MESSAGE)

  const response = await fetch(`${base}/read`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ photoId }),
  })
  const body = (await response.json().catch(() => ({}))) as { get?: string; message?: string }
  if (!response.ok || !body.get) {
    throw new Error(body.message ?? `相片服務回覆 ${response.status}`)
  }

  const bytes = await fetch(body.get, { method: 'GET', cache: 'no-store' })
  if (!bytes.ok) throw new Error(`讀相片回覆 ${bytes.status}`)
  return bytes.arrayBuffer()
}
