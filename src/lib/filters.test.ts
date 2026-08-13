import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, filterRecords, sortRecords } from './filters'
import type { QuoteRecord } from './records'

function makeRecord(overrides: Partial<QuoteRecord>): QuoteRecord {
  return {
    id: 'id-1',
    record_date: '2026-08-10',
    name: '測試單',
    main_con: null,
    site: null,
    client: null,
    region: null,
    shift: null,
    start_time: null,
    odoo_ref: null,
    internal_note: null,
    status: 'site',
    markup_pct: null,
    archived: false,
    locked: false,
    transferred_project_id: null,
    created_by: 'user-1',
    created_at: '2026-08-10T00:00:00Z',
    updated_at: '2026-08-10T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

const active = makeRecord({ id: 'active', name: '荃灣路邊修剪', main_con: '有利', site: '荃灣' })
const archived = makeRecord({ id: 'archived', name: '舊單', archived: true })
const deleted = makeRecord({ id: 'deleted', name: '已刪單', deleted_at: '2026-08-11T00:00:00Z' })

describe('filterRecords', () => {
  it('預設隱藏 archived 同已軟刪除嘅單', () => {
    const result = filterRecords([active, archived, deleted], EMPTY_FILTERS)
    expect(result.map((r) => r.id)).toEqual(['active'])
  })

  it('showArchived 開得返封存嘅單，但軟刪除嘅永遠唔出', () => {
    const result = filterRecords([active, archived, deleted], {
      ...EMPTY_FILTERS,
      showArchived: true,
    })
    expect(result.map((r) => r.id)).toEqual(['active', 'archived'])
  })

  it('搜尋覆蓋名、大判、地點、客戶', () => {
    const byClient = makeRecord({ id: 'by-client', client: '陳生' })
    const pool = [active, byClient]

    expect(filterRecords(pool, { ...EMPTY_FILTERS, query: '荃灣' }).map((r) => r.id)).toEqual([
      'active',
    ])
    expect(filterRecords(pool, { ...EMPTY_FILTERS, query: '有利' }).map((r) => r.id)).toEqual([
      'active',
    ])
    expect(filterRecords(pool, { ...EMPTY_FILTERS, query: '陳生' }).map((r) => r.id)).toEqual([
      'by-client',
    ])
  })

  it('搜尋唔分大細楷，亦會 trim 頭尾空白', () => {
    const english = makeRecord({ id: 'en', name: 'Tsuen Wan Pruning' })
    const result = filterRecords([english], { ...EMPTY_FILTERS, query: '  tsuen  ' })
    expect(result.map((r) => r.id)).toEqual(['en'])
  })

  it('搜尋唔會撈返封存單（兩個條件要同時成立）', () => {
    const archivedMatch = makeRecord({ id: 'archived-match', name: '荃灣舊單', archived: true })
    const result = filterRecords([active, archivedMatch], { ...EMPTY_FILTERS, query: '荃灣' })
    expect(result.map((r) => r.id)).toEqual(['active'])
  })

  it('日期篩選包含頭尾兩日', () => {
    const pool = [
      makeRecord({ id: 'd08', record_date: '2026-08-08' }),
      makeRecord({ id: 'd10', record_date: '2026-08-10' }),
      makeRecord({ id: 'd12', record_date: '2026-08-12' }),
    ]

    const result = filterRecords(pool, {
      ...EMPTY_FILTERS,
      dateFrom: '2026-08-08',
      dateTo: '2026-08-10',
    })
    expect(result.map((r) => r.id)).toEqual(['d10', 'd08'])
  })

  it('淨係填「由」或者淨係填「至」都行得', () => {
    const pool = [
      makeRecord({ id: 'd08', record_date: '2026-08-08' }),
      makeRecord({ id: 'd12', record_date: '2026-08-12' }),
    ]

    expect(
      filterRecords(pool, { ...EMPTY_FILTERS, dateFrom: '2026-08-10' }).map((r) => r.id),
    ).toEqual(['d12'])
    expect(filterRecords(pool, { ...EMPTY_FILTERS, dateTo: '2026-08-10' }).map((r) => r.id)).toEqual(
      ['d08'],
    )
  })
})

describe('sortRecords', () => {
  it('由新到舊；同一日就用 created_at 分先後', () => {
    const pool = [
      makeRecord({ id: 'old', record_date: '2026-08-01' }),
      makeRecord({ id: 'same-early', record_date: '2026-08-10', created_at: '2026-08-10T01:00:00Z' }),
      makeRecord({ id: 'new', record_date: '2026-08-20' }),
      makeRecord({ id: 'same-late', record_date: '2026-08-10', created_at: '2026-08-10T09:00:00Z' }),
    ]

    expect(sortRecords(pool).map((r) => r.id)).toEqual(['new', 'same-late', 'same-early', 'old'])
  })

  it('唔會改動原本個 array', () => {
    const pool = [
      makeRecord({ id: 'a', record_date: '2026-08-01' }),
      makeRecord({ id: 'b', record_date: '2026-08-20' }),
    ]
    sortRecords(pool)
    expect(pool.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
