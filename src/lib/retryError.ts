/**
 * 「再試一次」撞到意料之外嘅錯，畫面要出乜。
 *
 * ⭐⭐ **點解要有呢個 —— ⛔ 唔准淨係記住結論**
 *
 * `PhotoSlot` 個 `retry()` 本來係 `try { … } finally { … }`，⛔ 冇 `catch`，
 * 而粒掣係 `onClick={() => void retry(…)}`。
 * ⇒ 部機儲存（IndexedDB）一出錯（例如 iOS 返前景之後
 *    「Connection to Indexed Database server lost」），
 *    粒掣「上傳中⋯」閃一閃就變返「再試一次」，**⛔ 一隻字都冇**。
 * ⇒ 現場同事會一路撳一路以為壞咗 —— 同 2026-09-19「狀態撳唔到」同一個病
 *    （`docs/void-掃描-2026-09-19.md`「內部⛔ 冇 catch」第 3 個，
 *     `docs/開發紀錄.md` 附錄 D3）。
 *
 * ⛔ 英文原文唔准出畫面（CLAUDE.md §2.7）—— 照入 `console.error`，畫面出中文。
 * ⭐ 我哋自己 throw 嘅中文句（已經寫明搵邊個、做乜）就原封不動出。
 *
 * ⚠️ **「相片沒有被刪除」呢半句係真嘅**：`retry()` 成條路⛔ 冇任何刪除部機相嘅動作，
 *    出錯嗰陣張相照樣喺部機。⛔ 將來有人喺 `retry()` 加刪除，呢句就要改。
 */
export const RETRY_UNEXPECTED_MESSAGE =
  '「再試一次」未能完成：本裝置的儲存空間出錯。相片沒有被刪除，請關閉程式後重新開啟再試；如仍然出錯，請截圖，並用 WhatsApp 聯絡 Jason。'

const HAS_CHINESE = /[\u3400-\u9fff]/

export function retryErrorMessage(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : typeof caught === 'string' ? caught : ''
  return HAS_CHINESE.test(message) ? message : RETRY_UNEXPECTED_MESSAGE
}
