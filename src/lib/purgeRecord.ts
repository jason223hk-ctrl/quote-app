import { WORKER_MISSING_MESSAGE } from './photoTransport'
import type { HalfPurgedRecord } from './halfPurged'
import type { PendingPhoto } from './photoUpload'

/**
 * P8 步 4：刪工程之後，叫 Worker `/purge` **真係清走雲端兩份相**，
 * ⭐ 全部清完先至刪部機（IndexedDB）嗰份。**純邏輯，⛔ 唔掂 React。**
 *
 * ⛔⛔ 次序（同 `worker/src/purge.mjs` 檔頭同一條，⛔ 唔准調轉）：
 *
 *   ① 問准 → ② R2 刪 bytes → ③ Drive 掉垃圾桶 → ④ stamp `purged_at`   ← 全部喺 Worker
 *   ⑤ 部機 IndexedDB                                                     ← 呢個檔，⭐ 最尾
 *
 * ⭐ ⑤ 點解一定要最尾（計劃書 §5「三道閘」第 3 道）：
 *   中間任何一步死咗，部機嗰份**仲喺度** ⇒ 仲救得返。
 *   ⇒ ⛔ **淨係 Worker 回 `ok: true`（冇 failed、冇 hitLimit）先准郁部機。**
 *   ⇒ ⛔ 清咗一半、冇網、401、404、唔識嘅回覆 —— **部機一張都唔刪**。
 *
 * ⛔ 呢度⛔ 冇 cron、⛔ 冇背景自動重試：淨係喺**人撳咗掣、有網、有 token** 嗰陣行
 *   （CLAUDE.md §2.9：Worker 行用家自己個 token，半夜冇人嘅 token）。
 */

/** Worker `/purge` 200 回覆（`worker/src/worker.mjs` `purgeRecord()`）。 */
export type PurgeResponse = {
  ok: boolean
  purged: number
  alreadyDone: number
  nothingToClear: number
  remaining: number
  hitLimit: boolean
  failed: { photoId: string; why: string }[]
  /** ⭐ 2026-10-03：Drive 工程資料夾點處理（Worker 新版先有）。⛔ 唔影響 `ok`。 */
  folder?: { status: string; trashedFiles?: number; why?: string }
  message: string
}

/** 叫一次 `/purge` 嘅結果。⛔ `stop` ＝ 今次唔好再叫（一定要人睇）。 */
export type PurgeCallOutcome =
  | { kind: 'batch'; body: PurgeResponse }
  | { kind: 'stop'; message: string }

/**
 * 一按「永久刪除」（或者「繼續清」）最多叫幾多次 `/purge`。
 *
 * ⚠️⚠️ `worker/src/purge.mjs` 寫住：「邊日真係加返一個自動重試，⛔ 唔准淨係加返個常數
 *    —— 要連埋『邊度真係讀佢』同一條會紅嘅測試一齊加。」
 *    ⇒ 讀佢嘅係下面 `purgeRecordFully()`；測試喺 `purgeRecord.test.ts`
 *      「撞到上限就停，⛔ 唔准報成功」。
 *
 * ⭐ 呢個 loop **⛔ 唔係「失敗再試」**：淨係 Worker 回 `hitLimit: true`
 *   （一批做唔晒、而**今批冇任何一張失敗**）先會叫下一批。
 *   ⛔ 有任何一張失敗 ⇒ 即刻停，交返人撳「繼續清」（CO 2026-09-20 揀咗「一粒掣」）。
 *
 * ⚠️ AI 代揀，待 Jason 確認：20 批 × `PURGE_BATCH_MAX`（10）＝ 一次最多 200 張。
 *    多過 200 張嘅工程會停低、講明未清完、要人再撳一次。
 */
export const PURGE_ROUNDS_MAX = 20

/** 唔識嘅回覆 ⇒ ⛔ 唔准估（CLAUDE.md §2.6 表第三行）。 */
function unknownReply(detail: string): string {
  return `相片服務回覆了一個看不懂的結果（${detail}），未能確認相片是否已經清走。本裝置的相片副本仍然保留。請截圖並聯絡 Jason。`
}

