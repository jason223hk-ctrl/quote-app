import { photoWorkerBase, WORKER_MISSING_MESSAGE } from './photoTransport'
import { clearPending, markFailed, markRunning, type KeyValueStore } from './renamePending'

/**
 * 改樹牌 ⇒ 叫 Worker `/rename-tree` 連 Drive 舊檔名一齊改（P3f §4，Jason 2026-08-24）。
 *
 * ⭐ Worker 2026-09-19 已經上線（Version 77d5eeb9）；呢度係前端嗰邊。
 *    畫面照原型 PR #84 預設：儲存時**等改完名先返**、超過 12 張**自動接住改**、
 *    失敗記喺**呢部機**（見 `renamePending.ts`）。
 *
 * ⛔ 新檔案，⛔ 冇改 `photoTransport.ts`（P3f §6 regression contract）。
 * ⛔ 呼叫之前 `quote_trees.tree_no` 要已經改好 —— Worker 讀 DB 個新樹牌，⛔ 唔收我哋傳名。
 */

export type RenameItem = { photoId: string; why: string }

export type RenameResponse = {
  ok: boolean
  treeNo?: string
  renamed: number
  hitLimit: boolean
  failed: RenameItem[]
  cannot: RenameItem[]
  message?: string
}

export type RenameOutcome =
  | { ok: true; renamed: number }
  | { ok: false; left: number | null; reasons: string[]; hitLimit: boolean }

/** 樹牌真係變咗先要改 Drive 檔名（頭尾空格唔算）。 */
export function needsDriveRename(before: string, after: string): boolean {
  return before.trim() !== after.trim()
}

/** 自動接住改最多幾轉（每轉最多 12 張 ⇒ 60 張）。⛔ 唔係失敗重試 —— 有失敗即刻停。 */
export const RENAME_ROUNDS_MAX = 5

export const RENAME_UNREACHABLE = '無法連接 Drive 改名服務，請檢查網絡後點擊「再試」。'

const HAS_CHINESE = /[\u3400-\u9fff]/

/**
 * 叫一次 Worker。⛔ 網絡／HTTP 出錯一律 throw 一句中文
 * （⚠️ 英文細節淨係入 console，⛔ 唔出畫面 —— AI 代揀，待 Jason 確認）。
 */
export async function callRenameTree(
  accessToken: string,
  treeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RenameResponse> {
  const base = photoWorkerBase()
  if (base === '') throw new Error(WORKER_MISSING_MESSAGE)

  let response: Response
  try {
    response = await fetchImpl(`${base}/rename-tree`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ treeId }),
    })
  } catch (caught) {
    console.error('[quote-app] rename-tree unreachable:', caught)
    throw new Error(RENAME_UNREACHABLE)
  }
  const body = (await response.json().catch(() => null)) as Partial<RenameResponse> | null
  if (!response.ok || body === null) {
    const detail = body?.message ?? `HTTP ${response.status}`
    console.error('[quote-app] rename-tree failed:', detail)
    // ⭐ Worker 自己寫好嘅中文（例如 404「無法檢索這棵樹」）照出；英文就用我哋嗰句。
    throw new Error(typeof body?.message === 'string' && HAS_CHINESE.test(body.message) ? body.message : RENAME_UNREACHABLE)
  }
  return {
    ok: body.ok === true,
    treeNo: body.treeNo,
    renamed: Number(body.renamed ?? 0),
    hitLimit: body.hitLimit === true,
    failed: Array.isArray(body.failed) ? body.failed : [],
    cannot: Array.isArray(body.cannot) ? body.cannot : [],
    message: body.message,
  }
}

/**
 * 叫到改完為止：`hitLimit` 而冇失敗 ⇒ 自動叫下一轉（最多 `RENAME_ROUNDS_MAX`）。
 * ⛔ 有任何失敗／算唔到名 ⇒ 即刻停，交返人撳「再試」。⛔ 唔 throw。
 */
export async function renameUntilDone(
  call: () => Promise<RenameResponse>,
  roundsMax = RENAME_ROUNDS_MAX,
): Promise<RenameOutcome> {
  let renamed = 0
  for (let round = 1; ; round += 1) {
    let res: RenameResponse
    try {
      res = await call()
    } catch (caught) {
      const why = caught instanceof Error ? caught.message : String(caught)
      return { ok: false, left: null, reasons: [why], hitLimit: false }
    }
    renamed += res.renamed
    if (res.ok) return { ok: true, renamed }

    const stuck = [...res.failed, ...res.cannot]
    if (res.hitLimit && stuck.length === 0 && round < roundsMax) continue

    // ⭐ 撞名嗰句（中文）照出；Drive 回嚟嘅英文錯誤⛔ 唔出（淨係計張數）。
    const reasons = [...new Set(stuck.map((item) => item.why).filter((why) => HAS_CHINESE.test(why)))]
    return {
      ok: false,
      // ⚠️ hitLimit 之下「仲有幾多張未改」Worker ⛔ 冇回 ⇒ 唔知就寫 null，⛔ 唔估。
      left: res.hitLimit ? null : stuck.length,
      reasons,
      hitLimit: res.hitLimit,
    }
  }
}

/**
 * 成套：先記「改名中」→ 叫 Worker → 成功清、失敗記低。⛔ 唔 throw
 * （改名失敗⛔ 唔准令「儲存樹」變失敗 —— 樹牌已經存咗）。
 */
export async function renameTreeFiles(
  args: { accessToken: string; treeId: string; recordId: string; treeNo: string },
  deps: { call?: () => Promise<RenameResponse>; store?: KeyValueStore | null; now?: () => Date } = {},
): Promise<RenameOutcome> {
  const now = deps.now ?? (() => new Date())
  const call = deps.call ?? (() => callRenameTree(args.accessToken, args.treeId))
  markRunning({ treeId: args.treeId, recordId: args.recordId, treeNo: args.treeNo }, now(), deps.store)
  const outcome = await renameUntilDone(call)
  if (outcome.ok) clearPending(args.treeId, deps.store)
  else markFailed(args.treeId, outcome, now(), deps.store)
  return outcome
}
