import { describe, expect, it } from 'vitest'
import {
  EMPTY_INPUT,
  inputToRow,
  rowToInput,
  translateDbError,
  validateInput,
  type QuoteRecord,
  type RecordInput,
} from './records'
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
  it('trim 所有欄，空白欄送空字串', () => {
    expect(inputToRow(filled)).toEqual({
      record_date: '2026-08-13',
      name: '荃灣路邊修剪',
      main_con: '有利建築',
      site: '荃灣海濱',
      client: '陳生',
      region: 'NT',
      shift: 'night',
      start_time: '下星期一朝早',
      odoo_ref: '',
      internal_note: '',
    })
  })

  /**
   * Regression（2026-08-13 線上事故）：空白欄以前送 null，撞正 schema 嘅
   * not null default ''，現場同事唔填「預計開工」／「Odoo REF#」／「內部備註」
   * 就落唔到單，而且要逐個欄試先知爭邊個。
   */
  it('全部選填欄留空都唔會出現任何 null', () => {
    const blank: RecordInput = {
      ...EMPTY_INPUT,
      record_date: '2026-08-13',
      name: '淨係填咗個名',
      region: 'NT',
      shift: 'day',
    }

    const row = inputToRow(blank)

    expect(Object.values(row).some((value) => value === null)).toBe(false)
    expect(Object.values(row).some((value) => value === undefined)).toBe(false)
    expect(row).toEqual({
      record_date: '2026-08-13',
      name: '淨係填咗個名',
      main_con: '',
      site: '',
      client: '',
      region: 'NT',
      shift: 'day',
      start_time: '',
      odoo_ref: '',
      internal_note: '',
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

describe('validateInput', () => {
  const ok: RecordInput = {
    ...EMPTY_INPUT,
    record_date: '2026-08-13',
    name: '有名',
    region: 'KLN',
    shift: 'night',
  }

  it('必填齊晒就冇 error', () => {
    expect(validateInput(ok)).toEqual({})
  })

  /**
   * Regression：地區同日／夜更留喺「未選」以前會送 null 落 DB 爆 constraint。
   * 修法唔可以係悄悄 default——呢兩樣影響夾車、吊機、夜更價。
   */
  it('地區未揀就攔住，唔會去到 DB', () => {
    expect(validateInput({ ...ok, region: '' })).toEqual({ region: '請揀地區' })
  })

  it('日／夜更未揀就攔住，唔會去到 DB', () => {
    expect(validateInput({ ...ok, shift: '' })).toEqual({ shift: '請揀日更定夜更' })
  })

  it('兩樣都未揀就兩個提示一齊出', () => {
    expect(validateInput({ ...ok, region: '', shift: '' })).toEqual({
      region: '請揀地區',
      shift: '請揀日更定夜更',
    })
  })

  it('個名淨係空白都當冇填', () => {
    expect(validateInput({ ...ok, name: '   ' }).name).toBe('請填個名')
  })

  it('選填欄留空唔會當錯', () => {
    expect(validateInput({ ...ok, odoo_ref: '', internal_note: '', start_time: '' })).toEqual({})
  })
})

describe('translateDbError', () => {
  it('not-null 錯誤會指返邊個欄位，用中文欄名', () => {
    expect(
      translateDbError(
        'null value in column "start_time" of relation "quote_records" violates not-null constraint',
      ),
    ).toBe('「預計開工」未填好，請檢查返再儲存。')
  })

  it('permission denied 譯成「未 GRANT」', () => {
    expect(translateDbError('permission denied for table quote_records')).toContain('GRANT')
  })

  it('RLS 擋住嘅講成權限問題', () => {
    expect(
      translateDbError('new row violates row-level security policy for table "quote_records"'),
    ).toContain('冇權限')
  })

  it('唔識嘅 error 都要出中文，唔可以彈返英文原文', () => {
    const message = translateDbError('some unexpected postgres explosion')
    expect(message).not.toContain('postgres')
    expect(message).toContain('請再試')
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
