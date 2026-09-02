import { describe, expect, it } from 'vitest'
import type { PriceRow, PriceTable } from './prices'
import { groupPrices, parseMoney, patchFor, shapeOf, unitLabel } from './priceGroups'

const row = (p: Partial<PriceRow>): PriceRow => ({
  key: 'k',
  category: 'crane',
  label: '一部車',
  calc_mode: 'per_day',
  has_qty: true,
  price_nt: 100,
  price_kl: 100,
  price_hk: 100,
  price_night: null,
  sort_order: 10,
  archived_at: null,
  updated_by: null,
  updated_at: '',
  created_at: '',
  ...p,
})

describe('groupPrices', () => {
  it('照原型嗰個次序出，⛔ 唔係字母序', () => {
    const table: PriceTable = [
      row({ key: 'a', category: 'stump' }),
      row({ key: 'b', category: 'manpower' }),
      row({ key: 'c', category: 'crane' }),
    ]
    expect(groupPrices(table).map((g) => g.title)).toEqual(['人手', '吊雞', '起樹頭'])
  })

  it('同一類入面照 sort_order 排', () => {
    const table: PriceTable = [
      row({ key: 'b', category: 'lift', sort_order: 20 }),
      row({ key: 'a', category: 'lift', sort_order: 10 }),
    ]
    expect(groupPrices(table)[0].rows.map((r) => r.key)).toEqual(['a', 'b'])
  })

  it('冇嘢嘅類別唔會出一個空卡', () => {
    expect(groupPrices([row({ category: 'lift' })]).map((g) => g.category)).toEqual(['lift'])
  })
})

describe('shapeOf', () => {
  it('三區同價、冇夜價 → 一行', () => {
    expect(shapeOf(row({ price_nt: 2000, price_kl: 2000, price_hk: 2000 }))).toEqual({
      kind: 'single',
      value: 2000,
    })
  })

  it('三區唔同價 → 散開做四行', () => {
    const s = shapeOf(row({ price_nt: 900, price_kl: 1100, price_hk: 1300 }))
    expect(s.kind).toBe('byArea')
  })

  it('三區同價但有夜價 → 一樣要散開，否則個夜價永遠改唔到', () => {
    const s = shapeOf(row({ price_nt: 3500, price_kl: 3500, price_hk: 3500, price_night: 5000 }))
    expect(s.kind).toBe('byArea')
  })

  it('⛔ 全部 null ＝ 逐次報價，唔係 $0', () => {
    const s = shapeOf(
      row({ price_nt: null, price_kl: null, price_hk: null, price_night: null }),
    )
    expect(s).toEqual({ kind: 'ask' })
  })

  it('⛔ $0 唔係逐次報價 —— 免費同「要問過先知」係兩件事', () => {
    expect(shapeOf(row({ price_nt: 0, price_kl: 0, price_hk: 0 }))).toEqual({
      kind: 'single',
      value: 0,
    })
  })
})

describe('unitLabel', () => {
  it('逐次報價嗰啲唔會出「每次」', () => {
    expect(
      unitLabel(row({ calc_mode: 'once', price_nt: null, price_kl: null, price_hk: null })),
    ).toBe('逐次報價')
  })

  it('Overhead 要寫明自動計入 —— ⛔ 唔好等人以為要自己剔', () => {
    expect(unitLabel(row({ calc_mode: 'auto_per_day' }))).toBe('每日（自動計入）')
  })

  it('夾車係每架，⛔ 唔係每日', () => {
    expect(unitLabel(row({ calc_mode: 'per_unit' }))).toBe('每架')
  })
})

describe('parseMoney', () => {
  it('正常數字', () => {
    expect(parseMoney('2000')).toBe(2000)
    expect(parseMoney(' 2000 ')).toBe(2000)
    expect(parseMoney('0')).toBe(0)
  })

  it('⛔ 空白唔係 0 —— 要擋住，唔准儲存', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('   ')).toBeNull()
  })

  it('⛔ 負數同亂打唔收', () => {
    expect(parseMoney('-100')).toBeNull()
    expect(parseMoney('二千')).toBeNull()
    expect(parseMoney('1e3')).toBeNull()
  })
})

describe('patchFor', () => {
  it('單一價要三個地區一齊寫，⛔ 否則嗰行會散開做四行', () => {
    expect(patchFor({ kind: 'single', value: 1 }, null, 2500)).toEqual({
      price_nt: 2500,
      price_kl: 2500,
      price_hk: 2500,
    })
  })

  it('分區價只寫嗰一格', () => {
    const shape = shapeOf(row({ price_nt: 900, price_kl: 1100, price_hk: 1300 }))
    expect(patchFor(shape, 'price_kl', 1200)).toEqual({ price_kl: 1200 })
  })

  it('改夜價唔會掂到日頭價', () => {
    const shape = shapeOf(row({ price_nt: 3500, price_kl: 3500, price_hk: 3900, price_night: 5000 }))
    expect(patchFor(shape, 'price_night', 5200)).toEqual({ price_night: 5200 })
  })
})
