/**
 * P8 步 3：刪工程 ⇒ **相真係清走**。**純邏輯，⛔ 冇 fetch、⛔ 冇 env。**
 *
 * ⭐⭐ **Jason 2026-09-14 拍板**（`docs/P8-真清相-計劃書.md` §0）：
 *   **相真係清走、救唔返；⛔ 但資料庫嗰行工程留低，只標作已刪。**
 *   佢原話：**「紀錄係用作一個工程列表」** —— 過去做過邊幾單要仲列得出。
 *   ⇒ CLAUDE.md §2.1「零真刪」對 **DB row** 嚟講仲然成立，⛔ 唔係廢咗；
 *     變嘅淨係**實物**（相嘅 bytes）。
 *
 * ⭐ 2026-09-19 Jason 再答咗兩條（⛔ 唔使再問）：
 *   · **Drive 嗰邊 ＝ 掉垃圾桶**（⛔ 唔係真刪）—— 多一道 30 日嘅網。
 *   · **只剩部機一份嗰啲 ＝ 照清**，嗰幾張相真係永遠冇咗 —— **佢知情下揀嘅**。
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ 次序係定死嘅，⛔ 唔准調轉
 *
 *   ① 問准（PATCH 一次，⛔ 唔改值）
 *   ② R2 刪 bytes
 *   ③ Drive 掉垃圾桶
 *   ④ stamp `quote_photos.purged_at`
 *   （⑤ 部機 IndexedDB —— ⛔ 唔喺 Worker，前端做，⭐ 一定要最尾）
 *
 * ⭐ **點解 ① 要存在** —— 呢個⛔ 唔喺原本計劃書入面，係寫嗰陣先揾到：
 *   `quote_photos` 條 select policy 係 `using (true)` ⇒ **人人讀得晒**。
 *   ⚠️ 即係話「讀到呢行相」**⛔ 完全唔代表你有權刪佢**。
 *   ⛔ 唔問准就落 ②③ 嘅話，會變成：**bytes 已經冇咗，到第 ④ 步先俾 RLS 拒絕**
 *   —— 而嗰下已經救唔返。
 *   ⇒ 所以先行**同第 ④ 步一模一樣嗰條 function**，淨係 `p_dry_run = true`
 *     ⇒ 同一段判斷、同一個出口，而⛔ 一個字都唔寫。
 *     唔准就掟錯 ⇒ ⛔ 一個 byte 都唔掂。
 *   ⭐ 用同一段判斷去試，⛔ 唔另外寫一套「邊個刪得」嘅講法 ——
 *     兩套講法一定會有一日唔一致，而唔一致嗰邊就係漏（同 `/read` 同一個理由）。
 *
 * ⚠️⚠️ **2026-09-20 我本來寫成「一個⛔ 唔改值嘅 PATCH」（寫 `purged_at = null`）。
 *    ⛔ 嗰個做法根本行唔通** —— `quote_photos` 條 update policy 係
 *    `can_edit_quote_record()`，而佢入面有 `r.deleted_at is null`，
 *    **仲要喺 OR 括號外面** ⇒ 連 `is_quote_admin()` 都繞唔到
 *    ⇒ 一單已刪工程，**冇任何人 PATCH 得到佢啲相**。
 *    ⭐ 即係話問准會**次次都拒**，而 `/purge` 一張相都清唔到。
 *    ⇒ 改成一個只寫得低 `purged_at` 嘅 function（Jason 2026-09-20 明文批），
 *      見 `docs/P8-purged_at-草稿.sql` 第 2 段同 `docs/P8-purge-權限-選項表.md`。
 *
 * ⭐ **點解 ② R2 行先、③ Drive 行後**（抄返 tree app `worker.mjs:1931` 嗰段理由）：
 *   直覺會話「R2 最後刪」，但喺呢度啱唔到 —— 掉咗入垃圾桶嘅 Drive 檔
 *   **⛔ 唔算一份生存中嘅副本**（30 日之後自己消失，期間任何人清一次垃圾桶就冇咗）。
 *   ⇒ 「R2 最後」嗰個次序，喺刪 R2 嗰一刻 R2 係**唯一一份生存中**嘅副本 ——
 *     反而係危險嗰個。
 *
 * ⛔ **④ 一定要喺 ②③ 之後**：`purged_at` 一寫就冇人再撳得返呢張相。
 *   寫咗但實物仲喺，就變成「帳面清咗、實物留住」，而且**永遠冇人會再去清**。
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * 一次清幾多張。
 *
 * ⚠️⚠️ **呢個數係度出嚟嘅，⛔ 唔係拍腦袋、⛔ 亦唔係抄 tree app。**
 *
 * Cloudflare Worker 一個 request 最多 **50 個 subrequest**。逐項數：
 *
 *   setup ＝ 4   `userIdFrom` ＋ 讀 `quote_records`（⛔ 確認真係刪咗）
 *                ＋ 讀 `quote_photos` ＋ `googleToken`
 *   每張相 ＝ 4  ① 問准 PATCH ＋ ② R2 DELETE ＋ ③ Drive trash ＋ ④ stamp PATCH
 *
 *   ⇒ floor((50 − 4) / 4) = 11
 *
 * ⇒ 取 **10**，留一格鬆動（4 ＋ 10×4 ＝ 44）。
 *
 * ⚠️ 呢個 10 係**一次掂幾多張相**，⛔ 唔理佢哋各自要幾多個 subrequest ——
 *    冇 `drive_file_id` 嘅少一個，`nothing` 嗰啲（雲端兩邊都冇）**淨係要 1 個**。
 *    ⭐ 即係話 10 係**最壞情況**，⛔ 而故意數到最壞先係安全嗰邊。
 * ⛔ 呢個數要喺真嘢上面量返一次先定死（計劃書 §3.3）——
 *    ⭐ 而家呢個係**計出嚟嘅上限**，⛔ 唔係實測過嘅數。Jason deploy 完要量。
 */
