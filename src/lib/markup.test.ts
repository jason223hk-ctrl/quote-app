import { describe, expect, it } from 'vitest'
import { markupSaveFailed, markupToPct, markupToSave } from './markup'

describe('⛔ 永遠唔會出 NaN', () => {
  it.each(['abc', 'NaN', 'NaN5', '-', '1e', '  x  '])('打咗 %s ⇒ 計價嗰個數係 null', (typed) => {
    expect(markupToPct(typed)).toBe(null)
    expect(Number.isNaN(markupToPct(typed) as number)).toBe(false)
  })

  it('⭐ 卡死嗰個死循環：一 NaN 咗就打唔返出嚟 —— ⛔ 而家冇咗', () => {
    // ⚠️ 舊版個格顯示 String(Number(typed))，所以打 abc ⇒ 「NaN」，
    //    跟住打 5 就變「NaN5」，Number 返都係 NaN ⇒ 永遠出唔返嚟。
    expect(markupToPct('NaN5')).toBe(null)
    // ⭐ 而家個格顯示返原文，所以 abc 剷走再打 35 就得 —— 呢個係 component 嗰半。
    expect(markupToPct('35')).toBe(35)
  })
})

describe('存唔存、存乜', () => {
  it('清空 ⇒ 存 null（明確講「冇加成」）', () => {
    expect(markupToSave('')).toBe(null)
    expect(markupToSave('   ')).toBe(null)
  })

  it('⛔ 打錯字 ⇒ undefined（乜都唔好做），⛔ 唔係存 null', () => {
    // ⚠️ 兩者差好遠：存 null 會把本來嗰個加成抹咗。
    expect(markupToSave('abc')).toBe(undefined)
    expect(markupToSave('-5')).toBe(undefined)
  })

  it('正常數字 ⇒ 照存', () => {
    expect(markupToSave('50')).toBe(50)
    expect(markupToSave('0')).toBe(0)
    expect(markupToSave('12.5')).toBe(12.5)
  })

  it('⭐ 0 存得，⛔ 唔准當佢係空', () => {
    expect(markupToSave('0')).toBe(0)
    expect(markupToPct('0')).toBe(0)
  })
})

describe('存唔到嗰句', () => {
  it('⛔ 唔准食咗伺服器嗰句原因', () => {
    const text = markupSaveFailed('呢一單唔係你開嘅，你只可以改同刪自己開嗰啲單。')
    expect(text).toContain('呢一單唔係你開嘅')
  })

  it('⭐ 一定要講明打咗嘅嘢仲喺度', () => {
    expect(markupSaveFailed('冇網')).toContain('仲喺格入面')
  })

  it('⛔ 唔准淨係一句「出錯」', () => {
    expect(markupSaveFailed('冇網')).toContain('加成')
  })
})
