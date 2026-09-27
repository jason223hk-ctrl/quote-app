import { sha256Hex, type PhotosApi } from './photos'
import { targetSize, type SignedUrls, type UploadDeps } from './photoUpload'
import type { PurgeReply } from './purgeAfterDelete'

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
  '未設定相片上傳服務（VITE_PHOTO_WORKER_URL）。相片仍會存入本裝置，但無法上傳雲端。請截圖並聯絡 Jason。'

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
    throw new Error('本裝置的瀏覽器無法製作縮圖，無法拍攝。請截圖並聯絡 Jason。')
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('壓縮相片失敗。請重新拍攝，或截圖並聯絡 Jason。')
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
    throw new Error('上傳服務回覆的內容不完整')
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
    allocateSeq: photos.allocateSeq,
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
      return { ok: false, message: `無法複製到 Drive：${detail}` }
    }
    return { ok: true, alreadyDone: Boolean((body as { alreadyDone?: boolean }).alreadyDone) }
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught)
    console.error('[quote-app] drive mirror failed:', detail)
    return { ok: false, message: `無法複製去 Drive：${detail}。R2 那一份仍在，不會丟失。` }
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

/**
 * P8 步 4：叫 Worker 清走**一單已刪工程**嘅雲端相片（R2 刪 bytes、Drive 掉垃圾桶）。
 *
 * ⛔ bytes 唔會經前端 —— 呢度淨係傳一個 `recordId` 過去。
 * ⛔ 兩道閘全部喺 Worker／DB 嗰邊（母單真係刪咗未、`quote_purge_stamp` 問准）——
 *   ⛔⛔ **前端⛔ 唔准自己寫一套「邊個刪得」嘅判斷**（CLAUDE.md §2.13：
 *   同一條寫入路徑）。⭐ 唔准就由 Worker 回一句中文，呢度原封不動交返出去。
 *
 * ⛔⛔ **唔會 throw** —— 一律砌成一個 `PurgeReply` 交返（見 `purgeAfterDelete.ts`）。
 *    ⚠️ 叫嗰邊嗰陣單工程已經刪咗，一個掟出嚟嘅 exception 會俾人當成「刪唔到」。
 */
export async function purgeRecordPhotos(
  accessToken: string,
  recordId: string,
): Promise<PurgeReply> {
  const base = photoWorkerBase()
  if (base === '') return purgeRefused(PURGE_WORKER_MISSING)

  let response: Response
  try {
    response = await fetch(`${base}/purge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ recordId }),
    })
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught)
    console.error('[quote-app] purge failed:', detail)
    /**
     * ⛔⛔ **⛔ 唔准寫「沒有清走」—— 嗰句係我哋證明唔到嘅。**
     *
     * ⚠️ `fetch` 掟錯⛔ 唔代表個請求冇到過 Worker ——
     *    佢可能**做晒嘢先斷線**（回覆返唔到嚟）。
     * ⇒ ⭐ 所以要講「**無法確定**」，並且講埋「再清一次係安全嘅」——
     *   ⚠️ 冇後半句，人就唔敢再撳，而嗰啲 bytes 就永遠留喺雲端。
     *   （重試安全係真嘅：R2 對已經冇咗嘅 key 回 404、Drive 對已經喺垃圾桶
     *    嘅檔回 200，兩個都當「清咗」—— `worker/src/purge.mjs` 有測試釘住。）
     */
    return purgeRefused(
      `無法連接相片服務，⛔ 無法確定雲端相片有沒有清走（${detail}）。請檢查網絡連線，稍後到設定頁再清一次 —— 重複清是安全的。`,
    )
  }

  const body = (await response.json().catch(() => ({}))) as Partial<PurgeReply> & {
    error?: string
  }

  if (!response.ok) {
    /**
     * ⛔⛔ **404 有兩種，⛔ 唔准合埋**（CLAUDE.md §2.6）：
     *
     *   · Worker **未 deploy 呢條路** ⇒ 佢個 fallback 回 `{ error: 'not found' }`，
     *     ⛔ **冇 `message`**。修法係 **deploy**。
     *   · 條路行到，但**搵唔到嗰單工程** ⇒ `purgeRecord()` 回一句中文 `message`。
     *     修法係搵開單嗰個。
     *
     * ⚠️ 合埋咗就會有人去搵權限、搵人開 admin，而真相係**冇人 deploy 過**
     *    —— 佢會搵錯人，而且每次都會得到「你應該有權先啱」。
     */
    if (response.status === 404 && typeof body.message !== 'string') {
      console.error('[quote-app] purge: worker has no /purge route')
      return purgeRefused(PURGE_ROUTE_MISSING)
    }
    if (typeof body.message === 'string') {
      console.error('[quote-app] purge refused:', response.status, body.message)
      return purgeRefused(body.message)
    }
    /* ⛔ 401／400 嗰幾種淨係回一個英文 `error`，⛔ 唔可以原封不動彈出嚟
       （CLAUDE.md §2.7）—— 英文照樣寫落 `console.error`。 */
    console.error('[quote-app] purge failed:', response.status, body.error ?? '(no body)')
    return purgeRefused(
      `相片服務回覆 ${response.status}，雲端相片沒有清走。請重新登入再試；如果一直這樣，請截圖並聯絡 Jason。`,
    )
  }

  /* ⛔ 一個睇唔明嘅回覆⛔ 唔准當成功（CLAUDE.md §2.6 第三行）。 */
  if (typeof body.ok !== 'boolean' || typeof body.purged !== 'number') {
    console.error('[quote-app] purge: cannot understand reply:', JSON.stringify(body).slice(0, 300))
    return purgeRefused(
      '相片服務回覆了一個看不懂的結果，無法確定雲端相片有沒有清走。請截圖並聯絡 Jason。',
    )
  }

  return {
    ok: body.ok,
    purged: body.purged,
    alreadyDone: body.alreadyDone ?? 0,
    nothingToClear: body.nothingToClear ?? 0,
    remaining: body.remaining ?? 0,
    hitLimit: body.hitLimit ?? false,
    failed: body.failed ?? [],
    message: body.message ?? '',
  }
}

export const PURGE_WORKER_MISSING =
  '未設定相片服務（VITE_PHOTO_WORKER_URL），雲端相片沒有清走。請截圖並聯絡 Jason。'

/**
 * ⛔ 講明係「未安裝」，⛔ 唔准講成「你沒有權限」——
 *    ⭐ 修法係 deploy 一次 Worker，⛔ 唔係搵人開權限（CLAUDE.md §2.6）。
 */
export const PURGE_ROUTE_MISSING =
  '相片服務還未安裝清走相片的功能（/purge）。⛔ 沒有清走任何東西。請截圖並聯絡 Jason。'

/** 一張都冇清走嗰個樣。⛔ 每個數都係 0 —— ⚠️ 落去 `purgeOutcomeKind()` 會判 `refused`。 */
function purgeRefused(message: string): PurgeReply {
  return {
    ok: false,
    purged: 0,
    alreadyDone: 0,
    nothingToClear: 0,
    remaining: 0,
    hitLimit: false,
    failed: [],
    message,
  }
}