export const PURGE_OFFLINE_MESSAGE =
  '現在連不上相片服務（可能沒有網絡），雲端相片未清走。工程已經刪除；本裝置的相片副本仍然保留。請回到有網絡的地方，在「設定 → 診斷資料」點擊「繼續清」。'

export const PURGE_LOGIN_MESSAGE =
  '登入已經過期，雲端相片未清走。本裝置的相片副本仍然保留。請登出再登入，然後在「設定 → 診斷資料」點擊「繼續清」。'

/**
 * ⛔⛔ 404 有兩種，⛔ 唔准合埋（CLAUDE.md §2.6）：
 *   · `{ error: 'not found' }` ＝ **條路根本唔存在**（Worker 未 deploy `/purge`）⇒ 要 deploy
 *   · `{ ok: false, message }` ＝ 條路喺度，但**揾唔到嗰單工程** ⇒ 照出 Worker 句中文
 */
export const PURGE_NOT_INSTALLED_MESSAGE =
  '相片服務還未安裝清走相片的功能（/purge）。⛔ 沒有清走任何東西，本裝置的相片副本仍然保留。請截圖並聯絡 Jason（需要部署相片服務）。'

function isPurgeResponse(body: unknown): body is PurgeResponse {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    typeof b.ok === 'boolean' &&
    typeof b.purged === 'number' &&
    typeof b.hitLimit === 'boolean' &&
    Array.isArray(b.failed) &&
    typeof b.message === 'string'
  )
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/**
 * 叫一次 `/purge`。**⛔ 唔會 throw** —— 所有情況都變成一句中文。
 */
export async function callPurgeOnce(
  recordId: string,
  deps: { base: string; token: string | null; fetch: FetchLike },
): Promise<PurgeCallOutcome> {
  if (deps.base === '') return { kind: 'stop', message: WORKER_MISSING_MESSAGE }
  if (!deps.token) return { kind: 'stop', message: PURGE_LOGIN_MESSAGE }

  let response: Response
  try {
    response = await deps.fetch(`${deps.base}/purge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${deps.token}` },
      body: JSON.stringify({ recordId }),
    })
  } catch (caught) {
    console.error('[quote-app] purge: network error:', caught)
    return { kind: 'stop', message: PURGE_OFFLINE_MESSAGE }
  }

  const body: unknown = await response.json().catch(() => null)
  const message =
    typeof body === 'object' && body !== null && typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : null

  if (response.status === 200) {
    if (isPurgeResponse(body)) return { kind: 'batch', body }
    console.error('[quote-app] purge: malformed 200 body:', body)
    return { kind: 'stop', message: unknownReply('200') }
  }

  console.error('[quote-app] purge failed:', response.status, body)
  if (response.status === 401) return { kind: 'stop', message: PURGE_LOGIN_MESSAGE }
  if (response.status === 404 && message === null) {
    return { kind: 'stop', message: PURGE_NOT_INSTALLED_MESSAGE }
  }
  if (message !== null) {
    return { kind: 'stop', message: `${message} 本裝置的相片副本仍然保留。` }
  }
  return { kind: 'stop', message: unknownReply(String(response.status)) }
}

export type PurgeRunDeps = {
  callOnce: (recordId: string) => Promise<PurgeCallOutcome>
  /** 部機呢一單嘅相。 */
  listLocal: (recordId: string) => Promise<PendingPhoto[]>
  /** 真刪部機嗰份。⛔ 只會喺雲端全部清完之後叫。 */
  removeLocal: (operationIds: string[]) => Promise<number>
}

export type PurgeRunResult = {
  /** ⛔ 淨係「雲端全部清完 ＋ 部機刪埋」先係 `true`。 */
  ok: boolean
  /** 今次（所有批）清走咗幾多張。 */
  purged: number
  /** 部機刪咗幾多張。⛔ `ok: false` 一定係 0。 */
  localRemoved: number
  message: string
}

