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

/* ══════════════════════════════════════════════════════════════════
   乙類·卡死 —— ⭐ 唯一清得嘅嗰批（Jason 2026-09-14 拍板）
   ══════════════════════════════════════════════════════════════════

   **點解要開呢一段 —— ⛔ 唔准淨係記住結論**

   2026-09-14：Jason 加咗自己做 quote admin 之後，「未上載 4 張」
   終於郁 —— 三日嚟第一次，跌到 3 張。⭐ 證實咗係權限問題，⛔ 唔係上載邏輯。

   ⚠️ 但跟住佢**把所有工程都刪咗**，於是剩返嗰 3 張相**永遠傳唔到**：
   母單冇咗 ⇒ `can_edit_quote_record()` 永遠 false ⇒ insert 永遠俾人拒。
   而條 bar 照寫住「未上載 3 張」。

   ⭐⭐ **條 bar 冇壞** —— 佢係照上面「乙類⛔ 唔准收埋」嗰條規矩做。
      問題係：**呢個狀態冇出口。** 佢會一路數住幾張永遠都上唔到嘅相，
      而唯一嘅出路（改返母單）已經冇咗。⛔ 呢個係我哋設計嘅空白，
      唔係一個 bug —— ⚠️ 所以修法唔係改條 bar，係開一個出口。

   ⛔⛔ **範圍要死死地守住**：清得嘅**只有**「母單刪咗 ＋ 一份雲端副本都冇
      ＋ 資料庫一行都冇」。母單仲喺度嗰啲**一張都唔准清** ——
      ⚠️ 嗰啲仲有機會傳得到，而佢哋可能係全世界唯一一份。
*/

/**
 * 清得嘅嗰批。**三個條件缺一不可。**
 *
 * ⛔⛔ `live === null`（唔知邊啲工程仲喺度）⇒ **一張都唔准清**。
 *    ⚠️ 呢個係整段最重要嘅一句：清單未載完嗰陣，每一單睇落都「刪咗」——
 *    當咗真，就會一次過清走成部機所有未上載嘅相，⛔ 而且冇得返轉頭。
 *
 * ⛔ 第三個條件（資料庫一行都冇）係額外嘅保險：
 *    ⚠️ 部機話 `error`、但 DB 其實寫咗行，係有可能嘅（寫成功但覆返嚟嗰下斷咗）。
 *    ⭐ 嗰種情況雲端有嘢，⛔ 唔應該由呢度清 —— 寧願少清一張。
 *
 * ⚠️ **一句要老實講**：R2 度**可能**仲有一份 bytes（`uploadPending` 係
 *    先上 R2、後寫 DB 行）。⛔ 但冇咗 DB 行就冇任何嘢指得返去嗰個 key，
 *    成個 app 攞唔返。⭐ 所以確認嗰句照講「全世界只剩部機呢一份」——
 *    ⛔ 呢句係向**安全嗰邊**講多咗，唔係講少咗。
 */
export function strandedPending(
  items: PendingPhoto[],
  rows: QuotePhoto[],
  live: Set<string> | null,
): PendingPhoto[] {
  if (!live) return []
  const known = new Set(rows.map((row) => row.operation_id))
  return items.filter(
    (item) =>
      isOrphan(item.recordId, live) &&
      !pendingHasCloudCopy(item) &&
      !known.has(item.operationId),
  )
}

/** 幾多張清得。⛔ 同上面同一個判斷，⚠️ 唔准另外數一次 —— 兩個數唔同就係災難。 */
export function strandedCount(
  items: PendingPhoto[],
  rows: QuotePhoto[],
  live: Set<string> | null,
): number {
  return strandedPending(items, rows, live).length
}

/**
 * 設定頁嗰行字。**N 係零就回 `null`（⛔ 成行唔出，連粒掣都冇）。**
 *
 * ⛔⛔ 呢個唔係「暫時 disable」——**係根本冇呢樣嘢喺畫面上面**。
 *    ⚠️ 一粒平時就企喺度嘅「清相」掣，遲早有人得閒撳。
 */
export function strandedNote(count: number): string | null {
  if (count <= 0) return null
  return `有 ${count} 張相片無法上傳，而它們所屬的工程已經刪除`
}

/**
 * 兩段式第二段嗰句。⛔⛔ **唔准縮成「確定嗎」**（Jason 2026-09-14 原話）。
 *
 * ⭐ 三樣嘢缺一不可：**實數**、**「全世界只剩部機呢一份」**、**「清咗就真係冇」**。
 * ⚠️ 呢個係全 app **唯一**一個真刪（CLAUDE.md §2.1 零真刪講嘅係資料庫；
 *    呢啲相根本冇入過資料庫）—— ⭐ 所以句嘢要嚇得親人，⛔ 唔准客氣。
 */
export function strandedConfirm(count: number): string {
  return `這 ${count} 張相片全世界只剩本裝置這一份，清除後就真的沒有了。`
}

/**
 * ⛔⛔ **呢度以前有 `unsyncedInRecord()` 同 `deleteUnsyncedWarning()`。
 *    2026-09-15 拆走咗 —— ⛔ 唔准加返。**
 *
 * ⚠️ 佢哋係「刪工程之前講一句」嗰兩個，而嗰句嘢**冇取消，反而更重要咗**：
 *    ⭐ 而家由 `src/lib/purgeCounts.ts` 嘅 `onlyOnPhoneCount()` /
 *    `onlyOnPhoneWarning()` 做，措辭亦跟返 P8（「只剩部機呢一份⋯清咗就真正永遠冇咗」）。
 *
 * ⛔ 點解要拆：danger zone 拆走之後，呢兩個**一個叫佢嘅人都冇**，
 *    但佢哋同 `onlyOnPhone*` 講緊**同一件事**。
 *    ⚠️ 留住 ＝ 兩份文案，而其中一份冇人睇住 —— ⭐ `stuckAdvice()` 中過呢個病。
 */