export const PURGE_BATCH_MAX = 10

/** loop 上限。⛔ 唔准無限 —— 撞到就回 `hitLimit`，叫人再撳一次。 */
export const PURGE_ROUNDS_MAX = 20

/**
 * 邊幾張要清、邊幾張已經清咗、邊幾張根本冇嘢好清。
 *
 * ⛔⛔ **三種相要分得開，⛔ 唔准撈埋一齊講「做完」：**
 *
 *   1. `purged_at` 已經有值 ⇒ **`done`** —— ⭐ 呢個就係「重試係安全嘅」嗰個保證：
 *      清到一半斷網，再撳一次淨係清返剩低嗰幾張。
 *   2. 冇 `r2_key` **又**冇 `drive_file_id` ⇒ **`nothing`** ——
 *      雲端兩邊都冇嘢好清，⭐ 但**照樣要 stamp**（等佢唔好永遠留喺「未清完」）。
 *      ⚠️ 呢種就係「只剩部機一份」嗰啲：**Worker 掂唔到部機**，
 *        真正清走佢係前端嘅事（⑤），而 Jason 2026-09-19 知情下批咗。
 *   3. 其餘 ⇒ **`todo`**。
 */
export function purgePlan(photos) {
  const todo = []
  const done = []
  const nothing = []

  for (const photo of photos ?? []) {
    if (photo.purged_at) {
      done.push(photo.id)
      continue
    }
    const r2Key = typeof photo.r2_key === 'string' ? photo.r2_key.trim() : ''
    const driveId = typeof photo.drive_file_id === 'string' ? photo.drive_file_id.trim() : ''
    if (r2Key === '' && driveId === '') {
      nothing.push(photo.id)
      continue
    }
    todo.push({ photoId: photo.id, r2Key: r2Key || null, driveFileId: driveId || null })
  }

  return { todo, done, nothing }
}

/**
 * R2 個 key 唔見咗（404）算唔算清咗？
 *
 * ⭐ **算。** 我哋要嘅係「嗰份 bytes 唔喺度」，⛔ 唔係「今次係我刪嘅」。
 * ⚠️ 404 當失敗嘅話，一張本來就冇上到 R2 嘅相會**永遠卡喺「未清完」**，
 *    而個人會一路撳「繼續清」一路失敗，⛔ 而且冇任何辦法行出去。
 *
 * ⛔ 但 403 / 500 ⛔ 唔算 —— 嗰啲係「我哋唔知佢仲喺唔喺度」。
 */
export function r2Gone(status) {
  return status === 204 || status === 200 || status === 404
}

/**
 * Drive 個檔唔見咗（404）算唔算掉咗？⭐ 同上，算。
 *
 * ⚠️ Drive `PATCH {trashed:true}` 對一個**已經喺垃圾桶**嘅檔會回 200 ——
 *    ⇒ 重試唔會出事。
 */
export function driveGone(status) {
  return status === 200 || status === 204 || status === 404
}

/**
 * 清完之後講嘅話。⛔ 中文、⛔ 講得出下一步（CLAUDE.md §2.7）。
 *
 * ⛔⛔ **「清咗一半」⛔ 唔准講成「清好咗」。**
 *    ⚠️ 呢個⛔ 唔係文案問題：`purged_at` 冇寫嘅相就係「未清完」本身，
 *      而人以為清好咗就唔會再撳 ⇒ 嗰啲 bytes 會**永遠留喺雲端**。
 */
export function purgeSummary({ purged, alreadyDone, nothingToClear, failed, hitLimit }) {
  if (failed === 0 && !hitLimit) {
    const bits = []
    if (purged > 0) bits.push(`清走了 ${purged} 張`)
    if (alreadyDone > 0) bits.push(`${alreadyDone} 張之前已經清走`)
    if (nothingToClear > 0) bits.push(`${nothingToClear} 張雲端本來就沒有`)
    return bits.length === 0
      ? '這一單沒有相片需要清走。'
      : `雲端相片已經清走：${bits.join('、')}。`
  }

  const bits = []
  if (purged > 0) bits.push(`已清走 ${purged} 張`)
  if (failed > 0) bits.push(`${failed} 張清不到`)
  if (hitLimit) bits.push('尚有未處理的')

  return `⚠️ 雲端相片只清走了一部分：${bits.join('、')}。剩下的仍然在雲端，請再點擊一次「繼續清」。`
}
