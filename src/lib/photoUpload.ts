import {
  digestMatches,
  digestMismatchMessage,
  type PhotoInsert,
  type QuotePhoto,
} from './photos'

/** 未上到雲端、暫時淨係喺部機嗰張相。 */
export type PendingPhoto = {
  /** 影相編號。同 R2 檔名、同 quote_photos 嗰行嘅 operation_id 係同一個。 */
  operationId: string
  recordId: string
  treeId: string
  capturedAt: string
  size: number
  sha256: string
  blob: Blob
  status: 'local' | 'uploading' | 'error' | 'uploaded'
  error: string
  attempts: number
}

export type SignedUrls = { key: string; put: string; get: string }

/**
 * 上傳要用到嘅外部世界，全部由外面餵入嚟。
 * 咁樣成條路可以喺測試度行真流程，唔使真係開相機、開網、開資料庫。
 */
export type UploadDeps = {
  /**
   * 攞簽名網址。**特登淨係俾影相編號，唔俾檔名** ——
   * 檔名由 Worker 用佢自己驗返嚟嘅用戶 id 砌，前端講咩都改唔到人哋個資料夾。
   */
  sign: (operationId: string, contentType: string) => Promise<SignedUrls>
  putBytes: (url: string, bytes: ArrayBuffer, contentType: string) => Promise<void>
  getBytes: (url: string) => Promise<ArrayBuffer>
  digest: (bytes: ArrayBuffer) => Promise<string>
  findRow: (operationId: string) => Promise<QuotePhoto | null>
  saveRow: (input: PhotoInsert) => Promise<QuotePhoto>
}

export type UploadResult =
  | { ok: true; row: QuotePhoto; alreadyDone: boolean }
  | { ok: false; message: string }

const CONTENT_TYPE = 'image/jpeg'

function failureMessage(step: string, caught: unknown): string {
  const detail = caught instanceof Error ? caught.message : String(caught)
  console.error(`[quote-app] photo upload failed at ${step}:`, detail)
  return detail
}

/**
 * 一張相由部機上到 R2 嘅成條路。
 *
 * 次序係特登嘅（`docs/P3-現場影相-設計.md` 第三章）：
 * 查有冇上過 → 攞簽名網址 → 上 bytes → **讀返出嚟對 size 同 sha256** → 寫 DB 一行。
 *
 * ⛔ 對唔到數就當失敗，唔准寫「已入 R2」。
 * ⛔ bytes 唔經 Worker —— `putBytes` / `getBytes` 直接同 R2 講。
 */
export async function uploadPending(
  item: PendingPhoto,
  deps: UploadDeps,
): Promise<UploadResult> {
  // 重試用返同一個影相編號，所以查得返 —— 唔會整兩行、亦唔會上多次。
  let existing: QuotePhoto | null
  try {
    existing = await deps.findRow(item.operationId)
  } catch (caught) {
    return { ok: false, message: failureMessage('findRow', caught) }
  }
  if (existing) return { ok: true, row: existing, alreadyDone: true }

  let signed: SignedUrls
  try {
    signed = await deps.sign(item.operationId, CONTENT_TYPE)
  } catch (caught) {
    return {
      ok: false,
      message: `攞唔到上傳網址：${failureMessage('sign', caught)}。相仲喺部機度，唔會冇咗。`,
    }
  }

  const bytes = await item.blob.arrayBuffer()

  try {
    await deps.putBytes(signed.put, bytes, CONTENT_TYPE)
  } catch (caught) {
    return {
      ok: false,
      message: `上傳中斷：${failureMessage('putBytes', caught)}。相仲喺部機度，撳「再試一次」就得。`,
    }
  }

  let readBack: ArrayBuffer
  try {
    readBack = await deps.getBytes(signed.get)
  } catch (caught) {
    return {
      ok: false,
      message: `上傳咗但讀唔返出嚟核對：${failureMessage('getBytes', caught)}。未對到數就唔算上到，請再試一次。`,
    }
  }

  const actual = { size: readBack.byteLength, sha256: await deps.digest(readBack) }
  const expected = { size: item.size, sha256: item.sha256 }
  if (!digestMatches(expected, actual)) {
    console.error('[quote-app] photo digest mismatch:', { expected, actual })
    return { ok: false, message: digestMismatchMessage(expected, actual) }
  }

  try {
    const row = await deps.saveRow({
      recordId: item.recordId,
      treeId: item.treeId,
      operationId: item.operationId,
      // P3a 一格得一張全景相，所以永遠係第一張 —— ⛔ 但係 1 唔係 0。
      seq: 1,
      r2Key: signed.key,
      sizeBytes: item.size,
      sha256: item.sha256,
      capturedAt: item.capturedAt,
    })
    return { ok: true, row, alreadyDone: false }
  } catch (caught) {
    // R2 已經有 bytes，但 DB 冇行。相唔會冇咗，重試會用返同一個編號蓋返同一個 key。
    return { ok: false, message: failureMessage('saveRow', caught) }
  }
}

/**
 * 壓縮之後嘅目標尺寸。長邊縮到 `maxEdge`，短邊按比例。
 * 本身已經細過 `maxEdge` 就唔放大 —— 放大只會變大份，唔會變清楚。
 */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest === 0) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
