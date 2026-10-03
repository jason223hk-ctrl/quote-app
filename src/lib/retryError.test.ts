import { describe, expect, it } from 'vitest'
import { RETRY_UNEXPECTED_MESSAGE, retryErrorMessage } from './retryError'

describe('「再試一次」意料之外嘅錯', () => {
  it('⛔ 英文原文唔出畫面，換做中文', () => {
    const lost = new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError')
    expect(retryErrorMessage(lost)).toBe(RETRY_UNEXPECTED_MESSAGE)
    expect(retryErrorMessage(new TypeError('Failed to fetch'))).toBe(RETRY_UNEXPECTED_MESSAGE)
    expect(retryErrorMessage(undefined)).toBe(RETRY_UNEXPECTED_MESSAGE)
    expect(retryErrorMessage({})).toBe(RETRY_UNEXPECTED_MESSAGE)
  })

  it('⭐ 我哋自己嘅中文句原封不動', () => {
    const own = '相片無法寫入本裝置。請重新拍攝，或截圖並聯絡 Jason。'
    expect(retryErrorMessage(new Error(own))).toBe(own)
    expect(retryErrorMessage(own)).toBe(own)
  })

  it('句中文要講明搵邊個、做乜（CLAUDE.md §2.7）', () => {
    expect(RETRY_UNEXPECTED_MESSAGE).toContain('Jason')
    expect(RETRY_UNEXPECTED_MESSAGE).toContain('截圖')
    expect(RETRY_UNEXPECTED_MESSAGE).toContain('相片沒有被刪除')
  })
})
