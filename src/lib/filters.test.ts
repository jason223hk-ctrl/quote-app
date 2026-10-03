import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, filterRecords, sortRecords } from './filters'
import type { QuoteRecord } from './records'

function makeRecord(overrides: Partial<QuoteRecord>): QuoteRecord {
  return {
    id: 'id-1',
    record_date: '2026-08-10',
    name: '測試單',
    address: '',
    client: null,
    contact: '',
    phone: '',
    region: null,
    shift: null,
    internal_note: null,
    gps_lat: null,
    gps_lng: null,
    gps_at: null,
    address_source: 'manual',
    region_source: 'manual',
    main_con: null,
    site: null,
    start_time: null,
    odoo_ref: null,
    status: 'site',
    markup_pct: null,
    price_snapshot: null,
    price_snapshot_at: null,
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

const active = makeRecord({
  id: 'active',
  name: '荃灣路邊修剪',
  client: '碧瑤',
  address: '荃灣海濱花園',
  contact: '陳生',
  phone: '91234567',
})
const archived = makeRecord({ id: 'archived', name: '舊單', archived: true })
const deleted = makeRecord({ id: 'deleted', name: '已刪單', deleted_at: '2026-08-11T00:00:00Z' })

describe('filterRecords', () => {
  /**
   * ⛔⛔ **2026-09-15 反轉咗：封存嘅單而家會出返。**
   * ⚠️ 以前呢條係「預設隱藏 archived」。Jason 2026-08-24 拍板拆走封存，
   *    ⭐ 拆個勾就一定要連「隱埋」一齊拆 —— 唔係啲舊單就永遠消失而且冇出口
   *    （附錄 B「一條規矩啱、但冇出口」）。見 `src/lib/filters.ts` 檔頭。
   */
  it('⭐ 封存過嘅單照出，⛔ 淨係軟刪除嘅永遠唔出', () => {
    const result = filterRecords([active, archived, deleted], EMPTY_FILTERS)
    expect(result.map((r) => r.id)).toEqual(['active', 'archived'])
  })

  it('⛔ `RecordFilters` 入面⛔ 冇 `showArchived` —— 拆走咗，⛔ 唔准加返', () => {
    // ⚠️ 呢條守住嘅唔係行為，係「呢個係一個決定」。有人日後加返，
    //    一定要改埋呢度，⇒ 佢就會睇到 `filters.ts` 檔頭嗰段解釋。
    expect(Object.keys(EMPTY_FILTERS).sort()).toEqual(['createdBy', 'dateFrom', 'dateTo', 'query'])
  })

  it('⭐ 建立人篩選：淨係出嗰個人開嘅單；空字串 = 唔限', () => {
    const mine = makeRecord({ id: 'mine', created_by: 'u-yiu' })
    const theirs = makeRecord({ id: 'theirs', created_by: 'u-isaac' })
    const ids = (createdBy: string) =>
      filterRecords([mine, theirs], { ...EMPTY_FILTERS, createdBy }).map((r) => r.id).sort()
    expect(ids('u-yiu')).toEqual(['mine'])
    expect(ids('')).toEqual(['mine', 'theirs'])
    expect(ids('u-nobody')).toEqual([])
  })

  it('搜尋覆蓋工程名稱、客戶、地址、聯絡人、電話', () => {
    const other = makeRecord({ id: 'other', name: '觀塘塌樹', client: '新輝' })
    const pool = [active, other]
    const ids = (query: string) => filterRecords(pool, { ...EMPTY_FILTERS, query }).map((r) => r.id)

    expect(ids('荃灣路邊')).toEqual(['active']) // 工程名稱
    expect(ids('碧瑤')).toEqual(['active']) // 客戶
    expect(ids('海濱花園')).toEqual(['active']) // 地址
    expect(ids('陳生')).toEqual(['active']) // 聯絡人
    expect(ids('9123')).toEqual(['active']) // 電話
    expect(ids('新輝')).toEqual(['other'])
  })

  it('搜尋唔分大細楷，亦會 trim 頭尾空白', () => {
    const english = makeRecord({ id: 'en', name: 'Tsuen Wan Pruning' })
    const result = filterRecords([english], { ...EMPTY_FILTERS, query: '  tsuen  ' })
    expect(result.map((r) => r.id)).toEqual(['en'])
  })

  it('⭐ 搜尋而家撈得返以前封存嗰啲單', () => {
    const archivedMatch = makeRecord({ id: 'archived-match', name: '荃灣舊單', archived: true })
    const result = filterRecords([active, archivedMatch], { ...EMPTY_FILTERS, query: '荃灣' })
    expect(result.map((r) => r.id)).toEqual(['active', 'archived-match'])
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