/** 一批入面有相清唔到。⛔ 照出 Worker 每個原因（去重），例如 `not_yours` 嗰句。 */
function failureMessage(body: PurgeResponse): string {
  const whys = [...new Set(body.failed.map((item) => item.why).filter((why) => why !== ''))].slice(0, 3)
  const reason = whys.length > 0 ? `原因：${whys.join('；')}` : ''
  return `工程已經刪除。${body.message}${reason} 本裝置的相片副本仍然保留。`
}

/**
 * 清一單工程嘅相，**清到完為止（或者撞到問題即停）**。
 *
 * ⛔⛔ 三條鐵律：
 *   1. `hitLimit: true` 而**冇失敗** ⇒ 叫下一批（最多 `PURGE_ROUNDS_MAX` 批）。
 *   2. **任何一張失敗**、任何非 200、冇網 ⇒ 即刻停，`ok: false`，⛔ 唔准講成功。
 *   3. ⑤ 部機嗰份 **淨係喺 Worker 回 `ok: true` 之後先刪**。
 */
export async function purgeRecordFully(
  recordId: string,
  deps: PurgeRunDeps,
  maxRounds: number = PURGE_ROUNDS_MAX,
): Promise<PurgeRunResult> {
  let purged = 0
  let finalMessage = ''

  for (let round = 1; ; round += 1) {
    const outcome = await deps.callOnce(recordId)
    if (outcome.kind === 'stop') {
      return { ok: false, purged, localRemoved: 0, message: outcome.message }
    }
    const body = outcome.body
    purged += body.purged

    if (body.failed.length > 0) {
      return { ok: false, purged, localRemoved: 0, message: failureMessage(body) }
    }
    if (body.ok) {
      // ⭐ 資料夾執唔到⛔ 唔算失敗（相已經清晒），但要留低線索。
      if (body.folder && (body.folder.status === 'error' || body.folder.status === 'unknown')) {
        console.error('[quote-app] purge: drive job folder not cleared:', body.folder)
      }
      finalMessage = body.message
      break
    }
    if (!body.hitLimit) {
      // ⛔ `ok: false` 但又冇失敗、又冇 hitLimit —— 唔應該發生 ⇒ ⛔ 唔准估。
      return { ok: false, purged, localRemoved: 0, message: unknownReply('ok=false') }
    }
    if (body.purged === 0) {
      // ⛔ 冇進展仲叫落去就係一個死 loop。
      return { ok: false, purged, localRemoved: 0, message: unknownReply('hitLimit 但沒有進展') }
    }
    if (round >= maxRounds) {
      return {
        ok: false,
        purged,
        localRemoved: 0,
        message: `工程已經刪除。這一單相片太多，今次已清走 ${purged} 張，尚有 ${body.remaining} 張未處理。本裝置的相片副本仍然保留。請再點擊一次「繼續清」。`,
      }
    }
  }

  // ── ⑤ 部機 —— ⭐ 雲端已經確認清晒，先至郁 ──────────────────────
  let localRemoved = 0
  try {
    const local = await deps.listLocal(recordId)
    const ids = local.filter((item) => item.recordId === recordId).map((item) => item.operationId)
    localRemoved = await deps.removeLocal(ids)
  } catch (caught) {
    console.error('[quote-app] purge: cannot remove local copies:', caught)
    return {
      ok: false,
      purged,
      localRemoved: 0,
      message: `雲端相片已經清走，但本裝置的相片副本刪除失敗。請截圖並聯絡 Jason。`,
    }
  }

  const localBit = localRemoved > 0 ? `本裝置的 ${localRemoved} 張副本亦已刪除。` : ''
  return { ok: true, purged, localRemoved, message: `${finalMessage}${localBit}` }
}

/** 畫面用嘅兩樣嘢，綁埋一個 type（`HomePage` 砌，設定頁同刪除彈窗用）。 */
export type PurgeApi = {
  /** 清一單（⛔ 嗰單一定要已經軟刪咗）。⛔ 唔會 throw。 */
  run: (recordId: string) => Promise<PurgeRunResult>
  /** 「刪咗一半」嗰批。⛔ 失敗要 throw。 */
  listHalfPurged: () => Promise<HalfPurgedRecord[]>
}
