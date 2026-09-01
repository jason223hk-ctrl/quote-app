import { describe, expect, it } from 'vitest'
import type { PriceRow, PriceTable } from './prices'
import {
  askingPrice,
  markupHow,
  priceOf,
  quoteLines,
  resolveRow,
  type PricingInput,
} from './pricing'

/** 照 P4-單價表-migration.sql 入嗰批真數，⛔ 唔係作嘅。 */
function row(p: Partial<PriceRow> & Pick<PriceRow, 'key'>): PriceRow {
  return {
    category: 'manpower',
    label: p.key,
    calc_mode: 'per_day',
    has_qty: false,
    price_nt: null,
    price_kl: null,
    price_hk: null,
    price_night: null,
    sort_order: 0,
    archived_at: null,
    updated_by: null,
    updated_at: '',
    created_at: '',
    ...p,
  } as PriceRow
}

const TABLE: PriceTable = [
  row({ key: 'climber', category: 'manpower', label: '攀樹師', calc_mode: 'per_person_day', has_qty: true, price_nt: 2000, price_kl: 2000, price_hk: 2000 }),
  row({ key: 'crew', category: 'manpower', label: '地面工人', calc_mode: 'per_person_day', has_qty: true, price_nt: 1000, price_kl: 1000, price_hk: 1000 }),
  row({ key: 'overhead', category: 'fixed', label: 'Overhead', calc_mode: 'auto_per_day', price_nt: 2000, price_kl: 2000, price_hk: 2000 }),
  row({ key: 't24', category: 'waste', label: '24噸夾車', calc_mode: 'per_unit', has_qty: true, price_nt: 900, price_kl: 1100, price_hk: 1300 }),
  row({ key: 't30', category: 'waste', label: '30噸夾車', calc_mode: 'per_unit', has_qty: true, price_nt: 1500, price_kl: 1500, price_hk: 1500 }),
  row({ key: 't9', category: 'waste', label: '9噸碎', calc_mode: 'once', price_nt: 300, price_kl: 300, price_hk: 300 }),
  row({ key: 'crane_fatboy', category: 'crane', label: '肥仔 - 30噸', has_qty: true, price_nt: 3500, price_kl: 3500, price_hk: 3900, price_night: 5000 }),
  row({ key: 'crane_fai30', category: 'crane', label: '輝哥 - 30噸 + 科同', has_qty: true, price_nt: 4500, price_kl: 4500, price_hk: 4500 }),
  row({ key: 'crane_fai86', category: 'crane', label: '輝哥 8+6', has_qty: true, price_nt: 7800, price_kl: 7800, price_hk: 8000, price_night: 10500 }),
  row({ key: 'lift_18', category: 'lift', label: '18M', has_qty: true, price_nt: 2600, price_kl: 2600, price_hk: 2600 }),
  row({ key: 'lift_other', category: 'lift', label: 'Other', has_qty: true }),
  row({ key: 'yes_self', category: 'stump', label: '自己起', calc_mode: 'once' }),
]

const BASE: PricingInput = {
  workDays: 2,
  crewTotal: 2,
  climbersPerDay: 1,
  wasteOptions: [],
  wasteT24Qty: null,
  wasteT30Qty: null,
  machineOptions: [],
  stumpOptions: [],
  region: 'NT',
  shift: 'day',
}

const q = (over: Partial<PricingInput> = {}) =>
  quoteLines({ ...BASE, ...over }, TABLE, null, 'pending')

describe('人手同 Overhead', () => {
  it('攀樹師 1 人 × 2 日 ＋ 地面 2 人 × 2 日 ＋ Overhead 2 日', () => {
    const r = q()
    expect(r.total).toBe(1 * 2 * 2000 + 2 * 2 * 1000 + 2 * 2000) // 12,000
    expect(r.ask).toEqual([])
  })

  it('Overhead 自動計入，⛔ 唔使剔、⛔ 唔乘人數', () => {
    const r = q({ crewTotal: 0, climbersPerDay: 0 })
    expect(r.lines).toEqual([{ label: 'Overhead 2 日', amount: 4000 }])
  })

  it('日數留空當一日', () => {
    const r = q({ workDays: null, crewTotal: 0, climbersPerDay: 0 })
    expect(r.total).toBe(2000)
  })
})

