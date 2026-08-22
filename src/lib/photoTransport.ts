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
 * ⛔ 呢兩個數係**規格**，唔係實作細節。**改之前一定要問 Jason。**
 *
 * **2400 / 0.80 —— 同 tree app 影相嗰條路一模一樣**（Jason 2026-08-22 拍板）。
 *
 * 出處（實際行嗰條路，唔係 default）：
 *   `tree-app-v7` `src/runtime/uploadPhoto.ts:166`  `CAPTURE_LONG_EDGE = 2400`
 *   `tree-app-v7` `src/runtime/uploadPhoto.ts:167`  `CAPTURE_QUALITY = 80`
 *
 * ⚠️ tree app 個 `80` 係 1–100，喺 `imageCompress.ts:126` 正規化做 `0.80`。
 * **呢度個 `JPEG_QUALITY` 本身就係 0–1，所以直接寫 `0.80`。**
 *
 * ⚠️ **`imageCompress.ts:110` 嗰個 `{ longEdge = 2800, quality = 85 }` 係 default，
 * 影相嗰條路冇用到。** 之前引錯咗，見 `docs/P3b-計劃書.md` I8。
 *
 * **點解要一樣**：quote app 影嘅相會**原封不動轉入 tree app 做事前相**（P6）。
 * 兩邊解像度唔同，同一棵樹嘅事前相同事後相就會一大一細，
 * **PDF 兩欄擺埋一齊會好明顯**。Jason 原話係**唔想日後對相嗰陣要記住
 * 「呢張係邊個 app 影」**。
 */
export const MAX_EDGE = 2400
export const JPEG_QUALITY = 0.8

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
/**
 * ⛔ 壓唔到嗰陣點算 —— **成個 module 得呢一個位決定。**
 *
 * ⚠️ **tree app 嗰邊係「回原圖，唔 throw」**（`imageCompress.ts` 每個
 * `fallback(...)` 分支），佢個理由係**唔好為咗細份啲而冒失相嘅險**。
 * **我哋而家仍然係 throw** —— 即係**張相冇咗，用家要重影**。
 *
 * ⛔ **呢個係第 11 項差異，Jason 未答。**
 * 佢一答，**淨係要改呢一個 function**，唔使周圍搵。
 * 詳情見 `docs/P3b-計劃書.md`「由攞到 File 到拎到 Blob」。
 */
export type CompressResult = {
  blob: Blob
  /** 空 = 正常壓咗。有值 = 壓唔到，上面呢個 `blob` 係原相。 */
  fallback: string
}

/**
 * ⛔ 壓唔到嗰陣：**用返原相，唔 throw。**（Jason 2026-08-22 拍板，第 11 項）
 *
 * 佢知道代價仍然揀呢個：**相留得住，但嗰張唔係 2400 / 0.80。**
 * 點解：**唔可以失相** —— 成個副本契約就係為咗呢件事。
 *
 * ⛔ **但唔准靜靜咁 fallback。** 一張 fallback 上去嘅相係原相 ——
 * 可能幾 MB、尺寸唔知、方向未必轉過 —— 佢會同其他 2400/0.80 嘅相
 * 混埋一齊，**將來冇人知邊張係 fallback**。
 * 所以每次都留低個原因，見 `PhotoSlot` 同 Worker 個 `compressFallback`。
 */
function keepOriginal(reason: string, original: Blob): CompressResult {
  console.warn('[quote-app] compress fallback:', reason, `(${original.size} bytes 原相照上)`)
  return { blob: original, fallback: reason }
}

/**
 * 空白 canvas 偵測 #1：**九點取樣，全部 byte 完全一樣就當白。**
 *
 * 照抄 tree app（`src/lib/imageCompress.ts:61-92`）。
 * 取樣點係九個**分散得好開**嘅位（相對座標）：
 * `0.1/0.5/0.9` × `0.1/0.5/0.9`。
 *
 * **點解九點全同就當白**：真相**唔會**有九個咁散嘅點 RGBA 逐個 byte 一樣。
 * 一片天空係**局部**均勻，唔會連四個角同中心都一模一樣。
 *
 * ⚠️ **空輸入當作白** —— 「證明唔到佢係真相」要 fail safe。
 */
