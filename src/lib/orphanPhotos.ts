import type { QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'

/**
 * 孤兒相 —— 母單軟刪咗、但啲相仲喺度嗰啲。**純邏輯，唔掂 DB、唔掂 React。**
 *
 * ⚠️ 點解會有呢種相：`records.list()` 喺 server 側就隔走 `deleted_at`
 *    （`CLAUDE.md` §2.1 零真刪），但 `photos.listAll()` 淨係隔走**相自己**嗰個
 *    `deleted_at` —— ⛔ 佢完全冇睇母單。所以刪一單，佢啲相就變咗冇人認。
 *
 * ⭐⭐ **孤兒相分兩類，⛔ 唔准一刀切**（2026-09-13 改嘅規格）：
 *
 *   **甲類 · 母單刪咗 ＋ 至少有一份雲端副本（R2 或者 Drive）**
 *     ⇒ ⭐ 收得埋：唔入同步頁三個數、唔入失敗清單。
 *     ⚠️ 佢安全，係因為**張相已經喺雲端** —— 收埋嘅只係一個提示，唔係張相。
 *
 *   **乙類 · 母單刪咗 ＋ 一份雲端副本都冇**
 *     ⇒ ⛔⛔ **絕對唔准收埋、⛔ 絕對唔准停重試。**
 *     ⚠️ 呢啲相**全世界唯一一份喺阿耀部手機入面**。收埋就等於
 *     「唯一一份喺部機度，而我哋自己閂咗個提示」——⭐ 部機一跌就永遠冇咗。
 *
 * ⛔⛔ 點解要分：原本嗰版一刀切「母單刪咗就唔重試、唔入數」。
 *    ⚠️ 2026-09-13 真機截圖顯示同一部機**同時**有「1 張未能複製到 Drive」
 *    同埋底 bar「未上載 4 張」——嗰 4 張按定義係**R2 同 Drive 都冇**。
 *    一刀切落去，嗰 4 張就會即刻喺畫面消失，而佢哋正正係唯一一份。
 *
 * ⭐ 甲類收埋之後唔准就咁不見 —— 設定頁一行「另有 N 張相屬於已刪工程」
 *    就係嗰個保險：**令「收埋」變成「數得出」**。
 */

/**
 * 而家仲攞得返嘅工程 id。
 *
 * ⛔⛔ **回 `null` ＝ 我哋唔知**（清單未載完、或者攞唔到）。
 *    ⚠️ 呢個分別係救命嘅：一個**空清單**同一個**未載到嘅清單**，
 *    喺 `Set` 度睇落一模一樣 —— 當咗後者係前者，就會**成部機所有相**
 *    一次過被當成孤兒，⛔ 全部停止重試。
 *    ⇒ 所以 `null` 嗰陣，下面每一個判斷都係「唔係孤兒」。
 */
export function liveRecordIds(records: { id: string }[]): Set<string> {
  return new Set(records.map((record) => record.id))
}

/**
 * 呢張相嘅母單係咪已經冇咗。
 *
 * ⛔ `live` 係 `null`（唔知）⇒ 一律回 `false`。⛔ 唔准「唔知」當「刪咗」。
 */
export function isOrphan(recordId: string, live: Set<string> | null): boolean {
  // ⛔ 用 `!live` 唔用 `=== null`：一個 `Set` 永遠係 truthy，所以呢句
  //    連「有人漏傳咗個 prop（`undefined`）」都一齊當「唔知」。
  //    ⚠️ 呢個位一錯就係全部相停止重試，⛔ 唔值得慳嗰半個 case。
  if (!live) return false
  return !live.has(recordId)
}

/**
 * DB 嗰行有冇雲端副本。
 *
 * ⛔⛔ **兩個時間戳有一個唔係 null 先算數**，⛔ 唔准淨係睇 `r2_key` ——
 *    `r2_key` 係「打算擺喺邊」，⚠️ **唔係「已經擺咗喺度」**。
 *    寫錯呢一句嘅後果係：一張**其實冇上到**嘅相被當成「安全」而收埋。
 *
 * ⭐ 唔肯定嗰陣一律當**冇**副本 —— 保守方向就係「照樣顯示、照樣重試」，
 *    ⛔ 而唔係「收埋佢」。
 */
export function hasCloudCopy(row: QuotePhoto): boolean {
  return row.r2_synced_at !== null || row.drive_synced_at !== null
}

/**
 * 部機嗰張有冇雲端副本。
 *
 * ⭐ `uploaded` ＝ R2 對完數、DB 寫咗行（`autoResume` / `PhotoSlot` 先會寫呢個字）。
 * ⛔ `local` / `uploading` / `error` 一律當**冇** —— 呢啲就係乙類。
 */
export function pendingHasCloudCopy(item: PendingPhoto): boolean {
  return item.status === 'uploaded'
}

/**
 * DB 嗰批行：分開「收得埋」（甲類）同「一定要照出」。
 *
 * ⛔ 收得埋 ＝ **母單刪咗 而且 有雲端副本**。兩個條件缺一都要照出。
 */
export function splitOrphanRows(
  rows: QuotePhoto[],
  live: Set<string> | null,
): { kept: QuotePhoto[]; hidden: QuotePhoto[] } {
  const kept: QuotePhoto[] = []
  const hidden: QuotePhoto[] = []
  for (const row of rows) {
    if (isOrphan(row.record_id, live) && hasCloudCopy(row)) hidden.push(row)
    else kept.push(row)
  }
  return { kept, hidden }
}

/**
 * 部機嗰批：分開「收得埋」（甲類）同「一定要照出」。
 *
 * ⛔⛔ 一張**未上到雲端**嘅相，就算母單刪咗都**照樣入 `kept`** ——
 *    即係佢仍然入「未上載 N 張」、仍然會重試。**呢個係乙類嘅命根。**
 */
export function splitOrphanPending(
  items: PendingPhoto[],
  live: Set<string> | null,
): { kept: PendingPhoto[]; hidden: PendingPhoto[] } {
  const kept: PendingPhoto[] = []
  const hidden: PendingPhoto[] = []
  for (const item of items) {
    if (isOrphan(item.recordId, live) && pendingHasCloudCopy(item)) hidden.push(item)
    else kept.push(item)
  }
  return { kept, hidden }
}

/**
 * 一共幾多張**收咗埋**嘅孤兒相 —— **設定頁嗰行細字個 N**。
 *
 * ⛔⛔ 呢個數**只數甲類**（母單刪咗＋有雲端副本），⚠️ 因為佢哋先係
 *    「喺畫面消失咗」嗰批。**乙類⛔ 唔喺呢度數** —— 佢哋仲喺
 *    「未上載 N 張」同同步頁度企硬，⭐ 數兩次反而會令人以為有兩批嘢。
 *
 * ⭐ DB 同部機兩邊夾埋，**用影相編號去重** —— 同一張相通常兩邊都有，
 * ⛔ 唔去重就會數多一倍，而一個明顯錯嘅數會令人唔信成行嘢。
 *
 * ⚠️ `live` 係 `null`（唔知）⇒ 回 `0`。⛔ 唔知就唔好報一個數出嚟。
 */
export function orphanPhotoCount(
  rows: QuotePhoto[],
  items: PendingPhoto[],
  live: Set<string> | null,
): number {
  if (!live) return 0
  const seen = new Set<string>()
  for (const row of splitOrphanRows(rows, live).hidden) seen.add(row.operation_id)
  for (const item of splitOrphanPending(items, live).hidden) seen.add(item.operationId)
  return seen.size
}

/**
 * 設定頁嗰行字。**N 係零就回 `null`（成行唔出）。**
 *
 * ⛔⛔ 呢行**唔係一個警告**，係一行俾 Jason 查嘅細字（Jason 2026-09-12 講明）：
 *   · ⛔ 唔准做成要人處理嘅樣（唔紅、冇驚嘆號、冇「需要處理」）
 *   · ⛔ 唔准有得撳走
 *   · ⛔ 唔准擺喺阿耀日常會撞到嘅位 —— 佢喺設定頁最底嘅「診斷資料」度
 *
 * ⭐ 佢存在嘅唯一理由：**令「收埋」唔等於「靜靜咁消失」。**
 */
export function orphanNote(count: number): string | null {
  if (count <= 0) return null
  return `另有 ${count} 張相屬於已刪工程`
}
