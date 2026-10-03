/**
 * Google Drive 回錯嗰陣，**把佢講嘅嘢原原本本留低**。純函數，⛔ 唔掂 fetch。
 *
 * ⭐⭐⭐ **點解要有呢個檔 —— ⛔ 唔准淨係記住結論**
 *
 * **2026-09-16 Jason 部真機**（工程「測試單 B」，樹 1 相簿）出咗：
 *
 * ```
 * 抄唔到去 Drive：Drive 查詢失敗（429）
 * ```
 *
 * ⚠️⚠️ **然後就卡死喺呢度 —— 因為 429 有兩個完全唔同嘅意思，
 *    而兩個嘅修法完全相反：**
 *
 *   · **打得太密**（`rateLimitExceeded` / `userRateLimitExceeded`）
 *     ⇒ **我哋自己修得到**（慢啲打、加 backoff、慳返啲重複查詢）。
 *   · **今日額度用晒**（`dailyLimitExceeded` / `quotaExceeded`）
 *     ⇒ **⛔ 修唔到**，要改設計或者等過咗一日。
 *
 * ⭐ **Google 喺個 body 入面已經講咗係邊一個。** 而舊版 code 係：
 *
 * ```js
 * if (!res.ok) throw new Error(`Drive 查詢失敗（${res.status}）`)   // ⛔ body 掉咗
 * ```
 *
 * ⇒ **答案本來喺手，我哋自己掉咗。**
 *
 * ⚠️⚠️ **而同一個檔上面 30 行，呢條教訓已經寫咗一次**
 *    （`googleToken`，2026-09-04 真機中過，原文）：
 *
 *    > ⛔ 唔准淨係報個 status code…掉咗 Google 講嘅原因，
 *    > 就等於逼下一個人靠估，而估錯就會白做十五分鐘授權。
 *
 * ⭐⭐ **嗰條教訓當日應用咗喺「登入」嗰個 call，⛔ 冇應用落 `files.list`。**
 *    今日就係喺同一個窿再跌一次。⇒ **所以而家全部 Drive 呼叫一律行呢個檔。**
 *
 * ⛔⛔ **兩條硬規矩（Jason 2026-09-16 明文定），⛔ 一條都唔准拆：**
 *   ① 要記低 **Google 個 reason ＋ HTTP status ＋ 係邊一個呼叫**
 *      （`files.list` 定 upload）。⛔ **唔准淨係記一句「429」。**
 *   ② ⛔ **唔准記任何 token、refresh token、或者帶 query 嘅完整 URL。**
 *      ⚠️ 帶 query 嗰個尤其危險：`files.list` 個 `q` 入面有工程名同檔名。
 *      ⇒ 所以呢個函數**收唔到** URL ——
 *        佢淨係收「一個講得出嘅呼叫名」（見 `WHERE`）。
 */

/**
 * 呼叫名。⭐ 特登係一組**寫死嘅字**，⛔ 唔係由 URL 砌出嚟 ——
 * 由 URL 砌就一定會有一日把 query 帶埋出去（規矩②）。
 */
export const WHERE = {
  listFolder: 'files.list（檢索資料夾）',
  createFolder: 'files.create（開資料夾）',
  listMirrored: 'files.list（檢索這張相片上次複製的檔案）',
  listClash: 'files.list（檢索同名檔案）',
  upload: 'files.create（上載相片）',
  getSize: 'files.get（上載後核對大小）',
  getQuota: 'about.get（查看剩餘空間）',
  getName: 'files.get（取得檔名和資料夾）',
  rename: 'files.update（改檔名）',
  getCreated: 'files.get（取得建立時間）',
}

/**
 * ⛔ 最後一道閘：就算 Google 有日真係喺 error body 度回返啲敏感嘢，
 * 都唔會經呢度漏出去。⚠️ 呢個⛔ 唔係「應該唔會有」就算數 ——
 * 記低嘅嘢會入 Cloudflare log、會入 DB `drive_error`、會出喺現場同事部機上面。
 */