function samplesLookUniform(samples: number[][]): boolean {
  if (!samples.length) return true
  const first = samples[0]
  return samples.every((s) => s.length === first.length && s.every((v, i) => v === first[i]))
}

function samplePixels(ctx: CanvasRenderingContext2D, w: number, h: number): number[][] {
  const points: [number, number][] = [
    [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
    [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
    [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
  ]
  return points.map(([fx, fy]) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor(fx * w)))
    const y = Math.min(h - 1, Math.max(0, Math.floor(fy * h)))
    const d = ctx.getImageData(x, y, 1, 1).data
    return [d[0], d[1], d[2], d[3]]
  })
}

/**
 * 空白 canvas 偵測 #2：**每個像素平均少過 0.02 byte 就當白。**
 *
 * 照抄 tree app（`src/lib/imageCompress.ts:70-78`）連埋佢個實測理由：
 * 真嘅樹葉相喺 q85 度**約 0.27 B/px**（實測 2800×2100 = 1.6MB），
 * 而**全白 JPEG 幾乎唔使錢**。
 * **`0.02` 低過真相一個數量級、高過白相一個數量級**，所以分得開而唔會誤殺。
 */
export function looksBlankBySize(byteLength: number, w: number, h: number): boolean {
  if (!(w > 0) || !(h > 0)) return true
  if (byteLength <= 0) return true
  return byteLength / (w * h) < 0.02
}

/**
 * 壓一次：長邊 2400、JPEG 0.80。R2 同 Drive 之後存嘅係同一份 bytes，
 * 所以壓縮只可以喺呢一個位發生，之後唔准再壓第二次（`sha256` 會唔同）。
 */
export async function compressToJpeg(file: Blob): Promise<CompressResult> {
  let bitmap: ImageBitmap
  try {
    // ⛔ 一定要 `imageOrientation: 'from-image'`（跟 tree app）。
    //    ⚠️ 唔准 catch 完就用返一個冇 options 嘅 createImageBitmap ——
    //    咁做會**燒低未轉向嘅像素同時掉咗 EXIF 標記**，
    //    即係靜靜咁存低一張打橫嘅相（tree app 原文：
    //    "silently save a sideways photo"）。
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return keepOriginal('呢部機唔識自動轉正相片方向（EXIF）', file)
  }

  const size = targetSize(bitmap.width, bitmap.height, MAX_EDGE)
  if (!size.width || !size.height) {
    bitmap.close()
    return keepOriginal('讀唔到張相嘅尺寸', file)
  }

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return keepOriginal('部機嘅瀏覽器整唔到縮圖', file)
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()

  // ⛔ 喺編碼之前查 —— iOS 撞到 canvas 面積上限會畫出一張全白但完全合法嘅 JPEG，
  //    而**白相一樣有 sha256、size 一樣夾得過**，所以我哋成套對數捉唔到佢。
  //    唔喺呢度捉，就會變成「畫面出綠色勾，返到公司先發現係白相」。
  try {
    if (samplesLookUniform(samplePixels(context, size.width, size.height))) {
      return keepOriginal('畫出嚟一片空白（可能撞到部機嘅相片尺寸上限）', file)
    }
  } catch {
    return keepOriginal('證實唔到張相真係影到嘢', file)
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob || blob.size <= 0) return keepOriginal('壓縮相片失敗', file)

  if (looksBlankBySize(blob.size, size.width, size.height)) {
    return keepOriginal('壓完細到唔似一張真相（可能係一片空白）', file)
  }

  // 壓完仲大過原本，而且根本冇縮過 —— 咁就唔值得用壓縮嗰份。
  if (blob.size >= file.size && !size.scaled) {
    return keepOriginal('壓完冇細過原本張相', file)
  }

  return { blob, fallback: '' }
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
export async function mirrorPhoto(
  accessToken: string,
  photoId: string,
  compressFallback = '',
): Promise<MirrorResult> {
  const base = photoWorkerBase()
  if (base === '') return { ok: false, message: WORKER_MISSING_MESSAGE }

  try {
    const response = await fetch(`${base}/mirror`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ photoId, compressFallback }),
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
