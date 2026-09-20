import { describe, expect, it } from 'vitest'
import type { QuoteRecord } from './records'
import {
  SELECTABLE_STATUSES,
  daysSinceQuoted,
  needsSnapshot,
  planStatusChange,
  quotedAgeText,
} from './status'

const rec = (p: Partial<QuoteRecord>): QuoteRecord =>
  ({
    id: 'r1',
    name: '彩',
    status: 'pending',
    price_snapshot: null,
    price_snapshot_at: null,
    ...p,
  }) as unknown as QuoteRecord

describe('揀得嘅狀態', () => {
  it('⭐ 三個，同原型 QTABS 一致', () => {
    expect(SELECTABLE_STATUSES).toEqual(['pending', 'quoted', 'won'])
  })
})

describe('planStatusChange', () => {
  it('待報價 → 已報價：⛔ 唔彈確認（十條-拍板 第 2 條）', () => {
    const plan = planStatusChange(rec({ status: 'pending' }), 'quoted')
    expect(plan).toEqual({ allowed: true, confirm: null, snapshot: true })
  })

  it('已報價 → 待報價：一樣唔彈確認（⭐ 規格寫「⇄」，兩邊都係）', () => {
    const plan = planStatusChange(
      rec({ status: 'quoted', price_snapshot_at: '2026-09-01T00:00:00Z' }),
      'pending',
    )
    expect(plan).toEqual({ allowed: true, confirm: null, snapshot: false })
  })

  it('⚠️ 轉已中標要確認，而且句子要寫明後果 —— ⛔ 唔准淨係「確定嗎」', () => {
    const plan = planStatusChange(rec({ status: 'quoted', name: '彩' }), 'won')
    expect(plan.allowed).toBe(true)
    if (!plan.allowed) return
    expect(plan.confirm).not.toBeNull()
    expect(plan.confirm).toContain('彩')
    expect(plan.confirm).toContain('Tree App Photos')
    expect(plan.confirm).toContain('不能還原')
    expect(plan.confirm).not.toBe('確定嗎？')
  })

  it('⛔⛔ 已中標之後轉唔返 —— 待報價', () => {
    const plan = planStatusChange(rec({ status: 'won' }), 'pending')
    expect(plan.allowed).toBe(false)
  })

  it('⛔⛔ 已中標之後轉唔返 —— 已報價', () => {
    const plan = planStatusChange(rec({ status: 'won' }), 'quoted')
    expect(plan.allowed).toBe(false)
  })

  it('⛔ 轉唔到嗰陣一定要有個解釋，唔准淨係變灰', () => {
    const plan = planStatusChange(rec({ status: 'won' }), 'quoted')
    expect(plan.allowed).toBe(false)
    if (plan.allowed) return
    expect(plan.why.length).toBeGreaterThan(5)
  })

  it('撳返自己而家嗰個狀態：轉唔得，但講返俾人聽', () => {
    const plan = planStatusChange(rec({ status: 'quoted' }), 'quoted')
    expect(plan.allowed).toBe(false)
    if (plan.allowed) return
    expect(plan.why).toContain('已報價')
  })
})

describe('價錢快照', () => {
  it('未影過 → 要影', () => {
    expect(needsSnapshot(rec({ price_snapshot_at: null }))).toBe(true)
  })

  it('⛔⛔ 影過就唔准再影 —— 再影 ＝ 公司加價追溯改咗客張舊單', () => {
    expect(needsSnapshot(rec({ price_snapshot_at: '2026-09-01T00:00:00Z' }))).toBe(false)
  })

  it('⭐ 由已報價撳返待報價再撳返已報價，⛔ 都唔會重影', () => {
    const quoted = rec({ status: 'quoted', price_snapshot_at: '2026-09-01T00:00:00Z' })
    const back = planStatusChange(quoted, 'pending')
    expect(back).toEqual({ allowed: true, confirm: null, snapshot: false })
    const again = planStatusChange({ ...quoted, status: 'pending' }, 'quoted')
    expect(again).toEqual({ allowed: true, confirm: null, snapshot: false })
  })
})

describe('已報 N 日', () => {
  const at = (iso: string) => rec({ status: 'quoted', price_snapshot_at: iso })

  it('⛔ 冇快照時間 → null，⛔ 唔准出 0', () => {
    expect(daysSinceQuoted(rec({}), new Date('2026-09-05T10:00:00+08:00'))).toBeNull()
  })

  it('同一日 → 0 日', () => {
    const r = at('2026-09-05T09:00:00+08:00')
    expect(daysSinceQuoted(r, new Date('2026-09-05T23:00:00+08:00'))).toBe(0)
  })

  it('⚠️ 朝早報、第二日朝早睇 → 1 日（⛔ 唔可以因為爭幾個鐘就變 0）', () => {
    const r = at('2026-09-04T08:00:00+08:00')
    expect(daysSinceQuoted(r, new Date('2026-09-05T09:00:00+08:00'))).toBe(1)
  })

  it('⚠️ 夜晚 11 點報、第二朝 8 點睇 → 1 日（爭 9 個鐘，但係第二日）', () => {
    const r = at('2026-09-04T23:00:00+08:00')
    expect(daysSinceQuoted(r, new Date('2026-09-05T08:00:00+08:00'))).toBe(1)
  })

  it('十日', () => {
    const r = at('2026-08-26T12:00:00+08:00')
    expect(daysSinceQuoted(r, new Date('2026-09-05T12:00:00+08:00'))).toBe(10)
  })

  it('⛔ 認唔出嘅日期 → null，⛔ 唔准出 NaN 日', () => {
    const r = at('唔係一個日期')
    expect(daysSinceQuoted(r, new Date('2026-09-05T12:00:00+08:00'))).toBeNull()
  })

  it('⛔ 部機時鐘行慢咗（快照喺將來）→ 0，⛔ 唔准出負數', () => {
    const r = at('2026-09-09T12:00:00+08:00')
    expect(daysSinceQuoted(r, new Date('2026-09-05T12:00:00+08:00'))).toBe(0)
  })
})

describe('quotedAgeText', () => {
  it('⛔ 唔係「已報價」就唔出 —— 待報價', () => {
    expect(quotedAgeText(rec({ status: 'pending' }), new Date())).toBeNull()
  })

  it('⛔ 已中標都唔出（規格：只喺已報價工程出）', () => {
    const r = rec({ status: 'won', price_snapshot_at: '2026-08-01T00:00:00+08:00' })
    expect(quotedAgeText(r, new Date('2026-09-05T12:00:00+08:00'))).toBeNull()
  })

  it('當日報 → 「今日報」，⛔ 唔出「報咗 0 日」', () => {
    const r = rec({ status: 'quoted', price_snapshot_at: '2026-09-05T09:00:00+08:00' })
    expect(quotedAgeText(r, new Date('2026-09-05T18:00:00+08:00'))).toBe('今日報')
  })

  it('三日前報 → 「報咗 3 日」', () => {
    const r = rec({ status: 'quoted', price_snapshot_at: '2026-09-02T09:00:00+08:00' })
    expect(quotedAgeText(r, new Date('2026-09-05T18:00:00+08:00'))).toBe('報咗 3 日')
  })
})