describe('垃圾：⛔ 唔乘日數', () => {
  it('24噸夾車 2 架，做 2 日 → 2 × 900，⛔ 唔乘日數', () => {
    const r = q({ crewTotal: 0, climbersPerDay: 0, wasteOptions: ['t24'], wasteT24Qty: 2 })
    expect(r.lines.find((l) => l.label.startsWith('24噸夾車'))?.amount).toBe(1800)
  })

  it('做 5 日都係同一個數', () => {
    const a = q({ workDays: 2, crewTotal: 0, climbersPerDay: 0, wasteOptions: ['t24'], wasteT24Qty: 2 })
    const b = q({ workDays: 5, crewTotal: 0, climbersPerDay: 0, wasteOptions: ['t24'], wasteT24Qty: 2 })
    const amt = (r: typeof a) => r.lines.find((l) => l.label.startsWith('24噸夾車'))!.amount
    expect(amt(a)).toBe(amt(b))
  })

  it('9噸碎冇架數欄，剔咗就一次 $300', () => {
    const r = q({ crewTotal: 0, climbersPerDay: 0, wasteOptions: ['t9'] })
    expect(r.lines.find((l) => l.label.startsWith('9噸碎'))).toEqual({ label: '9噸碎', amount: 300 })
  })

  it('24噸夾車分區：九龍 $1,100、香港 $1,300', () => {
    const kl = q({ region: 'KLN', crewTotal: 0, climbersPerDay: 0, wasteOptions: ['t24'], wasteT24Qty: 1 })
    const hk = q({ region: 'HK', crewTotal: 0, climbersPerDay: 0, wasteOptions: ['t24'], wasteT24Qty: 1 })
    expect(kl.lines.at(-1)!.amount).toBe(1100)
    expect(hk.lines.at(-1)!.amount).toBe(1300)
  })

  it('「垃圾不用清走」唔會計錢', () => {
    const r = q({ crewTotal: 0, climbersPerDay: 0, wasteOptions: ['none'] })
    expect(r.lines).toHaveLength(1) // 淨返 Overhead
  })
})

describe('夜價', () => {
  it('揀咗夜：肥仔 30噸 用 $5,000，⛔ 唔再睇地區', () => {
    const nt = q({ shift: 'night', region: 'NT', crewTotal: 0, climbersPerDay: 0, machineOptions: ['crane_fatboy'] })
    const hk = q({ shift: 'night', region: 'HK', crewTotal: 0, climbersPerDay: 0, machineOptions: ['crane_fatboy'] })
    expect(nt.lines.at(-1)!.amount).toBe(5000 * 2)
    expect(hk.lines.at(-1)!.amount).toBe(5000 * 2)
  })

  it('⛔ 冇夜價嘅照用日頭價，唔准自己加成', () => {
    const r = q({ shift: 'night', crewTotal: 0, climbersPerDay: 0, machineOptions: ['crane_fai30'] })
    expect(r.lines.at(-1)!.amount).toBe(4500 * 2)
  })

  it('日更照樣分區：輝哥 8+6 新界 $7,800、香港 $8,000', () => {
    const nt = q({ region: 'NT', crewTotal: 0, climbersPerDay: 0, machineOptions: ['crane_fai86'] })
    const hk = q({ region: 'HK', crewTotal: 0, climbersPerDay: 0, machineOptions: ['crane_fai86'] })
    expect(nt.lines.at(-1)!.amount).toBe(7800 * 2)
    expect(hk.lines.at(-1)!.amount).toBe(8000 * 2)
  })
})

