import { describe, expect, it } from 'vitest'
import {
  EMPTY_SITE_FORM_INPUT,
  siteFormToInput,
  siteFormToRow,
  validateSiteForm,
  type SiteForm,
} from './siteForm'
import { CRANE_OPTIONS, LIFT_OPTIONS, STUMP_OPTIONS, WASTE_OPTIONS } from './options'

describe('siteFormToRow', () => {
  it('人手三個數字留空就係 null，唔准變零', () => {
    const row = siteFormToRow({ ...EMPTY_SITE_FORM_INPUT, waste_options: ['none'] })

    expect(row.crew_total).toBeNull()
    expect(row.work_days).toBeNull()
    expect(row.climbers_per_day).toBeNull()
    expect(row.crew_total).not.toBe(0)
  })

  it('文字欄永遠唔送 null', () => {
    const row = siteFormToRow({ ...EMPTY_SITE_FORM_INPUT, waste_options: ['none'] })
    expect(row.lift_other).toBe('')
  })

  it('陣列欄永遠送陣列，就算乜都冇揀', () => {
    const row = siteFormToRow(EMPTY_SITE_FORM_INPUT)
    expect(row.waste_options).toEqual([])
    expect(row.machine_options).toEqual([])
    expect(row.stump_options).toEqual([])
  })

  it('揀咗夾車先存架數；冇揀就清返 null，唔會留低舊數字', () => {
    expect(
      siteFormToRow({ ...EMPTY_SITE_FORM_INPUT, waste_options: ['t24'], waste_t24_qty: '2' })
        .waste_t24_qty,
    ).toBe(2)

    expect(
      siteFormToRow({ ...EMPTY_SITE_FORM_INPUT, waste_options: ['t9'], waste_t24_qty: '2' })
        .waste_t24_qty,
    ).toBeNull()
  })

  it('揀咗夾車但未填架數 = null（唔會變零架）', () => {
    const row = siteFormToRow({ ...EMPTY_SITE_FORM_INPUT, waste_options: ['t30'] })
    expect(row.waste_t30_qty).toBeNull()
  })

  it('揀咗 lift_other 先存打字欄，冇揀就清返空字串', () => {
    expect(
      siteFormToRow({
        ...EMPTY_SITE_FORM_INPUT,
        machine_options: ['lift_other'],
        lift_other: '60M 特別租',
      }).lift_other,
    ).toBe('60M 特別租')

    expect(
      siteFormToRow({
        ...EMPTY_SITE_FORM_INPUT,
        machine_options: ['lift_18'],
        lift_other: '舊嘢',
      }).lift_other,
    ).toBe('')
  })

  /** 總規則：全部任揀，冇任何互斥，App 唔幫人糾正。 */
  it('「垃圾不用清走」同「24噸夾車」可以同時存在', () => {
    const row = siteFormToRow({
      ...EMPTY_SITE_FORM_INPUT,
      waste_options: ['none', 't24'],
      waste_t24_qty: '1',
    })

    expect(row.waste_options).toEqual(['none', 't24'])
    expect(row.waste_t24_qty).toBe(1)
  })

  it('機械「不用」同吊雞、升降台可以同時存在', () => {
    const row = siteFormToRow({
      ...EMPTY_SITE_FORM_INPUT,
      waste_options: ['none'],
      machine_options: ['none', 'crane_fatboy', 'lift_18', 'lift_46'],
    })

    expect(row.machine_options).toEqual(['none', 'crane_fatboy', 'lift_18', 'lift_46'])
  })

  it('起樹頭三個都揀得，包括「自己起」加「銓哥報價」加「不要」', () => {
    const row = siteFormToRow({
      ...EMPTY_SITE_FORM_INPUT,
      waste_options: ['none'],
      stump_options: ['yes_self', 'yes_chuen', 'no'],
    })

    expect(row.stump_options).toEqual(['yes_self', 'yes_chuen', 'no'])
  })
})

describe('validateSiteForm', () => {
  it('垃圾處理未揀就攔住，唔會去到 DB', () => {
    expect(validateSiteForm(EMPTY_SITE_FORM_INPUT).waste_options).toBe('請至少揀一個垃圾處理方法')
  })

  it('淨係揀咗垃圾處理，其餘全部留空都過得', () => {
    expect(validateSiteForm({ ...EMPTY_SITE_FORM_INPUT, waste_options: ['t9'] })).toEqual({})
  })

  it('人手填咗唔係數字就攔住，並且指名邊個欄', () => {
    const errors = validateSiteForm({
      ...EMPTY_SITE_FORM_INPUT,
      waste_options: ['none'],
      crew_total: '大概五個',
    })
    expect(errors.crew_total).toBeTruthy()
    expect(errors.work_days).toBeUndefined()
  })
})

describe('siteFormToInput', () => {
  it('未有紀錄就出一張空表', () => {
    expect(siteFormToInput(null)).toEqual(EMPTY_SITE_FORM_INPUT)
  })

  it('DB 嘅 null 數字轉返空字串，唔會顯示成 0', () => {
    const form: SiteForm = {
      record_id: 'record-1',
      crew_total: null,
      work_days: 3,
      climbers_per_day: null,
      waste_options: ['t24'],
      waste_t24_qty: 2,
      waste_t30_qty: null,
      machine_options: ['crane_fatboy'],
      lift_other: '',
      stump_options: [],
      updated_by: 'user-1',
      created_at: '2026-08-13T00:00:00Z',
      updated_at: '2026-08-13T00:00:00Z',
    }

    const input = siteFormToInput(form)
    expect(input.crew_total).toBe('')
    expect(input.work_days).toBe('3')
    expect(input.waste_t24_qty).toBe('2')
    expect(input.waste_t30_qty).toBe('')
  })
})

describe('選項清單', () => {
  it('代號同真實 schema 對得返', () => {
    expect(WASTE_OPTIONS.map((o) => o.value)).toEqual(['t24', 't30', 't9', 'none'])
    expect(CRANE_OPTIONS.map((o) => o.value)).toEqual([
      'crane_fatboy',
      'crane_fai30',
      'crane_fai86',
      'crane_fai100',
    ])
    expect(LIFT_OPTIONS.map((o) => o.value)).toEqual([
      'lift_18',
      'lift_25',
      'lift_32',
      'lift_37',
      'lift_46',
      'lift_other',
    ])
    expect(STUMP_OPTIONS.map((o) => o.value)).toEqual(['yes_self', 'yes_chuen', 'no'])
  })

  it('每個選項都有中英文（PDF 要用英文）', () => {
    for (const option of [...WASTE_OPTIONS, ...CRANE_OPTIONS, ...LIFT_OPTIONS, ...STUMP_OPTIONS]) {
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.en.length).toBeGreaterThan(0)
    }
  })
})
