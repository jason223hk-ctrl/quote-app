import { describe, expect, it } from 'vitest'
import { splitFontRuns } from './fontRuns'

describe('splitFontRuns', () => {
  it('純 ASCII 一段', () => {
    expect(splitFontRuns('Crown Cleaning')).toEqual([{ text: 'Crown Cleaning', ascii: true }])
  })

  it('純中文一段', () => {
    expect(splitFontRuns('清理樹冠')).toEqual([{ text: '清理樹冠', ascii: false }])
  })

  it('中英夾雜就拆開 —— ⛔ 唔拆就會出「A0 2 1」嗰種錯', () => {
    expect(splitFontRuns('彩1_Whole View_01')).toEqual([
      { text: '彩', ascii: false },
      { text: '1_Whole View_01', ascii: true },
    ])
  })

  it('⛔ surrogate pair 唔准拆成兩橛', () => {
    const runs = splitFontRuns('𠮷a')
    expect(runs).toEqual([
      { text: '𠮷', ascii: false },
      { text: 'a', ascii: true },
    ])
  })

  it('空字串回空 array', () => {
    expect(splitFontRuns('')).toEqual([])
  })
})
