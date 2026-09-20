import type { QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'
import type { QuoteTree } from './trees'

/**
 * 「連帶消失：N 棵樹、N 張相」嗰兩個 N。**純邏輯，⛔ 唔掂 DB、⛔ 唔掂 React。**
 *
 * ⭐⭐ **點解呢兩個數而家係一件大事 —— ⛔ 唔准淨係記住結論**
 *
 * **Jason 2026-09-14 拍板：刪工程 ＝ 啲相真係清走（救唔返），
 * 資料庫嗰行工程留低、只標作已刪**（見 `docs/P8-真清相-計劃書.md`）。
 *
 * ⇒ 「連帶消失」呢句**以前係一句提示，而家係一個承諾** ——
 *    畫面寫幾多，就真係會冇幾多。⛔ 所以呢兩個數**唔准估**。
 *
 * ⛔⛔ **數唔到嗰陣，⛔ 唔准出 `0`。**
 *    ⚠️ 出 `0` 等於同人講「冇嘢會消失」，而嗰句可能係假嘅 ——
 *    ⭐ 而佢會喺一個**冇得反悔**嘅掣上面講。所以數唔到就回 `null`，
 *    由畫面攔住唔准撳（見 `canPurge()`）。
 *
 * ⭐ 呢個檔**唔理**「掉垃圾桶定真刪」、「Worker 點寫」嗰啲仲未拍板嘅嘢 ——
 *    ⚠️ 兩個 N 點數，⛔ 唔會因為嗰啲決定而變。所以佢行得先。
 */

export type PurgeCounts = {
  /** 呢一單仲喺度嘅樹。 */
  trees: number
  /** 呢一單「真係會冇咗」嘅相 —— 雲端同部機夾埋、⭐ 用影相編號去重。 */
  photos: number
}

/**
 * 數。**任何一樣攞唔到就回 `null`。**
 *
 * ⛔⛔ 三個參數嘅 `null` **全部代表「問唔到」**，⛔ 唔代表「一個都冇」。
 *    ⚠️ 呢個分別喺呢度係救命嘅：一個空 array 同一個未載到嘅清單，
 *    數出嚟都係 `0`，而 `0` 會令人撳落一個唔應該撳嘅掣。
 *
 * ⭐ **部機嗰批冇得讀**（`localStorageAvailable()` 係 false）嘅時候，
 *    叫嗰邊應該傳 **`[]`**，⛔ 唔係 `null` —— 嗰個情況係「呢部機根本冇本地相」，
 *    ⚠️ 唔係「讀失敗」。兩者要分得開。
 */
export function purgeCounts(
  recordId: string,
  trees: QuoteTree[] | null,
  rows: QuotePhoto[] | null,
  local: PendingPhoto[] | null,
): PurgeCounts | null {
  if (trees === null || rows === null || local === null) return null

  const liveTrees = trees.filter(
    (tree) => tree.record_id === recordId && tree.deleted_at === null,
  )

  /**
   * ⭐ 雲端同部機夾埋，用**影相編號**去重 —— 同一張相通常兩邊都有。
   * ⛔ 唔去重就會數多一倍，而一個明顯錯嘅數會令人唔信成句嘢。
   * （做法同 `orphanPhotoCount()` 一樣，⛔ 唔係另外諗一套。）
   */
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.record_id !== recordId) continue
    // ⛔ 已經軟刪咗嗰啲唔算 —— 佢哋喺畫面上面早就冇咗。
    if (row.deleted_at !== null) continue
    seen.add(row.operation_id)
  }
  for (const item of local) {
    if (item.recordId !== recordId) continue
    seen.add(item.operationId)
  }

  // ⚠️ 將來（P8 步 3）`quote_photos` 會多一個 `purged_at`。⛔ 到時要喺上面
  //    再隔走「已經清咗」嗰啲 —— 佢哋冇 bytes 剩，⛔ 唔應該再數落「會消失」。
  //    ⛔ 而家個 schema 冇呢個欄，所以呢度**冇扮有** —— 見計劃書 §7 步 3。

  return { trees: liveTrees.length, photos: seen.size }
}

/**
 * 彈窗嗰行字，**拆開三橛**。措辭照 Jason 2026-09-14 最終截圖逐字。
 *
 * ⭐⭐ **點解要拆橛 —— ⛔ 唔准淨係記住結論**
 *
 * 兩個 N 喺畫面上面係**紅色粗體**，所以 component 冇得就咁出一條字串。
 * ⚠️ 但如果 component 自己喺 JSX 度打多次「連帶消失：」，就會出現
 *    **兩份文案**：一份喺呢度（有測試睇住），一份喺畫面（冇人睇住）——
 *    ⭐ 改一份、另一份靜靜咁留喺度，就係 `stuckAdvice()` 中過嗰個病
 *    （對住一段自己抄落嚟嘅字串，文案一改就認唔返）。
 * ⇒ 所以**字喺呢度，component 淨係擺數字入去**。
 */
export const LOSS_PREFIX = '連帶消失：'
export const LOSS_TREES = ' 棵樹、'
export const LOSS_PHOTOS = ' 張相'

/** 同一句嘢嘅純字串版（測試、對數、log 用）。⛔ `null` ＝ 數唔到 ⇒ 唔出。 */
export function purgeCountsLabel(counts: PurgeCounts | null): string | null {
  if (counts === null) return null
  return `${LOSS_PREFIX}${counts.trees}${LOSS_TREES}${counts.photos}${LOSS_PHOTOS}`
}

