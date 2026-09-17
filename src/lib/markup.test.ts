import { describe, expect, it } from 'vitest'
import {
  ASKING_CANNOT,
  MARKUP_UNREADABLE,
  askingState,
  markupSaveFailed,
  markupToSave,
} from './markup'

const ASKING_CANNOT_WHY = MARKUP_UNREADABLE

describe('⛔ 永遠唔會出 NaN', () => {
  it.each(['abc', 'NaN', 'NaN5', '-', '1e', '  x  '])('打咗 %s ⇒ ⛔ 唔出價', (typed) => {
    expect(askingState(typed)).toEqual({ kind: 'cannot', why: ASKING_CANNOT_WHY })
  })

  it('⭐ 卡死嗰個死循環：一 NaN 咗就打唔返出嚟 —— ⛔ 而家冇咗', () => {
    // ⚠️ 舊版個格顯示 String(Number(typed))，所以打 abc ⇒ 「NaN」，
    //    跟住打 5 就變「NaN5」，Number 返都係 NaN ⇒ 永遠出唔返嚟。
    expect(askingState('NaN5').kind).toBe('cannot')
    // ⭐ 而家個格顯示返原文，所以 abc 剷走再打 35 就得 —— 呢個係 component 嗰半。
    expect(askingState('35')).toEqual({ kind: 'ok', pct: 35 })
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
    expect(askingState('0')).toEqual({ kind: 'ok', pct: 0 })
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

describe('⭐⭐ 三個狀態，⛔ 唔係兩個（Jason 2026-09-16 拍板）', () => {
  it('有加成 ⇒ 出價', () => {
    expect(askingState('50')).toEqual({ kind: 'ok', pct: 50 })
    expect(askingState('12.5')).toEqual({ kind: 'ok', pct: 12.5 })
  })

  it('⭐ 空格 ＝ 真係未填 ⇒ **照出成本價**（CLAUDE.md §2.3：null ≠ 0，⛔ 未填唔係錯）', () => {
    expect(askingState('')).toEqual({ kind: 'cost' })
    expect(askingState('   ')).toEqual({ kind: 'cost' })
  })

  it('⛔ 讀唔到 ⇒ ⛔ 唔出價，而且要有一句中文', () => {
    const state = askingState('abc')
    expect(state.kind).toBe('cannot')
    expect(state.kind === 'cannot' && state.why).toBe(MARKUP_UNREADABLE)
  })

  it('⛔⛔ 「空格」同「讀唔到」⛔ 一定要分得開 —— 呢條就係整件事', () => {
    // ⚠️ 2026-09-16 之前兩樣喺畫面上面一模一樣，而且**兩樣都出成本價**
    //    ⇒ 打錯一個字母，張單就靜靜咁變成蝕本價。
    expect(askingState('')).not.toEqual(askingState('abc'))
    expect(askingState('').kind).toBe('cost')
    expect(askingState('abc').kind).toBe('cannot')
  })

  it('⛔ 負數當讀唔到 —— ⛔ 唔准當 0', () => {
    expect(askingState('-5').kind).toBe('cannot')
  })
})

describe('⛔ 出唔到價嗰陣寫乜', () => {
  it('⛔ 唔准係 $0、⛔ 唔准係一橫、⛔ 唔准空', () => {
    // ⚠️ 三樣都會俾人當成「個價係零／未計」，而真相係「我哋計唔到」。
    expect(ASKING_CANNOT.trim()).not.toBe('')
    expect(ASKING_CANNOT).not.toContain('$')
    expect(ASKING_CANNOT).not.toContain('0')
    expect(ASKING_CANNOT).not.toMatch(/^[—–-]+$/)
  })

  it('⭐ 嗰句原因要答到「點樣先出得返個價」，⛔ 唔止講「錯咗」', () => {
    expect(MARKUP_UNREADABLE).toContain('數字')
    expect(MARKUP_UNREADABLE).toContain('清空')
  })
})
