import { describe, expect, it } from 'vitest'
import { WHERE, driveFailure, reasonInChinese, reasonOf, redact } from './driveError.mjs'

/** Google Drive 真正回嘅 429 body 形狀（`error.errors[0].reason`）。 */
const googleBody = (reason, message = 'Rate Limit Exceeded') =>
  JSON.stringify({
    error: { errors: [{ domain: 'usageLimits', reason, message }], code: 429, message },
  })

describe('⛔ 唔准淨係記一句 429 —— reason ＋ status ＋ 邊一個呼叫，三樣都要有', () => {
  it('三樣齊', () => {
    const { message, log } = driveFailure(WHERE.listClash, 429, googleBody('rateLimitExceeded'))
    expect(message).toContain('files.list（檢索同名檔案）')
    expect(message).toContain('429')
    expect(message).toContain('rateLimitExceeded')
    expect(log).toContain('files.list（檢索同名檔案）')
    expect(log).toContain('HTTP 429')
    expect(log).toContain('reason=rateLimitExceeded')
  })

  it('⭐ 「打得太密」同「額度用晒」要出兩句唔同嘅中文 —— 呢兩樣嘅修法相反', () => {
    const tooFast = driveFailure(WHERE.listFolder, 429, googleBody('userRateLimitExceeded')).message
    const noQuota = driveFailure(WHERE.listFolder, 429, googleBody('dailyLimitExceeded')).message
    expect(tooFast).toContain('稍後會自行恢復')
    expect(noQuota).toContain('⛔ 不會自行恢復')
    expect(tooFast).not.toBe(noQuota)
  })

  it('⛔ 未見過嘅 reason ⛔ 唔准估 —— 照出原文，並且叫人搵 Jason', () => {
    const { message } = driveFailure(WHERE.upload, 403, googleBody('someBrandNewReason'))
    expect(message).toContain('someBrandNewReason')
    expect(message).toContain('⛔ 系統不會猜測它的意思')
    expect(message).toContain('請截圖並聯絡 Jason')
  })

  it('Google 乜都冇講（body 唔係 JSON）都要出一句中文，⛔ 唔准彈英文', () => {
    const { message } = driveFailure(WHERE.getSize, 500, '<html>Server Error</html>')
    expect(message).toContain('HTTP 500')
    expect(message).toContain('Google 沒有說明原因')
    expect(message).toContain('請截圖並聯絡 Jason')
  })

  it('有 Retry-After 就要講埋等幾耐（⭐ 佢係分「太密」定「額度」嘅另一條線索）', () => {
    const { message, log } = driveFailure(WHERE.listMirrored, 429, googleBody('rateLimitExceeded'), '42')
    expect(message).toContain('Google 叫等 42 秒')
    expect(log).toContain('retryAfter=42')
  })
})

describe('⛔ token、refresh token、帶 query 嘅完整 URL —— 一個字都唔准漏出去', () => {
  it('Bearer token 拎走', () => {
    expect(redact('authorization: Bearer ya29.a0AfB_byC-123_xyz=')).not.toContain('ya29')
  })

  it('access_token / refresh_token / client_secret 拎走', () => {
    const dirty = '{"access_token":"ya29.abc","refresh_token":"1//0eXYZ","client_secret":"GOCSPX-zzz"}'
    const clean = redact(dirty)
    expect(clean).not.toContain('ya29.abc')
    expect(clean).not.toContain('1//0eXYZ')
    expect(clean).not.toContain('GOCSPX-zzz')
  })

  it('⚠️ 帶 query 嘅 URL 拎走 —— files.list 個 q 入面有工程名同檔名', () => {
    const clean = redact(
      "https://www.googleapis.com/drive/v3/files?q=name%3D'2026-08-22%20彩霞邨'&spaces=drive",
    )
    expect(clean).not.toContain('彩霞邨')
    expect(clean).toContain('⟨網址已移除⟩')
  })

  it('⭐ 就算 Google 有日真係喺 error body 度回個 token，都出唔到街', () => {
    const body = JSON.stringify({
      error: { errors: [{ reason: 'authError' }], message: 'bad token ya29.SECRET_VALUE' },
    })
    const { message, log } = driveFailure(WHERE.rename, 401, body)
    expect(log).not.toContain('SECRET_VALUE')
    expect(message).not.toContain('SECRET_VALUE')
  })

  it('⛔ WHERE 全部係寫死嘅字，⛔ 冇一個係 URL —— 由 URL 砌就一定有日帶埋 query 出街', () => {
    for (const value of Object.values(WHERE)) {
      expect(value).not.toMatch(/https?:\/\//)
      expect(value).not.toContain('?')
    }
  })
})

describe('揾 reason 嘅零碎位', () => {
  it('冇 errors 就試 error.status', () => {
    expect(reasonOf({ error: { status: 'RESOURCE_EXHAUSTED' } })).toBe('RESOURCE_EXHAUSTED')
  })

  it('乜都冇就回空字串（⛔ 唔 throw —— 出錯路上面再 throw 就冇人知原本咩事）', () => {
    expect(reasonOf(null)).toBe('')
    expect(reasonOf({})).toBe('')
  })

  it('⛔ 未知 reason 冇中文解釋（⛔ 唔准夾硬作一句）', () => {
    expect(reasonInChinese('somethingElse')).toBeNull()
  })
})
