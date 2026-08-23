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
  /** 留空 = 全景格。有值 = 嗰個工序格。 */
  mitigation: string | null
  capturedAt: string
  size: number
  sha256: string
  blob: Blob
  status: 'local' | 'uploading' | 'error' | 'uploaded'
  error: string
  attempts: number
  /** Drive 鏡像試咗幾多次。⛔ 夠三次就唔再自動試（`docs/P3b-計劃書.md` §7.5）。 */
  driveAttempts?: number
  driveError?: string
  /**
   * 空 = 正常壓咗 2400/0.80。有值 = 壓唔到，張相係**原相**。
   * ⛔ 留返呢個原因係為咗**事後查得返邊幾張係 fallback**，唔使靠估。
   */
  compressFallback?: string
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
  /** 由 DB 派號。⛔ 前端唔准自己數。 */
  allocateSeq: (recordId: string, treeId: string | null, mitigation: string | null) => Promise<number>
  /** 重試之間等一等。抽出嚟係為咗測試唔使真係等。 */
  wait?: (ms: number) => Promise<void>
}

export type UploadResult =
  | { ok: true; row: QuotePhoto; alreadyDone: boolean }
  | { ok: false; message: string }

const CONTENT_TYPE = 'image/jpeg'

/** ⛔ 派號最多試三次。三次唔得就落終點狀態，唔會一路試落去。 */
export const MAX_SEQ_ATTEMPTS = 3

/**
 * 到頂之後嘅終點文案。
 * ⛔ 一個具體動作（撳「再試一次」）＋ 一個具體對象（同一格有人同時影緊）。
 * ⚠️ 相唔會冇咗 —— 佢已經喺部機同 R2，淨係未排到號。
 */
export const SEQ_GAVE_UP_MESSAGE =
  '呢張相排唔到號，可能有人同時影緊同一格。請撳「再試一次」，或者截圖搵 Jason。'

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

  // ⛔ 派號 → 寫行。撞到「個號俾人搶咗」就攞過一個新號再試。
  //    有上限、有終點 —— ⛔ 唔准無限重試（Jason 工作指引第三節第三點）。
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  for (let attempt = 1; attempt <= MAX_SEQ_ATTEMPTS; attempt += 1) {
    let seq: number
    try {
      seq = await deps.allocateSeq(item.recordId, item.treeId, item.mitigation)
    } catch (caught) {
      return { ok: false, message: failureMessage('allocateSeq', caught) }
    }

    try {
      const row = await deps.saveRow({
        recordId: item.recordId,
        treeId: item.treeId,
        mitigation: item.mitigation,
        operationId: item.operationId,
        seq,
        r2Key: signed.key,
        sizeBytes: item.size,
        sha256: item.sha256,
        capturedAt: item.capturedAt,
      })
      return { ok: true, row, alreadyDone: false }
    } catch (caught) {
      if ((caught as Error)?.name === 'SeqConflict' && attempt < MAX_SEQ_ATTEMPTS) {
        // 讓一讓，唔好連環撞。
        await wait(attempt * 200)
        continue
      }
      if ((caught as Error)?.name === 'SeqConflict') {
        console.error('[quote-app] seq conflict, gave up after', MAX_SEQ_ATTEMPTS)
        return { ok: false, message: SEQ_GAVE_UP_MESSAGE }
      }
      // R2 已經有 bytes，但 DB 冇行。相唔會冇咗，重試會用返同一個編號蓋返同一個 key。
      return { ok: false, message: failureMessage('saveRow', caught) }
    }
  }

  return { ok: false, message: SEQ_GAVE_UP_MESSAGE }
}

/**
 * 壓縮之後嘅目標尺寸。長邊縮到 `maxEdge`，短邊按比例。
 * 本身已經細過 `maxEdge` 就唔放大 —— 放大只會變大份，唔會變清楚。
 */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest === 0) return { width, height, scaled: false }
  const scale = maxEdge / longest
  return {
    // ⛔ 唔准縮到 0 —— 一條 1px 高嘅相都要留返最少 1px（跟 tree app `fitLongEdge`）。
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  }
}
