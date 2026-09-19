import { photoFilename, MITIGATION_TOKENS } from './names.mjs'

/**
 * 改樹牌 ⇒ 連 Drive 舊檔名一齊改。**純邏輯，⛔ 冇 fetch、⛔ 冇 env。**
 *
 * ⭐⭐ **點解要有 —— ⛔ 唔准淨係記住結論**
 *
 * **Jason 2026-08-24 拍板**（`docs/P3f-全app版面-實作計劃.md` §4）：
 *
 * > 「改樹牌要連 Drive 舊檔名一齊改。」
 *
 * ⛔ **拍咗板 23 日，一句 code 都冇入過**（2026-09-16 掃「原型拍咗板 ≠ 入咗真 code」
 * 嗰陣揾返出嚟）。實測：`src/` 同 `worker/src/` grep `rename` **零結果**。
 *
 * ⚠️ 而且 P3f 特登寫住 **tree app 嗰邊⛔ 抄唔到** —— 佢個 `renameTree` 由頭到尾
 * 冇叫過 `renameTreeFiles`。⇒ 呢條要自己寫。
 *
 * ⭐ 檔名點砌，⛔ 唔喺呢度再寫一次 —— 一律行返 `names.mjs` 個 `photoFilename()`，
 *   即係**鏡像上去嗰陣用嘅同一條 function**。⚠️ 兩個地方各寫一套，
 *   改名之後個檔名就會同新上載嗰啲唔一樣，而冇人會即刻發現。
 */

/**
 * 一棵樹改咗牌之後，邊幾個 Drive 檔要改、改成乜。
 *
 * ⛔⛔ **三種相⛔ 唔會出現喺個 plan 入面，三種都係特登嘅：**
 *
 *   1. **仲未鏡像上 Drive**（冇 `drive_file_id`）⇒ ⛔ 冇嘢可以改。
 *      ⭐ 佢哋之後鏡像嗰陣會用**新**樹牌砌名，所以⛔ 唔使理。
 *   2. **算唔到新檔名**（`photoFilename()` 回 `null`：冇工序 token、或者 `seq < 1`）
 *      ⇒ ⛔ **唔准靠估砌一個名出嚟**。佢哋會出喺 `cannot` 度，等人睇。
 *
 * ⭐⭐ **「個檔已經叫緊嗰個名」呢一步⛔ 唔喺呢度做。**
 *    ⚠️ 2026-09-16 寫呢個檔嗰陣，我本來讀一個 `quote_photos.drive_name` 欄去比 ——
 *    **查實個欄根本唔存在**（得 `drive_file_id` / `drive_synced_at` / `drive_error`）。
 *    ⭐ 而且就算開得到，佢都係一份**可以同 Drive 唔同步**嘅副本。
 *    ⇒ 改成**問 Drive 攞佢而家真係叫乜**（同一個請求順手攞埋 `parents`，
 *      ⛔ 唔使多一個來回）。**Drive 自己先係「個檔叫乜」嘅真相。**
 *    ⇒ ⛔ 唔使開新欄、⛔ 唔使跑 migration。
 *
 * ⚠️ 環境相（冇 `tree_id`）根本唔會傳入嚟 —— 佢哋個名係 `Site_01`，
 *    ⛔ 同樹牌無關（Jason 2026-08-24：⛔ 唔帶工程名，改名就唔使改檔名）。
 */
export function renamePlan(treeNo, photos) {
  const todo = []
  const cannot = []
  let notMirrored = 0

  for (const photo of photos ?? []) {
    if (!photo.drive_file_id) {
      notMirrored += 1
      continue
    }

    const token = photo.mitigation ? MITIGATION_TOKENS[photo.mitigation] : 'Whole View'
    const name = photoFilename(treeNo, token, photo.seq)

    if (name === null) {
      // ⛔ 唔准靜靜跳過 —— 同 `/mirror` 嗰邊一樣，砌唔到名要講到明。
      cannot.push({
        photoId: photo.id,
        why:
          !Number.isFinite(photo.seq) || photo.seq < 1
            ? `這張相片的次序是 ${photo.seq}，並不正確（要由 1 開始數），無法組合新檔名。請截圖並聯絡 Jason。`
            : '這個工序沒有對應的類別名，無法組合新檔名。請在「修剪」勾選一個細項。',
      })
      continue
    }

    todo.push({ photoId: photo.id, fileId: photo.drive_file_id, name })
  }

  return { todo, cannot, notMirrored }
}

/**
 * Drive 度個檔而家叫乜 vs 應該叫乜。
 *
 * ⛔ 一樣就⛔ 唔好郁 —— ⭐ 呢個就係「重試係安全嘅」嗰個保證：
 *    改到一半斷網，再撳一次淨係改返剩低嗰幾張。
 * ⚠️ 攞唔到現名（`null`）⇒ **照改**。⛔ 唔准當佢已經啱 ——
 *    寧願多改一次（改成同一個名係冇後果嘅），都唔好漏咗一個舊名喺度。
 */
export function needsRename(currentName, wantName) {
  return currentName !== wantName
}

/**
 * 一次改幾多個。
 *
 * ⚠️⚠️ **呢個數係度出嚟嘅，⛔ 唔係拍腦袋、⛔ 亦唔係抄 tree app。**
 *
 * Cloudflare Worker 免費版一個請求有 **CPU 時間上限**，而每個 Drive rename
 * 係一個 `PATCH`（一個來回）。⭐ 一棵樹實際上有幾多張相係查得到嘅：
 * 工序最多 4 項修剪 ＋ 移除 ＋ 起樹頭 ＋ 拉索加固 ＋ 修根 ＋ 近景 ＋ 其他 ＝ 10 格，
 * 加一張全景 ⇒ **一棵樹最多 11 格**，而一格可以影幾張。
 *
 * ⇒ 揀 **12**：⭐ **絕大部分樹一次過改得晒**（11 格各一張都夠），
 *   而一次 12 個來回喺 Worker 度綽綽有餘。
 * ⚠️ 過咗 12 就回 `hitLimit: true`，叫人再撳一次 —— ⛔ 唔准靜靜咁改一半就報成功
 *   （同 P8 `/purge` 同一套做法）。
 */
export const RENAME_BATCH_MAX = 12

/**
 * 改完之後講嘅話。⛔ 中文、⛔ 講得出下一步（CLAUDE.md §2.7）。
 *
 * ⛔⛔ **「改咗一半」⛔ 唔准講成「改好咗」。**
 *    ⚠️ P3f §4.6 講到明：六張相六個 PATCH，改到第三張斷網 ⇒ 三新三舊。
 *    Jason 2026-08-24 揀咗「兩樣都要」（樹木頁橫幅 ＋ 設定頁診斷）。
 */
export function renameSummary({ renamed, failed, cannot, hitLimit }) {
  if (failed === 0 && cannot === 0 && !hitLimit) {
    return renamed === 0
      ? 'Drive 那邊沒有需要修改（相片尚未複製上去，之後會直接使用新樹牌）。'
      : `Drive 那邊 ${renamed} 張相片的檔名已經一併修改。`
  }

  const bits = []
  if (renamed > 0) bits.push(`已修改 ${renamed} 張`)
  if (failed > 0) bits.push(`${failed} 張無法修改`)
  if (cannot > 0) bits.push(`${cannot} 張無法組合新檔名`)
  if (hitLimit) bits.push('尚有未處理的')

  return `⚠️ Drive 檔名只修改了一部分：${bits.join('、')}。Drive 上仍然是舊樹牌，請再點擊一次「再試」。`
}
