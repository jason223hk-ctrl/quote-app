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
import { clientAddressLine, todayIso } from './labels'

const filled: RecordInput = {
  record_date: '2026-08-13',
  shift: 'night',
  name: '  荃灣路邊修剪  ',
  address: '荃灣海濱花園 1 座',
  region: 'NT',
  client: '碧瑤',
  contact: '陳生',
  phone: '9123 4567',
  internal_note: '   ',
  gps_lat: null,
  gps_lng: null,
  gps_at: null,
  address_source: 'manual',
  region_source: 'manual',
}

describe('inputToRow', () => {
  it('trim 所有欄，空白欄送空字串', () => {
    expect(inputToRow(filled)).toEqual({
      record_date: '2026-08-13',
      shift: 'night',
      name: '荃灣路邊修剪',
      address: '荃灣海濱花園 1 座',
      region: 'NT',
      client: '碧瑤',
      contact: '陳生',
      phone: '9123 4567',
      internal_note: '',
      gps_lat: null,
      gps_lng: null,
      gps_at: null,
      address_source: 'manual',
      region_source: 'manual',
    })
  })

  /**
   * Regression（2026-08-13 線上事故）：空白文字欄以前送 null，撞正 schema 嘅
   * not null default ''，現場同事填漏一欄就落唔到單。
   */
  it('文字欄全部留空都唔會出現 null', () => {
    const row = inputToRow({
      ...EMPTY_INPUT,
      record_date: '2026-08-13',
      name: '淨係填咗工程名稱',
      address: '某某道',
      region: 'NT',
    })

    for (const key of ['name', 'address', 'client', 'contact', 'phone', 'internal_note']) {
      expect(row[key]).not.toBeNull()
      expect(row[key]).not.toBeUndefined()
    }
    expect(row.client).toBe('')
    expect(row.contact).toBe('')
    expect(row.phone).toBe('')
    expect(row.internal_note).toBe('')
  })

  it('GPS 未用過就送 null（唔可以變 0）', () => {
    const row = inputToRow(EMPTY_INPUT)
    expect(row.gps_lat).toBeNull()
    expect(row.gps_lng).toBeNull()
    expect(row.gps_at).toBeNull()
    expect(row.gps_lat).not.toBe(0)
  })

  /**
   * Regression（P2.5）：main_con / site / start_time / odoo_ref 唔再喺表單，
   * 但欄位仲喺 DB。如果照送空字串就會靜靜刪咗舊單資料，
   * 所以呢幾個 key 一定唔可以出現喺 payload。
   */
  it('唔會掂舊表單欄位——main_con / site / start_time / odoo_ref 完全唔喺 payload', () => {
    const keys = Object.keys(inputToRow(filled))
    expect(keys).not.toContain('main_con')
    expect(keys).not.toContain('site')
    expect(keys).not.toContain('start_time')
    expect(keys).not.toContain('odoo_ref')
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
    address: '某某道 1 號',
    region: 'KLN',
  }

  it('必填三個齊晒就冇 error', () => {
    expect(validateInput(ok)).toEqual({})
  })

  it('工程名稱未填就攔住', () => {
    expect(validateInput({ ...ok, name: '   ' }).name).toBe('請填工程名稱')
  })

  it('地址未填就攔住，唔會去到 DB', () => {
    expect(validateInput({ ...ok, address: '' }).address).toBe('請填地址')
  })

  /** 地區影響夾車同吊機價，未揀一定要攔住，唔可以悄悄 default。 */
  it('地區未揀就攔住，唔會去到 DB', () => {
    expect(validateInput({ ...ok, region: '' }).region).toBe('請揀地區')
  })

  it('三個都未填就三個提示一齊出', () => {
    expect(validateInput({ ...ok, name: '', address: '', region: '' })).toEqual({
      name: '請填工程名稱',
      address: '請填地址',
      region: '請揀地區',
    })
  })

  it('客戶、聯絡人、電話、其他備註留空唔會當錯', () => {
    expect(validateInput({ ...ok, client: '', contact: '', phone: '', internal_note: '' })).toEqual(
      {},
    )
  })

  it('日／夜工作預設日更，唔會攔住', () => {
    expect(EMPTY_INPUT.shift).toBe('day')
    expect(validateInput(ok).shift).toBeUndefined()
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
  const base: QuoteRecord = {
    id: 'id-1',
    record_date: '2026-08-13',
    name: '單名',
    address: '荃灣海濱花園',
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
    main_con: '有利建築',
    site: '荃灣海濱花園',
    start_time: '下星期一朝早',
    odoo_ref: 'SO1234',
    status: 'site',
    markup_pct: null,
    price_snapshot: null,
    price_snapshot_at: null,
    archived: false,
    locked: false,
    transferred_project_id: null,
    created_by: 'user-1',
    created_at: '2026-08-13T00:00:00Z',
    updated_at: '2026-08-13T00:00:00Z',
    deleted_at: null,
  }

  it('DB 嘅 null 轉返空字串，input 先 render 得', () => {
    const input = rowToInput(base)
    expect(input.client).toBe('')
    expect(input.contact).toBe('')
    expect(input.internal_note).toBe('')
    expect(input.region).toBe('')
  })

  it('舊單冇 shift 就當日更', () => {
    expect(rowToInput(base).shift).toBe('day')
  })

  it('舊單嘅地址睇得返（Jason 已經將 site 抄咗入 address）', () => {
    expect(rowToInput(base).address).toBe('荃灣海濱花園')
  })

  /** 舊表單欄位唔會經表單行一圈——開返出嚟再儲存唔會整走佢哋。 */
  it('行一圈返嚟嘅 payload 冇 main_con / start_time / odoo_ref', () => {
    const keys = Object.keys(inputToRow(rowToInput(base)))
    expect(keys).not.toContain('main_con')
    expect(keys).not.toContain('start_time')
    expect(keys).not.toContain('odoo_ref')
    expect(keys).not.toContain('site')
  })
})

describe('clientAddressLine', () => {
  it('兩邊都有就用「-」駁埋', () => {
    expect(clientAddressLine('碧瑤', '荃灣海濱花園')).toBe('碧瑤，荃灣海濱花園')
  })

  it('一邊冇就唔會留低多餘嘅「-」', () => {
    expect(clientAddressLine(null, '荃灣海濱花園')).toBe('荃灣海濱花園')
    expect(clientAddressLine('碧瑤', null)).toBe('碧瑤')
    expect(clientAddressLine(null, null)).toBe('')
    expect(clientAddressLine('  ', '荃灣海濱花園')).toBe('荃灣海濱花園')
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