export function redact(text) {
  return String(text)
    .replace(/Bearer\s+[\w.\-~+/]+=*/gi, 'Bearer ⟨已移除⟩')
    .replace(/(access_token|refresh_token|id_token|client_secret)"?\s*[:=]\s*"?[\w.\-~+/]+=*/gi,
      '$1=⟨已移除⟩')
    // 帶 query 嘅 URL ——「⛔ 唔准記完整 URL」嗰條（個 q 入面有工程名同檔名）。
    .replace(/https?:\/\/\S*\?\S*/gi, '⟨網址已移除⟩')
    /* ⭐⭐ Google 個 token 就算**淨係赤裸裸咁出現喺一句英文裡面**都要拎走。
       ⚠️ 2026-09-16 呢個檔自己個測試捉到：上面兩條只捉到
       `Bearer xxx` 同 `access_token=xxx`，但 Google 回過
       `"message": "bad token ya29.XXXX"` 呢種**冇 key 名**嘅形狀 —— 走甩咗。
       ⛔ 所以要連 token 本身嘅樣都認：
         · `ya29.` ＝ Google access token
         · `1//`   ＝ Google refresh token
         · `GOCSPX-` ＝ OAuth client secret */
    .replace(/\bya29\.[\w.\-~+/]+=*/g, '⟨access token 已移除⟩')
    .replace(/\b1\/\/[\w.\-~+/]{10,}=*/g, '⟨refresh token 已移除⟩')
    .replace(/\bGOCSPX-[\w.\-~+/]+=*/g, '⟨client secret 已移除⟩')
}

/**
 * 已知 reason 嘅一句中文。
 *
 * ⛔⛔ **揾唔到就回 `null`，⛔ 唔准估。** ⚠️ 估錯一個 reason
 * 比冇解釋更差：人會照住個錯解釋去修，而真正嗰個原因冇人再查。
 */
export function reasonInChinese(reason) {
  switch (reason) {
    case 'rateLimitExceeded':
    case 'userRateLimitExceeded':
      return 'Google 認為我們短時間內請求太密。⭐ 這一種稍後會自行恢復。'
    case 'dailyLimitExceeded':
    case 'quotaExceeded':
      return '今日這個 Google 帳號的額度已用完。⚠️ 這一種⛔ 不會自行恢復，要等到明日。'
    case 'sharingRateLimitExceeded':
      return 'Google 認為我們修改權限太頻密。'
    case 'storageQuotaExceeded':
      return 'Google Drive 的空間已滿。⚠️ 要先清出空間才可以複製。'
    default:
      return null
  }
}

/** 由 Google 個 error body 度揾返個 reason。揾唔到就 `''`。 */
export function reasonOf(body) {
  const errors = body?.error?.errors
  if (Array.isArray(errors) && errors.length && typeof errors[0]?.reason === 'string') {
    return errors[0].reason
  }
  if (typeof body?.error?.status === 'string') return body.error.status
  return ''
}

/** Google 個 body 最多留幾多字 —— ⛔ 唔准成個倒落 log。 */
const MAX_RAW = 200

/**
 * 砌一句「講得出係乜事」嘅說話。
 *
 * ⛔ **收唔到 URL、收唔到 token** —— 見規矩②。
 *
 * @param where   `WHERE` 入面其中一個（⛔ 唔准自己傳一個 URL 入嚟）
 * @param status  HTTP status
 * @param raw     Google 回嘅 body 原文（⛔ 可以係空字串）
 * @param retryAfter `Retry-After` header（⛔ 冇就 null）
 * @returns `{ message, log }` —— `message` 出畫面兼寫落 `drive_error`；
 *          `log` 出 `console.error`。⭐ 兩句都帶齊 where ＋ status ＋ reason。
 */
export function driveFailure(where, status, raw = '', retryAfter = null) {
  let body = null
  try {
    body = JSON.parse(raw)
  } catch {
    body = null
  }

  const reason = reasonOf(body)
  const said = typeof body?.error?.message === 'string' ? body.error.message : ''
  const plain = reasonInChinese(reason)

  const bits = [`${where} 失敗（HTTP ${status}`]
  if (reason) bits.push(`，Google 話：${reason}`)
  bits.push('）')
  let message = bits.join('')

  if (plain) message += ` ${plain}`
  else if (reason) message += ` ⚠️ 這個原因未曾出現過，⛔ 系統不會猜測它的意思。請截圖並聯絡 Jason。`
  else message += ` ⚠️ Google 沒有說明原因。請截圖並聯絡 Jason。`

  if (retryAfter) message += `（Google 叫等 ${retryAfter} 秒）`

  /* ⭐ log 多帶一段 Google 原文 —— 畫面唔出，因為佢通常係英文，
     而現場同事睇唔明（CLAUDE.md §2.7）。但查嘅時候要有。 */
  const rawShort = redact(said || raw).slice(0, MAX_RAW)
  const log =
    `[quote-app worker] Drive ${where} → HTTP ${status}` +
    ` reason=${reason || '（無）'}` +
    (retryAfter ? ` retryAfter=${retryAfter}` : '') +
    (rawShort ? ` said=${rawShort}` : '')

  return { message: redact(message), log }
}
