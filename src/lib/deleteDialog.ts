/**
 * 刪工程確認彈窗嘅**文字同版面契約**。純邏輯，⛔ 唔掂 React。
 *
 * ⭐⭐ **點解要有呢個檔 —— ⛔ 唔准淨係記住結論**
 *
 * **2026-08-11 tree app 出過一次真實誤刪**（成因寫喺佢個
 * `src/ui/screens.tsx` `PurgeButton` 上面，逐字係佢哋自己記低嘅）：
 *
 *   1. Jason 撳「試行」。伺服器**正常返咗結果** —— 但 modal 內容變長咗，
 *      **超出咗睇得到嘅範圍**，佢望住嗰個位仍然係一粒掣，以為冇反應。
 *   2. 試行完成之後，兩粒掣**由「左＝取消・右＝試行」變成「左＝確認刪除・右＝取消」**。
 *   3. 佢再撳一次，主觀上以為撳緊「取消」，**實際撳咗「確認刪除」**。
 *
 * ⭐ **成因唔係「彈窗」三個字，係「粒掣會郁」。** Jason 2026-09-14 拍板
 * quote app 用彈窗（跟 tree app），所以呢度要把嗰個成因**釘死**：
 *
 * ⛔⛔ **兩粒掣嘅位置，⛔ 唔准因為內容多定少而變。**
 *    ⚠️ 唔理有冇「未傳 N 張」嗰行、工程名幾長、有幾多行字 ——
 *    **兩粒掣永遠喺同一個位。中間嗰段內容自己捲，⛔ 唔准推動粒掣。**
 *
 * 實作上點做到（見 `app.css` `.sheet`）：中間 `.sheet__body` 個**高度係寫死嘅**，
 * ⛔ 唔係 `auto`。內容短就有啲空（⚠️ 特登嘅，⛔ 唔係執漏），內容長就自己捲。
 * ⭐ 即係話成個彈窗高度固定 ⇒ 兩粒掣嘅座標固定，⛔ 同內容幾長完全無關。
 * `tools/ui-check/measure.mjs` 每次 `npm run ui:check` 都會量返「內容最短 vs 最長」
 * 兩個極端嘅掣位，⛔ 郁咗就紅。
 */

/**
 * ⭐⭐⭐ **相係咪真係清走咗 —— ⛔ 全個彈窗嘅真假就掛喺呢一個 boolean 度**
 *
 * **2026-10-03 起 ＝ `true`（P8 步 4）：**
 * Worker `/purge` 已經 deploy（Version `e08449ea-b7ff-4e8a-87cb-0d7c3e02eee2`），
 * DB 已經有 `quote_photos.purged_at` 同 `quote_purge_stamp()`（2026-10-03 驗過），
 * 而前端刪除（`HomePage` `deleteRecord`）軟刪完即刻叫 `/purge`、清晒先刪部機
 * （`src/lib/purgeRecord.ts`）。⇒ **「此操作無法還原」而家係真嘅。**
 *
 * ⚠️ 2026-09-14 嗰陣 ＝ `false`：嗰陣淨係寫 `deleted_at`，「後台仍可取回」先係真。
 *    兩套字仍然留喺下面，⛔ 唔好拆 —— 邊日要退返（例如 `/purge` 要收返），
 *    淨係改返呢一行。
 *
 * ⛔⛔ **點解唔可以早過步 4 寫死「永久刪除」四個字**：
 * ⚠️ 嗰陣嗰句就係一句**假嘅嚇人說話**。⭐ 有一日有人發現「原來攞得返」，
 *    跟住成個 app 講嘅嘢佢都會打個折。
 *
 *    計劃書：`docs/P8-真清相-計劃書.md`。
 */
export const PHOTOS_REALLY_PURGED = true

/**
 * 標題。⭐ 照 Jason 2026-09-14 最終截圖：垃圾桶圖示 ＋ 一句問句。
 * ⚠️ 工程名**唔喺標題**，喺下面 `.sheet__name`（大、粗）—— 照截圖。
 */
export function deleteDialogTitle(): string {
  return PHOTOS_REALLY_PURGED ? '永久刪除？' : '刪除工程？'
}

/**
 * 「你到底做緊乜」嗰句。分三橛係為咗中間嗰橛**加粗**（照截圖）。
 * ⛔ 唔准喺畫面度砌返一句字串出嚟 —— 兩套字要喺呢度一齊睇得到。
 */
export type TruthLine = { before: string; strong: string; after: string }

export function deleteDialogTruth(): TruthLine {
  // ⭐ P8 步 3 之後：相真係清走（R2 ＋ Drive 垃圾桶），⛔ 救唔返。
  if (PHOTOS_REALLY_PURGED) return { before: '此操作', strong: '無法還原', after: '。' }
  // 今日：淨係寫 `deleted_at`（CLAUDE.md §2.1 零真刪）。
  return { before: '刪除只是收起，⛔ 不是真正刪除 —— 後台', strong: '仍可取回', after: '。' }
}

/**
 * 兩粒掣嘅字。
 *
 * ⚠️ **「取消」呢兩個字係 Jason 2026-09-14 用截圖覆蓋咗我原本嗰條規矩嘅。**
 *    原本寫住「⛔ 唔准縮成『確定／取消』，要講返做緊乜」，所以本來叫「唔刪，返去」。
 * ⭐ 點解覆蓋咗都可以收貨：**危險嗰粒**寫到極清楚（「永久刪除」／「刪除」），
 *    兩粒之間唔會撈亂。⛔ 但「確定」呢種空話仍然唔准出現喺危險嗰粒度。
 */
export const DELETE_DIALOG_CONFIRM = PHOTOS_REALLY_PURGED ? '永久刪除' : '刪除'
export const DELETE_DIALOG_CANCEL = '取消'
export const DELETE_DIALOG_BUSY = '處理中⋯'

/**
 * 兩粒掣點排：**左＝刪除（紅底實心）、右＝取消（描邊）**。
 *
 * ⭐ **Jason 2026-09-14 用截圖拍板，照 tree app 嘅左右位置。**
 *    ⚠️ 我本來提議嘅理由（「取消擺右邊，右手拇指最易到」）啱啱好指同一邊，
 *    ⛔ 但而家個理由係「照佢張截圖」，⛔ 唔係我嗰個推論 —— 改之前問返佢。
 *
 * ⚠️⚠️ **要講白嘅代價**：截圖入面**危險嗰粒係實色紅、最搶眼**，
 *    而「取消」係描邊、冇咁搶。⛔ 呢個同「危險動作要唔顯眼」嗰條慣例係相反嘅。
 *    ⭐ Jason 知道張截圖係咁，並且明文話「排列、字、掣位仲然照佢张截圖」。
 *    剩返嘅保險係另外三度，⛔ 一度都唔准拆：
 *      · 兩粒掣嘅座標固定（`.sheet__body` 寫死高度）
 *      · 一開就 focus 咗「取消」
 *      · 危險嗰粒寫足「永久刪除」，⛔ 唔係「確定」
 */
export const CANCEL_ON_RIGHT = true
