import { MITIGATION_OPTIONS } from './options'
import type { QuotePhoto } from './photos'

/**
 * 同步頁嘅純邏輯。**唔掂 DB、唔掂 React** —— 咁先測得到。
 *
 * 規格：`docs/P3f-全app版面-實作計劃.md` §3.10。
 *
 * ⭐⭐ 一條規矩管住成個檔：**「未上到」同「上唔到」係兩件事**。
 *    待同步 ＝ 系統仲會自己搞掂，人唔使做嘢。
 *    同步失敗 ＝ 要人睇。
 *    ⛔ 兩者溝埋一齊嘅話，同事日日見到一個橙色數字，好快就當佢唔存在。
 */

export type PhotoSyncState = 'synced' | 'pending' | 'failed'

/**
 * 一張相而家係咩狀態。**只睇 DB**，⛔ 唔睇本機記住嘅重試次數 ——
 * 因為呢一版係「成間公司」嘅總覽，第二部機影嘅相一樣要數得到。
 *
 * ⚠️ 次序好緊要：**先睇成功**。一張相可以之前失敗過（`drive_error` 有字），
 * 之後重試成功（`drive_synced_at` 有值）——⛔ 嗰陣唔可以當佢仲係失敗。
 */
export function photoSyncState(row: QuotePhoto): PhotoSyncState {
  if (row.drive_synced_at !== null) return 'synced'
  if (row.drive_error.trim() !== '' || row.r2_error.trim() !== '') return 'failed'
  return 'pending'
}

export type SyncCounts = { synced: number; pending: number; failed: number }

export function syncCounts(rows: QuotePhoto[]): SyncCounts {
  const counts: SyncCounts = { synced: 0, pending: 0, failed: 0 }
  for (const row of rows) {
    if (row.deleted_at !== null) continue
    counts[photoSyncState(row)] += 1
  }
  return counts
}

/** 全部相都掂 ＝ 冇待同步、冇失敗。⛔ 一張相都冇都算掂。 */
export function allDone(counts: SyncCounts): boolean {
  return counts.pending === 0 && counts.failed === 0
}

export type RecordSync = {
  recordId: string
  counts: SyncCounts
}

/** 逐個工程一行。⛔ 一張相都冇嘅工程唔出 —— 冇嘢好同步。 */
export function byRecord(rows: QuotePhoto[]): RecordSync[] {
  const map = new Map<string, QuotePhoto[]>()
  for (const row of rows) {
    if (row.deleted_at !== null) continue
    const list = map.get(row.record_id)
    if (list) list.push(row)
    else map.set(row.record_id, [row])
  }
  return [...map.entries()].map(([recordId, list]) => ({
    recordId,
    counts: syncCounts(list),
  }))
}

/**
 * 最後一次成功同步係幾時。⛔ 冇成功過就回 null（唔可以出「1970」）。
 */
export function lastSyncedAt(rows: QuotePhoto[]): string | null {
  let latest: string | null = null
  for (const row of rows) {
    const at = row.drive_synced_at
    if (at === null) continue
    if (latest === null || at > latest) latest = at
  }
  return latest
}

/**
 * 一張相喺失敗清單度點寫個位置。
 *
 * ⛔ 環境相唔屬於任何一棵樹，所以⛔ 唔可以出一個空白樹牌。
 */
export function photoWhere(row: QuotePhoto, treeNo: string | null): string {
  if (row.tree_id === null) return '環境相'
  const tag = treeNo === null || treeNo.trim() === '' ? '（未填樹牌）' : treeNo
  if (row.mitigation === null) return `${tag}・全景相`
  // ⛔ 唔可以出 `removal` 呢啲代號 —— 前線同事讀唔明，佢會當個 app 壞咗。
  const label = MITIGATION_OPTIONS.find((option) => option.value === row.mitigation)?.label
  return `${tag}・${label ?? row.mitigation}`
}

/**
 * 失敗清單第二行：**你使唔使做嘢**。
 *
 * ⭐⭐ 呢個係成個檔最重要嗰一句 —— tree app 用血換返嚟嘅教訓
 * （`src/domain/photoHealth.ts` 開頭）：淨係列一句錯誤原文，
 * 同事唔會覺得「有一張相有事」，佢會覺得「個系統壞咗」，然後唔再信個 app。
 *
 * ⚠️ 判斷只可以睇**我哋自己寫入去嗰啲**錯誤 —— 嗰四句係 worker 明文寫嘅
 * （`worker/src/worker.mjs`：砌唔到檔名、撞檔名、對唔到大細）。
 * 其餘全部係 exception 原文，格式冇保證。
 *
 * ⛔⛔ 分唔到類就一律當「要人睇」。⛔ 唔准出「無需處理」——
 *    一句「唔使理」係一個**指示**：佢叫一個本來應該出聲嘅人唔好出聲。
 */
export type SyncAdvice = { text: string; permanent: boolean }

export function syncAdvice(row: QuotePhoto): SyncAdvice {
  const message = row.drive_error.trim() !== '' ? row.drive_error : row.r2_error

  // worker 自己寫嘅永久性錯誤，四句都以「請截圖搵 Jason。」收尾。
  if (message.includes('搵 Jason')) {
    return {
      permanent: true,
      text: '需要處理：呢個問題唔會自己好返。請截圖，用 WhatsApp 搵 Jason。',
    }
  }

  // Google 明講額滿／冇權限 —— 重試幾多次都係一樣。
  if (/storageQuota|quotaExceeded|403|insufficientPermissions|401/i.test(message)) {
    return {
      permanent: true,
      text: '需要處理：Google Drive 嗰邊唔收（額滿或者冇權限）。請截圖，用 WhatsApp 搵 Jason。',
    }
  }

  // 認得出係一時三刻嘅網絡／伺服器問題先講「唔使做嘢」。
  if (/50\d|timeout|timed out|network|fetch failed|ECONN/i.test(message)) {
    return {
      permanent: false,
      text: '無需處理。相片已安全存入雲端，系統會自動再試。',
    }
  }

  // ⛔ 落唔到類 ＝ 我哋唔知，⛔ 唔係冇事。
  return {
    permanent: true,
    text: '需要處理：系統認唔出呢個錯誤。請截圖，用 WhatsApp 搵 Jason。',
  }
}

/** `tree_id` → 樹牌號。⛔ 搵唔到就係 null（唔知），⛔ 唔准當佢係空白樹牌。 */
export function treeNoMap(trees: { id: string; tree_no: string }[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const tree of trees) map[tree.id] = tree.tree_no
  return map
}
