import { describe, expect, it } from 'vitest'
// @ts-expect-error —— worker 係 .mjs，⛔ 冇 type。⭐ 特登直接叫佢，見下面。
import { driveFailure, WHERE } from '../../worker/src/driveError.mjs'
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
})
