import { describe, expect, it } from 'vitest'
import { inputToRow, rowToInput, type QuoteRecord, type RecordInput } from './records'
import { contractorSiteLine, todayIso } from './labels'

const filled: RecordInput = {
  record_date: '2026-08-13',
  name: '  荃灣路邊修剪  ',
  main_con: '有利建築',
  site: '荃灣海濱',
  client: '陳生',
  region: 'NT',
  shift: 'night',
  start_time: '下星期一朝早',
  odoo_ref: '',
  internal_note: '   ',
}

describe('inputToRow', () => {
  it('trim 個名，空白欄轉 null（唔會入空字串落 DB）', () => {
    expect(inputToRow(filled)).toEqual({
      record_date: '2026-08-13',
      name: '荃灣路邊修剪',
      main_con: '有利建築',
      site: '荃灣海濱',
      client: '陳生',
      region: 'NT',
      shift: 'night',
      start_time: '下星期一朝早',
      odoo_ref: null,
      internal_note: null,
    })
  })

  it('只寫表單擁有嘅欄，唔會掂 status / markup_pct / locked / archived', () => {
    const keys = Object.keys(inputToRow(filled))
    expect(keys).not.toContain('status')
    expect(keys).not.toContain('markup_pct')
    expect(keys).not.toContain('locked')
    expect(keys).not.toContain('archived')
    expect(keys).not.toContain('deleted_at')
    expect(keys).not.toContain('transferred_project_id')
  })
})

describe('rowToInput', () => {
  it('DB 嘅 null 轉返空字串，input 先 render 得', () => {
    const record: QuoteRecord = {
      id: 'id-1',
      record_date: '2026-08-13',
      name: '單名',
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
      created_at: '2026-08-13T00:00:00Z',
      updated_at: '2026-08-13T00:00:00Z',
      deleted_at: null,
    }

    expect(rowToInput(record)).toEqual({
      record_date: '2026-08-13',
      name: '單名',
      main_con: '',
      site: '',
      client: '',
      region: '',
      shift: '',
      start_time: '',
      odoo_ref: '',
      internal_note: '',
    })
  })
})

describe('contractorSiteLine', () => {
  it('兩邊都有就用「-」駁埋', () => {
    expect(contractorSiteLine('有利', '荃灣')).toBe('有利 - 荃灣')
  })

  it('一邊冇就唔會留低多餘嘅「-」', () => {
    expect(contractorSiteLine(null, '荃灣')).toBe('荃灣')
    expect(contractorSiteLine('有利', null)).toBe('有利')
    expect(contractorSiteLine(null, null)).toBe('')
    expect(contractorSiteLine('  ', '荃灣')).toBe('荃灣')
  })
})

describe('todayIso', () => {
  it('用本地日期（唔用 UTC），朝早開單唔會爭返轉頭一日', () => {
    // 用本地時間建構：香港朝早 07:30 嘅 UTC 仲係前一日，用 toISOString 就會出錯日期。
    expect(todayIso(new Date(2026, 7, 13, 7, 30))).toBe('2026-08-13')
  })

  it('月同日補零', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
