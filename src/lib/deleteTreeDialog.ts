/**
 * 刪樹確認彈窗嘅字。
 *
 * ⭐⭐ **點解要有呢個彈窗 —— ⛔ 唔准淨係記住結論**
 *
 * 樹木頁（`TreePhotosScreen`）右上角粒 `×`，本來**撳一下就即刻刪咗棵樹**：
 *   · ⛔ 冇兩段式確認 —— 撞 `CLAUDE.md` §2.5（戴住手套，撳錯一下就冇咗）
 *     同 `docs/P3f-全app版面-實作計劃.md` §2.3／§6 第 2 條
 *     （「刪工程、刪樹、刪工序相、刪環境相，四種全部行 ConfirmModal」、
 *       「⛔ 唔准變成撳一下就刪」）
 *   · ⛔ 刪唔到（例如唔係自己開嘅單）**畫面一隻字都冇** ——
 *     `docs/void-掃描-2026-09-19.md`「已經坐實嘅兩個」第 2 個
 *     （`TreesScreen.tsx` `void afterWrite(…)`，⛔ 冇 catch）。
 *
 * ⭐ 「改樹」版底嗰粒「刪除這棵樹」一直都係兩段式，壞嘅淨係樹木頁呢粒。
 *
 * ⚠️ **AI 代揀，待 Jason 確認**：
 *   · 標題用 P3f §2.3 嗰句「刪除樹？」（Jason 08-24 原型拍板）。
 *   · ⛔ **冇照抄** P3f §2.3 個內文「及其相片將一併刪除」，亦⛔ 冇抄原型嗰句
 *     「移入 Google 雲端硬碟的垃圾桶，保留 30 日」—— 真 app 刪樹⛔ 唔掂相、
 *     ⛔ 唔掂 Drive，淨係寫 `deleted_at`。照抄就係個介面講大話。
 *     ⇒ 用返「改樹」版底**已經用緊**嗰句 `TREE_DELETE_NOTE`，⛔ 冇作新字。
 *   · 兩粒掣嘅字、次序、「處理中⋯」全部跟刪工程彈窗（`deleteDialog.ts`），
 *     ⛔ 唔另開一套。
 */
import { CANCEL_ON_RIGHT, DELETE_DIALOG_BUSY, DELETE_DIALOG_CANCEL } from './deleteDialog'

export const TREE_DELETE_TITLE = '刪除樹？'

/**
 * ⛔ 刪樹⛔ 唔會真清相（P8 淨係管成單工程），所以呢度⛔ 唔跟
 *    `PHOTOS_REALLY_PURGED` 變「永久刪除」。
 */
export const TREE_DELETE_CONFIRM = '刪除'
export const TREE_DELETE_CANCEL = DELETE_DIALOG_CANCEL
export const TREE_DELETE_BUSY = DELETE_DIALOG_BUSY
export const TREE_DELETE_CANCEL_ON_RIGHT = CANCEL_ON_RIGHT

/** ⭐ 同「改樹」版底嗰句一字不差 —— `TreeFormPage` 都係讀呢個。 */
export const TREE_DELETE_NOTE = '刪除只會記下刪除時間，資料庫內不會真正刪除。'

/** 樹牌號空白嗰陣⛔ 唔好出一個空框。 */
export function treeDeleteName(treeNo: string): string {
  const trimmed = treeNo.trim()
  return trimmed === '' ? '（未有樹牌號）' : trimmed
}
