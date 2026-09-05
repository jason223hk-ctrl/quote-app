import {
  digestMatches,
  digestMismatchMessage,
  SlotSeqTakenError,
  type PhotoInsert,
  type QuotePhoto,
} from './photos'

/** 未上到雲端、暫時淨係喺部機嗰張相。 */
export type PendingPhoto = {
  /** 影相編號。同 R2 檔名、同 quote_photos 嗰行嘅 operation_id 係同一個。 */
  operationId: string
  recordId: string
  /** ⛔ null ＝ 環境相。 */
  treeId: string | null
  /** ⛔ null ＝ 全景相。 */
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
  /** 問 DB 攞呢一格下一個號。⛔ 前端唔准自己數（`P3c-計劃書.md` D1）。 */
  allocateSeq: (
    recordId: string,
    treeId: string | null,
    mitigation: string | null,
  ) => Promise<number>
  saveRow: (input: PhotoInsert) => Promise<QuotePhoto>
  /** 等一等先再試。測試餵一個即刻 resolve 嘅版本入嚟，唔使真係等。 */
  wait?: (ms: number) => Promise<void>
}

/**
 * 派號撞咗最多再試幾多次，同埋每次之間等幾耐（`P3c-計劃書.md` §5.5）。
 *
 * ⛔⛔ 唔准無限重試。三次係按「同一格同時有兩部機」計 —— 兩部機互相讓一次就夠。
 * ⚠️ 真機見到三次都唔夠，返嚟講，⛔ 唔准自己加大個數。
 */
export const SEQ_MAX_TRIES = 3
export const SEQ_BACKOFF_MS = [200, 400]

/** 三次都排唔到號。⛔ 一個具體動作 ＋ 一個具體對象。 */
export const SEQ_EXHAUSTED_MESSAGE =
  '呢張相排唔到號，可能有人同時影緊同一格。相仲喺部機同雲端度，唔會冇咗。請撳「再試一次」，或者截圖搵 Jason。'

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
 * 連唔到伺服器嗰種錯。
 *
 * ⛔⛔ 2026-09-05 真機中過：畫面出「攞唔到上傳網址：Failed to fetch」。
 *    句嘢冇講錯，但對阿耀嚟講**等於亂碼** —— 佢淨係會覺得個 app 壞咗，
 *    而實情係「行開一步有網，撳返再試一次就得」（嗰次真係撳一下就上到）。
 *
 * ⚠️ 呢個判斷靠字串認，⛔ 唔靠估：瀏覽器唔會俾一個 error code 你。
 *    每個字串都係真係見過嘅：
 *      · `Failed to fetch`  —— Chrome／Android
 *      · `Load failed`      —— Safari／iOS
 *      · `NetworkError`     —— Firefox
 *      · `The Internet connection appears to be offline` —— iOS WKWebView
 *
 * ⛔ 認唔出就回 `null`，等上面照出原文 —— ⛔ 唔准包一句靚說話冚住一個
 *    我哋根本未見過嘅錯，嗰樣會令下次真出事嗰陣查唔到。
 */
export function isNetworkFailure(detail: string): boolean {
  return /failed to fetch|load failed|networkerror|network request failed|connection appears to be offline|err_internet_disconnected|err_network/i.test(
    detail,
  )
}

/** ⭐ 一個具體動作 ＋ 一個具體對象（`P3c-計劃書.md` §5.5 同一套規矩）。 */
export const OFFLINE_MESSAGE =
  '連唔到伺服器。相仲喺部機度，唔會冇咗。行去有訊號嘅地方，再撳「再試一次」。'

/**
 * 出一句畀人睇嘅錯誤。認得出係冇網就講人話，⛔ 認唔出就照出原文。
 */
function stepMessage(step: string, caught: unknown, compose: (detail: string) => string): string {
  const detail = failureMessage(step, caught)
  return isNetworkFailure(detail) ? OFFLINE_MESSAGE : compose(detail)
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
      message: stepMessage(
        'sign',
        caught,
        (detail) => `攞唔到上傳網址：${detail}。相仲喺部機度，唔會冇咗。`,
      ),
    }
  }

  const bytes = await item.blob.arrayBuffer()

  try {
    await deps.putBytes(signed.put, bytes, CONTENT_TYPE)
  } catch (caught) {
    return {
      ok: false,
      message: stepMessage(
        'putBytes',
        caught,
        (detail) => `上傳中斷：${detail}。相仲喺部機度，撳「再試一次」就得。`,
      ),
    }
  }

  let readBack: ArrayBuffer
  try {
    readBack = await deps.getBytes(signed.get)
  } catch (caught) {
    return {
      ok: false,
      message: stepMessage(
        'getBytes',
        caught,
        (detail) => `上傳咗但讀唔返出嚟核對：${detail}。未對到數就唔算上到，請再試一次。`,
      ),
    }
  }

  const actual = { size: readBack.byteLength, sha256: await deps.digest(readBack) }
  const expected = { size: item.size, sha256: item.sha256 }
  if (!digestMatches(expected, actual)) {
    console.error('[quote-app] photo digest mismatch:', { expected, actual })
    return { ok: false, message: digestMismatchMessage(expected, actual) }
  }

  // ⛔⛔ `seq` 由 **DB** 派，⛔ 唔准寫死。
  //
  // ⚠️ 2026-09-04 真機中過：呢度本來寫死 `seq: 1`，段註解仲寫住
  //    「P3a 一格得一張全景相，所以永遠係第一張」。但 Jason 2026-08-24 已經拍板
  //    環境相「想影幾多影幾多」、樹相一格亦都唔設上限 ⇒ 同一格第二張相又係 1，
  //    即刻撞 `quote_photos_slot_seq_uidx`。
  //    ⭐ 個 index 攔得啱（⛔ 冇寫兩行同號落去），係前端一直冇跟返 P3c 個做法。
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  for (let attempt = 0; attempt < SEQ_MAX_TRIES; attempt += 1) {
    let seq: number
    try {
      seq = await deps.allocateSeq(item.recordId, item.treeId, item.mitigation ?? null)
    } catch (caught) {
      // 派唔到號（多數係冇網）。⛔ 唔准自己填一個號頂住。
      return { ok: false, message: failureMessage('allocateSeq', caught) }
    }

    try {
      const row = await deps.saveRow({
        recordId: item.recordId,
        treeId: item.treeId,
        mitigation: item.mitigation ?? null,
        operationId: item.operationId,
        seq,
        r2Key: signed.key,
        sizeBytes: item.size,
        sha256: item.sha256,
        capturedAt: item.capturedAt,
      })
      return { ok: true, row, alreadyDone: false }
    } catch (caught) {
      // 撞號 ＝ 有人喺我派號同寫入之間霸咗呢個號。⛔ 唔當出錯，攞下一個號再試。
      if (caught instanceof SlotSeqTakenError) {
        const backoff = SEQ_BACKOFF_MS[attempt]
        if (backoff !== undefined) await wait(backoff)
        continue
      }
      // R2 已經有 bytes，但 DB 冇行。相唔會冇咗，重試會用返同一個編號蓋返同一個 key。
      return { ok: false, message: failureMessage('saveRow', caught) }
    }
  }

  // 三次都撞 ⇒ 終點狀態「有事要人睇」。⛔ 唔准靜靜咁再試落去。
  console.error('[quote-app] photo seq allocation exhausted:', item.operationId)
  return { ok: false, message: SEQ_EXHAUSTED_MESSAGE }
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
