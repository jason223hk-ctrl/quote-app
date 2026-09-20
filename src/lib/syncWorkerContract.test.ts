import { describe, expect, it } from 'vitest'
// @ts-expect-error —— worker 係 .mjs，⛔ 冇 type。⭐ 特登直接叫佢，見下面。
import { driveFailure, reasonInChinese, WHERE } from '../../worker/src/driveError.mjs'
import { syncAdvice, TRANSIENT_DRIVE_REASONS } from './sync'
import type { QuotePhoto } from './photos'

/*
 * ⛔⛔⛔ **點解呢個檔要直接 import worker —— ⛔ 唔准抄一句假訊息落嚟**
 *
 * ⚠️⚠️ 2026-09-19 上咗線嘅窿：`syncAdvice` 用 `message.includes('搵 Jason')`
 *    認 worker 嘅永久性錯誤。#56 把 worker 四句改成「請截圖並聯絡 Jason」、
 *    Jason deploy 咗 ⇒ **呢條分支一條新 error 都中唔到**，
 *    而一個 Drive HTTP 500 由「要人處理」變成「唔使理」。
 *
 * ⭐ 當時有冇測試？有。但佢哋餵嘅係**手寫嘅假訊息** ——
 *   ⛔ 假訊息⛔ 唔會跟住 worker 改，所以 worker 一改，測試照樣全綠。
 *
 * ⇒ **所以呢度⛔ 唔准手寫訊息。** 每一條都係
 *   `driveFailure(...)` 真係砌出嚟嗰句，再餵落 `syncAdvice`。
 *   ⭐ worker 改一個字 ⇒ 呢度即刻跟住變 ⇒ 分類錯咗就紅。
 */

const photo = (driveError: string): QuotePhoto =>
  ({ drive_error: driveError, r2_error: '' }) as QuotePhoto

/** 叫真 worker 砌一句，⛔ 唔係抄。 */
function realMessage(where: string, status: number, body: unknown): string {
  return (driveFailure as (w: string, s: number, raw: string) => { message: string })(
    where,
    status,
    JSON.stringify(body),
  ).message
}