describe('⛔ 搵唔到價唔准當 $0', () => {
  it('逐次報價（升降台 Other）→ 入 ask，⛔ 唔加落總數', () => {
    const r = q({ crewTotal: 0, climbersPerDay: 0, machineOptions: ['lift_other'] })
    expect(r.ask).toContain('升降台 － Other')
    expect(r.total).toBe(4000) // 淨係 Overhead，⛔ 冇 $0 嗰行
  })

  it('起樹頭兩項都係逐次報價', () => {
    const r = q({ crewTotal: 0, climbersPerDay: 0, stumpOptions: ['yes_self'] })
    expect(r.ask).toContain('起樹頭 － 自己起')
    expect(r.total).toBe(4000)
  })

  it('個項目喺表度冇咗 → 出 ask，⛔ 唔係靜靜哋 $0', () => {
    const noClimber = TABLE.filter((r) => r.key !== 'climber')
    const r = quoteLines(BASE, noClimber, null, 'pending')
    expect(r.ask).toContain('攀樹師')
    expect(r.lines.some((l) => l.label.includes('攀樹師'))).toBe(false)
  })

  it('地區未揀 → ⛔ 唔准偷偷當新界', () => {
    const r = q({ region: null })
    expect(r.total).toBe(0)
    expect(r.ask).toContain('攀樹師')
    expect(r.ask).toContain('Overhead')
  })

  it('priceOf 直接測：搵唔到返 null，⛔ 唔係 0', () => {
    expect(priceOf(undefined, 'NT', 'day')).toBeNull()
    expect(priceOf(TABLE.find((r) => r.key === 'lift_other'), 'NT', 'day')).toBeNull()
  })
})

describe('快照：改公司單價 ⛔ 唔可以追溯改咗舊單', () => {
  const SNAP = TABLE.map((r) => (r.key === 'climber' ? { ...r, price_nt: 1500 } : r))

  it('待報價 → 用現價', () => {
    const r = quoteLines(BASE, TABLE, SNAP, 'pending')
    expect(r.lines[0].amount).toBe(1 * 2 * 2000)
  })

  it('已報價 → 用快照嗰個舊價', () => {
    const r = quoteLines(BASE, TABLE, SNAP, 'quoted')
    expect(r.lines[0].amount).toBe(1 * 2 * 1500)
  })

  it('已中標 → 一樣用快照', () => {
    const r = quoteLines(BASE, TABLE, SNAP, 'won')
    expect(r.lines[0].amount).toBe(1 * 2 * 1500)
  })

  it('⭐ 快照冇嗰條 key（之後先加嘅類別）→ 跌返現價，⛔ 唔准當 $0', () => {
    const older = SNAP.filter((r) => r.key !== 'overhead')
    const r = quoteLines({ ...BASE, crewTotal: 0, climbersPerDay: 0 }, TABLE, older, 'quoted')
    expect(r.lines).toEqual([{ label: 'Overhead 2 日', amount: 4000 }])
    expect(r.ask).toEqual([])
  })

  it('冇快照（null）→ 一律用現價', () => {
    const r = quoteLines(BASE, TABLE, null, 'won')
    expect(r.lines[0].amount).toBe(1 * 2 * 2000)
  })

  it('resolveRow：待報價唔會攞快照', () => {
    expect(resolveRow('climber', TABLE, SNAP, 'pending')?.price_nt).toBe(2000)
    expect(resolveRow('climber', TABLE, SNAP, 'quoted')?.price_nt).toBe(1500)
  })
})

describe('加成', () => {
  it('⭐ 加成五成 ＝ 成本 × 1.5，⛔ 唔係「賺一半」', () => {
    expect(askingPrice(48000, 50)).toBe(72000)
    expect(askingPrice(48000, 50)).not.toBe(96000)
  })

  it('冇填加成 ＝ 成本價', () => {
    expect(askingPrice(48000, null)).toBe(48000)
    expect(askingPrice(48000, 0)).toBe(48000)
  })

  it('畫面寫出個乘數', () => {
    expect(markupHow(50)).toBe('成本 × 1.5（加成 50%）')
    expect(markupHow(100)).toBe('成本 × 2（加成 100%）')
    expect(markupHow(35)).toBe('成本 × 1.35（加成 35%）')
    expect(markupHow(0)).toBe('')
    expect(markupHow(null)).toBe('')
  })
})

describe('一單完整嘅數（同原型對）', () => {
  it('2 地面 ＋ 1 攀樹 ＋ 2 日 ＋ 新界 ＋ 24噸 1 架 ＋ 肥仔30噸 ＝ $19,900', () => {
    const r = q({ wasteOptions: ['t24'], wasteT24Qty: 1, machineOptions: ['crane_fatboy'] })
    // 攀樹 4,000 ＋ 地面 4,000 ＋ Overhead 4,000 ＋ 夾車 900 ＋ 吊雞 7,000
    expect(r.total).toBe(19900)
    expect(askingPrice(r.total, 50)).toBe(29850)
  })
})
