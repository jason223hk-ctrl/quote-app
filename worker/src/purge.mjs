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
 *   ① 問准（`quote_purge_stamp(id, p_dry_run => true)` —— ⛔ 一個字都唔寫）
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
 *
 *   每張相最多 ＝ 4
 *     ① 問准 `quote_purge_stamp(…, true)`
 *     ② R2 `DELETE`（冇 `r2_key` 就慳返）
 *     ③ Drive trash（冇 `drive_file_id` 就慳返）
 *     ④ 打剔 `quote_purge_stamp(…, false)`
 *
 *   ⇒ floor((50 − 4) / 4) = 11 ⇒ 取 **10**，留一格鬆動。
 *
 * ⛔⛔ **`nothing` 嗰批（雲端兩邊都冇）⛔ 唔係另一疊，佢哋同 `todo` 共用同一個上限。**
 *
 *   ⚠️ CO 2026-09-21 問：一單有 30 張「只剩部機一份」嘅工程，
 *      會唔會變成 `4 + 30×1 + 10×4 = 74` ⇒ **爆 50**？
 *   ⭐ **⛔ 唔會** —— `worker.mjs` 嗰邊係先把兩疊**併埋做一條 `queue`**，
 *      再 `slice(0, PURGE_BATCH_MAX)`：
 *
 *        const queue = [...plan.todo, ...plan.nothing.map(…)]
 *        const batch = queue.slice(0, PURGE_BATCH_MAX)
 *        const hitLimit = queue.length > batch.length
 *
 *      ⇒ **一個 request 最多掂 10 張相，⛔ 唔理佢哋係邊一疊。**
 *      ⇒ 上面嗰單 30 張嘅工程：一次做 10 張、回 `hitLimit: true` ＋ `remaining: 20`，
 *        ⛔ 唔會爆。
 *
 *   ⭐ **最壞情況嘅算式**（10 張全部係 `todo`、而且兩邊雲端都有）：
 *
 *        4 ＋ 10 × 4 ＝ **44** ≤ 50   ✓
 *
 *      `nothing` 嗰啲只行 ①④ ⇒ 每張 **2** 個（⛔ 唔係 1 個 —— 問准嗰下照行，
 *      因為佢哋一樣要過 RLS 先 stamp 得到）⇒ 10 張全部係 `nothing` ＝
 *      `4 ＋ 10×2 ＝ 24`，**比最壞情況仲鬆**。
 *
 *   ⚠️ **⛔ 有測試釘住呢件事**（`purgeRoute.test.mjs`）：一個**全部係 `nothing`**
 *      嘅 fixture、一個**混住**嘅 fixture，兩個都逐個外呼數。
 *      ⛔ 冇嗰兩條，我哋就係靠讀 code 講「應該唔會爆」。
 *
 * ⛔ 呢個數要喺真嘢上面量返一次先定死（計劃書 §3.3）——
 *    ⭐ 而家呢個係**計出嚟嘅上限**，⛔ 唔係實測過嘅數。Jason deploy 完要量。
 */
export const PURGE_BATCH_MAX = 10

/*
 * ⛔⛔ **本來呢度有個 `PURGE_ROUNDS_MAX = 20`，2026-09-21 剷咗。**
 *
 * ⚠️ CO 問：佢係「前端撳幾多次」定「Worker 入面 loop 幾多轉」？
 * ⭐ 答案係**兩樣都唔係** —— 佢**由頭到尾冇人用過**。
 *   `grep` 過成個 repo：得佢自己嗰行 `export`，同埋一條測試斷言佢「係有限數」。
 *
 * ⛔⛔ 即係話佢係一個**讀落似保證、實際乜都唔保證**嘅常數 ——
 *   而嗰條測試仲會**綠住**，因為佢驗嘅係「20 係一個有限數」，
 *   ⛔ 唔係「真係有人攔住個 loop」。⭐ 同「一把量緊發水畫面嘅尺」同一個家族。
 *
 * ⇒ **`/purge` 入面根本冇 loop**：一個 request 做一批（`PURGE_BATCH_MAX`），
 *   做唔晒就回 `hitLimit` ＋ `remaining`，**由人撳「繼續清」再叫一次**
 *   （CO 2026-09-20 揀咗「一粒掣」，⛔ 唔係自動再試）。
 *   ⇒ 冇機器 loop ⇒ ⛔ 唔需要 loop 上限。
 *
 * ⚠️ 邊日真係加返一個自動重試，**⛔ 唔准淨係加返個常數** ——
 *   要連埋「邊度真係讀佢」同一條會紅嘅測試一齊加。
 */

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

/* ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 2026-10-03 Jason 拍板：**成單工程刪咗，Drive 個工程資料夾都要走**
 *   （掉垃圾桶，30 日內撈得返 —— 同相一樣）。
 *
 * ⭐ 掉個資料夾 ＝ 入面所有嘢一齊入垃圾桶 ⇒ 連 2026-10-03 嗰次 bug 整出嚟嘅
 *   **重複副本**都一齊清走（`/purge` 本來淨係 trash 行入面嗰個 `drive_file_id`）。
 *
 * ⛔⛔ 但個資料夾**唔一定淨係屬於呢一單**：資料夾名係 `projectFolderName(日期, 工程名)`，
 *    另一單同日同名嘅工程會**共用同一個資料夾**；亦可能有人手放咗嘢入去。
 *    ⇒ 掉之前逐個睇入面嘅嘢：
 *      · 全部都係**呢一單嘅相**（`appProperties.quotePhotoId` ∈ 呢單嘅相 id）或者係空 ⇒ 掉成個資料夾
 *      · 有**任何一樣唔係**（第二單嘅相、冇 quotePhotoId 嘅檔、子資料夾）⇒ ⛔ 唔掉資料夾，
 *        淨係掉入面屬於呢一單嘅檔（即係重複副本），資料夾留低
 *      · 一頁睇唔晒（`nextPageToken`）⇒ ⛔ 唔知入面有乜 ⇒ 乜都唔掂
 * ⛔ 根資料夾（`DRIVE_ROOT_FOLDER_NAME`）一律唔掂。
 * ───────────────────────────────────────────────────────────────────────────── */

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/**
 * 一個工程資料夾點處理。**純邏輯。**
 *
 * @param children  `files.list` 攞返嘅（未入垃圾桶）入面嘅嘢：`{ id, mimeType, appProperties }`
 * @param ownPhotoIds  呢一單**所有** `quote_photos.id`
 * @param complete  `false` ＝ 一頁睇唔晒 ⇒ ⛔ 唔准判斷
 * @returns `{ action: 'trash-folder' }` ／ `{ action: 'trash-files', fileIds, foreign }` ／ `{ action: 'unknown' }`
 */
export function folderVerdict(children, ownPhotoIds, complete = true) {
  if (!complete) return { action: 'unknown' }
  const own = new Set(ownPhotoIds)
  const mine = []
  let foreign = 0
  for (const child of children ?? []) {
    const photoId = child?.appProperties?.quotePhotoId
    if (child?.mimeType !== FOLDER_MIME && typeof photoId === 'string' && own.has(photoId)) {
      mine.push(child.id)
    } else {
      foreign += 1
    }
  }
  if (foreign === 0) return { action: 'trash-folder' }
  return { action: 'trash-files', fileIds: mine, foreign }
}

/**
 * 資料夾嗰步講嘅話。⛔ 唔影響「相清咗未」（`ok`）—— 相已經全部清走、`purged_at` 已經寫咗。
 * ⭐ `null` ＝ 冇嘢要講。
 */
export function folderNote(result) {
  if (!result) return null
  if (result.status === 'kept') {
    return '工程資料夾內還有不屬於這一單的檔案，所以保留了資料夾，只清走了這一單的檔案。'
  }
  if (result.status === 'error' || result.status === 'unknown') {
    return '⚠️ Google Drive 的工程資料夾未能清走（相片本身已經清走）。可以稍後再點擊「繼續清」，或者截圖並聯絡 Jason。'
  }
  return null
}