describe('⛔ worker 改文案，app 嗰邊⛔ 唔准靜靜咁失靈', () => {
  it('⭐ 未見過嘅 reason ＋ HTTP 500 ⇒ 要人處理（⛔ 唔准講「會自動再試」）', () => {
    const message = realMessage(WHERE.upload, 500, {
      error: { errors: [{ reason: 'someBrandNewReason' }] },
    })
    const advice = syncAdvice(photo(message))
    expect(advice.permanent).toBe(true)
    /* ⛔⛔ 呢句係整件事嘅重點：舊版會跌落 /50\d/ 條，出「無需處理」。 */
    expect(advice.text).not.toContain('無需處理')
  })

  it('⭐ Google 乜都冇講 ＋ HTTP 500 ⇒ 一樣要人處理', () => {
    const advice = syncAdvice(photo(realMessage(WHERE.getSize, 500, 'not json at all')))
    expect(advice.permanent).toBe(true)
  })

  it('額度用晒（dailyLimitExceeded）⇒ 要人處理', () => {
    const message = realMessage(WHERE.upload, 403, {
      error: { errors: [{ reason: 'dailyLimitExceeded' }] },
    })
    expect(syncAdvice(photo(message)).permanent).toBe(true)
  })

  it('⭐ 打得太密（rateLimitExceeded）⇒ ⛔ 唔使人處理，會自己好返', () => {
    const message = realMessage(WHERE.upload, 429, {
      error: { errors: [{ reason: 'rateLimitExceeded' }] },
    })
    const advice = syncAdvice(photo(message))
    expect(advice.permanent).toBe(false)
    /* ⭐ 呢兩句嘅修法相反 —— 一個等佢、一個要即刻搵人。⛔ 唔可以一樣。 */
    const permanent = syncAdvice(
      photo(
        realMessage(WHERE.upload, 403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } }),
      ),
    )
    expect(advice.text).not.toBe(permanent.text)
  })

  /*
   * ⛔⛔ **兩邊份名單要對得住。**
   * ⚠️ `TRANSIENT_DRIVE_REASONS` 寫喺 app，而「邊個 reason 會自己好返」
   *    嘅真相喺 worker 個 `reasonInChinese()`。兩邊各寫各就會有一日飄開。
   * ⭐ 呢條尺**直接量真 worker 出嘅句**，⛔ 唔係讀 worker 個 source 搵字。
   */
  it('⛔ app 個 transient 名單，逐個喺真 worker 度驗返', () => {
    for (const reason of TRANSIENT_DRIVE_REASONS) {
      const message = realMessage(WHERE.upload, 429, { error: { errors: [{ reason }] } })
      expect(syncAdvice(photo(message)).permanent).toBe(false)
    }
  })


  /*
   * ⛔⛔ **反方向** —— CO 2026-09-19 指出上面只驗咗一邊。
   *
   * ⚠️ 上面嗰條問：「app 講 transient 嗰啲，worker 認唔認同？」
   *    ⛔ 但冇問返轉頭：「**worker 新加一個『稍後會自行恢復』嘅 reason，
   *    app 有冇跟？**」
   * ⇒ 冇呢條，worker 加一個新 reason 而 app 唔跟 ⇒ 現場見到「需要處理」，
   *   而其實**等一陣就好** —— ⛔ 而冇嘢會紅。
   *
   * ⭐ baseline 嗰把尺就係兩個方向都驗（名單有 code 冇 ／ code 有名單冇）。
   *   呢把跟返同一個做法。
   */
  it('⛔ 反方向：worker 話「會自行恢復」嗰啲 reason，app 一定要跟', () => {
    /* ⭐ 逐個試 Google 真實會回嘅 reason，睇 worker 點講。
       ⛔ 呢個 list ⛔ 唔係「worker 支持嘅全部」——
       佢係一張**已知會出現**嘅 reason 表，加咗新嘅要喺呢度加一行。 */
    const known = [
      'rateLimitExceeded',
      'userRateLimitExceeded',
      'sharingRateLimitExceeded',
      'dailyLimitExceeded',
      'quotaExceeded',
      'storageQuotaExceeded',
    ]
    const workerSaysTransient = known.filter((reason) => {
      const said = (reasonInChinese as (r: string) => string | null)(reason)
      return said !== null && said.includes('自行恢復') && !said.includes('不會自行恢復')
    })
    /* ⛔ worker 話會自己好返嘅，app 一句都唔准漏。 */
    for (const reason of workerSaysTransient) {
      expect(TRANSIENT_DRIVE_REASONS).toContain(reason)
    }
    /* ⛔ 反轉都要啱：app 講 transient 嘅，worker ⛔ 唔可以話「不會自行恢復」。 */
    for (const reason of TRANSIENT_DRIVE_REASONS) {
      const said = (reasonInChinese as (r: string) => string | null)(reason)
      expect(said).not.toBeNull()
      expect(said).not.toContain('不會自行恢復')
    }
    /* ⛔ 而且⛔ 唔准兩邊都係空 —— 一把量零樣嘢嘅尺等於冇。 */
    expect(workerSaysTransient.length).toBeGreaterThan(0)
  })

  /*
   * ⛔⛔ CO 2026-09-19 提咗一個次序窿：`isWorkerDriveFailure` 行喺
   * 授權過期嗰條之前 ⇒ 一句帶住 `HTTP 401`、內容係
   * `Token has been expired or revoked` 嘅錯，會出通用嗰句，
   * ⛔ 而得「重新登入」嗰句先叫得動人做啱件事。
   *
   * ⭐ 我搬咗個次序（成本係零，而且個檔自己個註解本來就係咁寫）。
   *
   * ⚠️⚠️ **但我⛔ 造唔出嗰個失敗個案，要講清楚點解** ——
   *   授權過期嗰句係 `worker.mjs` 個 `googleToken()` 掟嘅：
   *       `Drive 登入失敗（400：Token has been expired or revoked.）`
   *   佢**⛔ 冇 `HTTP` 呢個字**，所以 `isWorkerDriveFailure` 由頭到尾中唔到佢。
   *
   *   而 `driveFailure()` 嗰邊 **⛔ 永遠唔會把 Google 原文放入 `message`**
   *   （原文淨係入 `log`，⛔ 特登嘅 —— 免得漏 token 出畫面）。
   *   ⇒ 兩個生產者**冇交集**，所以今日撞唔到。
   *
   * ⭐ 所以呢條尺守嘅係**令佢撞唔到嗰個性質**：
   *   `driveFailure()` 個 `message` ⛔ 唔准帶 Google 原文。
   *   ⚠️ 邊日有人改咗佢，呢度就會紅 —— **而嗰日就係次序開始要緊嗰日**。
   */
  it('⛔ driveFailure 個 message 唔准帶 Google 原文（⇒ 次序撞唔到，亦都⛔ 唔會漏 token）', () => {
    const raw = 'Token has been expired or revoked. bad token ya29.SECRET_VALUE'
    const message = realMessage(WHERE.upload, 401, { error: { message: raw } })
    expect(message).not.toContain('Token has been expired')
    expect(message).not.toContain('ya29.')
    /* ⛔ 而佢仍然要係「要人處理」—— 解釋唔到就當永久。 */
    expect(syncAdvice(photo(message)).permanent).toBe(true)
  })
})