/**
 * 撳唔撳得落「永久刪除」。
 *
 * ⛔⛔ 數唔到就**⛔ 唔准撳** —— ⚠️ 呢個係整個檔最重要嘅一句。
 *    一個冇得反悔嘅動作，⛔ 唔可以喺「我哋自己都唔知會冇幾多嘢」嘅情況下發生。
 *
 * ⭐ 呢個**唔係**「部機自己判斷邊個刪得」（PR #17 嗰條規矩講權限，
 *    話事嘅係 server）。呢度攔嘅係**我哋自己數唔到**，⚠️ 同權限冇關。
 */
export function canPurge(counts: PurgeCounts | null): boolean {
  return counts !== null
}

/**
 * 數唔到嗰陣出嘅話。⛔ 中文、⛔ 講得出下一步（CLAUDE.md §2.7）。
 */
export const CANNOT_COUNT_MESSAGE =
  '現在無法點算此單有多少棵樹和相片，⛔ 不會冒險刪除。請檢查網絡連線後再試；如果一直這樣，請截圖，並用 WhatsApp 聯絡 Jason。'

/**
 * 「只剩部機呢一份」嗰個 N —— **⛔ 同上面兩個 N 係兩件事。**
 *
 * ⭐ 上面「連帶消失」數嘅係**會冇咗幾多**；呢個數嘅係**入面有幾多張
 *    全世界得部機一份**（未傳上雲端）。
 *
 * ⚠️⚠️ 2026-09-14 先發現：`quote_photos` 寫唔入（RLS 拒絕）嗰啲相，
 *    R2 可能有 bytes 但冇 DB 行指得返去 ⇒ 成個 app 攞唔返。
 *    ⇒ `status !== 'uploaded'` 嗰啲，**部機呢一份就係全世界唯一一份**，
 *    一清就係**真正永遠冇咗** —— ⛔ 唔係「30 日內喺 Drive 垃圾桶撈得返」。
 *
 * ⛔ 讀唔到部機就回 `null`（⛔ 唔係 0）—— 同上面同一個道理。
 */
export function onlyOnPhoneCount(recordId: string, local: PendingPhoto[] | null): number | null {
  if (local === null) return null
  return local.filter((item) => item.recordId === recordId && item.status !== 'uploaded').length
}

/**
 * 「只剩部機呢一份」嗰行警告。**N 係零就回 `null`（⛔ 唔出）。**
 *
 * ⛔⛔ 呢行**唔准因為要照 Jason 張截圖而拆掉**（截圖冇呢行）。
 *    ⭐ 佢同「此操作無法還原。」講嘅係**兩件唔同嘅事**：
 *      · 「無法還原」講**雲端嗰兩份**（R2、Drive）冇咗就冇咗
 *      · 呢行講**部機嗰份係唯一一份** —— 連雲端都從來冇過
 *    ⚠️ 兩行都係真相，兩行都要出。
 */
export function onlyOnPhoneWarning(count: number | null): string | null {
  if (count === null || count <= 0) return null
  return `⚠️ 此單仍有 ${count} 張相片只剩本裝置這一份（未上傳到雲端）。清除後就真正永遠消失。`
}

/**
 * 彈窗要嗰兩條讀取路。**⛔ 兩條缺一不可 —— 所以綁埋做一個 type。**
 *
 * ⭐⭐ **點解要綁埋，⛔ 唔准拆開兩個 optional prop**
 *
 * ⚠️ 拆開就有得「一半駁咗、一半冇駁」。而呢度嘅失敗樣係**靜靜哋**嘅：
 *    數唔到 ⇒ `canPurge()` false ⇒ **粒「刪除」永遠撳唔落**，
 *    而畫面淨係寫「請check返個網絡」—— ⭐ 冇人會諗到係 props 漏咗駁。
 * ⛔ 綁埋一齊，TypeScript 就令「一半」呢個狀態**根本寫唔出嚟**。
 *
 * ⚠️ 同一個病喺呢個 repo 中過：`quote_admins` 建咗但空咗一個月冇人知
 *    （`docs/開發紀錄.md` 附錄 B）。⭐ 揀「寫唔出嚟」好過揀「記得檢查」。
 */
export type PurgeCountApis = {
  /** 呢一單嘅樹。⛔ 失敗要 throw，⛔ 唔准回 `[]`。 */
  listTrees: (recordId: string) => Promise<QuoteTree[]>
  /** 呢一單喺雲端嘅相。⛔ 失敗要 throw，⛔ 唔准回 `[]`。 */
  listRows: (recordId: string) => Promise<QuotePhoto[]>
}

/**
 * 數數嗰下而家去到邊。
 *
 * ⭐⭐ **「數緊」同「數唔到」⛔ 一定要分得開。**
 *    ⚠️ 兩個喺 `purgeCounts()` 度都係 `null`（都係「唔知」），但**對住人嗰陣
 *    唔可以當同一件事**：彈窗一開嗰半秒就彈一句「請check返個網絡再試」——
 *    ⭐ 係一個**假警報**，而假警報講多幾次，真嗰句就冇人信。
 *
 * ⛔ 兩種都一樣**撳唔落**（`canPurge()` 兩種都係 false）—— ⚠️ 分嘅淨係嗰句字。
 */
export type CountsPhase = 'counting' | 'ready' | 'cannot'

export function countsPhase(done: boolean, counts: PurgeCounts | null): CountsPhase {
  if (!done) return 'counting'
  return counts === null ? 'cannot' : 'ready'
}

/** 數緊嗰陣嗰行字。⛔ 唔准留空 —— 空白會令人以為冇嘢會消失。 */
export const COUNTING_MESSAGE = '正在點算此單有多少棵樹和相片⋯'
