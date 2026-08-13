import { describe, expect, it } from 'vitest'
import {
  EMPTY_TREE_INPUT,
  duplicateTreeNos,
  nextTreeNo,
  treeInputToRow,
  treeToInput,
  validateTree,
  type QuoteTree,
} from './trees'
import { toggleValue } from './forms'

function makeTree(overrides: Partial<QuoteTree>): QuoteTree {
  return {
    id: 'tree-1',
    record_id: 'record-1',
    sort_order: 0,
    tree_no: '1',
    species: '細葉榕',
    height_m: null,
    dbh_mm: null,
    crown_m: null,
    mitigations: [],
    mitigation_other: '',
    note: '',
    lat: null,
    lng: null,
    location_adjusted: false,
    created_by: 'user-1',
    created_at: '2026-08-13T00:00:00Z',
    updated_at: '2026-08-13T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('treeInputToRow', () => {
  it('文字欄全部留空都唔會出現 null（P1 教訓）', () => {
    const row = treeInputToRow(EMPTY_TREE_INPUT)

    expect(row.tree_no).toBe('')
    expect(row.species).toBe('')
    expect(row.mitigation_other).toBe('')
    expect(row.note).toBe('')
    expect(row.mitigations).toEqual([])
  })

  it('數字欄留空就係 null，唔准變零', () => {
    const row = treeInputToRow(EMPTY_TREE_INPUT)

    expect(row.height_m).toBeNull()
    expect(row.dbh_mm).toBeNull()
    expect(row.crown_m).toBeNull()
    // 未量度同零係兩件事
    expect(row.height_m).not.toBe(0)
  })

  it('填咗數字就轉數字型', () => {
    const row = treeInputToRow({
      ...EMPTY_TREE_INPUT,
      height_m: '12.5',
      dbh_mm: '450',
      crown_m: '0',
    })

    expect(row.height_m).toBe(12.5)
    expect(row.dbh_mm).toBe(450)
    // 用家自己打 0 就係 0，只有留空先係 null
    expect(row.crown_m).toBe(0)
  })

  it('mitigation 可多揀，會原封不動存落去', () => {
    const row = treeInputToRow({
      ...EMPTY_TREE_INPUT,
      mitigations: ['pruning', 'crown_cleaning', 'cabling'],
    })

    expect(row.mitigations).toEqual(['pruning', 'crown_cleaning', 'cabling'])
  })

  it('揀咗 other 先會存 mitigation_other，冇揀就清返', () => {
    expect(
      treeInputToRow({
        ...EMPTY_TREE_INPUT,
        mitigations: ['other'],
        mitigation_other: '要搭棚先做到',
      }).mitigation_other,
    ).toBe('要搭棚先做到')

    expect(
      treeInputToRow({
        ...EMPTY_TREE_INPUT,
        mitigations: ['pruning'],
        mitigation_other: '舊嘢',
      }).mitigation_other,
    ).toBe('')
  })
})

describe('treeToInput', () => {
  it('DB 嘅 null 數字轉返空字串，唔會顯示成 0', () => {
    const input = treeToInput(makeTree({ height_m: null, dbh_mm: 450 }))
    expect(input.height_m).toBe('')
    expect(input.dbh_mm).toBe('450')
  })

  it('mitigations 行完一圈返嚟唔會跌', () => {
    const tree = makeTree({ mitigations: ['pruning', 'removal', 'other'], mitigation_other: '搭棚' })
    const row = treeInputToRow(treeToInput(tree))

    expect(row.mitigations).toEqual(['pruning', 'removal', 'other'])
    expect(row.mitigation_other).toBe('搭棚')
  })
})

describe('validateTree', () => {
  it('全部留空都過得（現場如實記錄）', () => {
    expect(validateTree(EMPTY_TREE_INPUT)).toEqual({})
  })

  it('數字欄填咗唔係數字就攔住，唔會去到 DB', () => {
    const errors = validateTree({ ...EMPTY_TREE_INPUT, height_m: '好高' })
    expect(errors.height_m).toContain('數字')
  })

  it('負數唔收', () => {
    expect(validateTree({ ...EMPTY_TREE_INPUT, dbh_mm: '-5' }).dbh_mm).toBeTruthy()
  })
})

describe('nextTreeNo', () => {
  it('第一棵樹係 1', () => {
    expect(nextTreeNo([])).toBe('1')
  })

  it('順住現有最大號派下一個', () => {
    expect(nextTreeNo([makeTree({ id: 'a', tree_no: '1' }), makeTree({ id: 'b', tree_no: '2' })])).toBe(
      '3',
    )
  })

  it('現有編號唔係數字都唔會爆', () => {
    expect(nextTreeNo([makeTree({ id: 'a', tree_no: 'A1' })])).toBe('2')
  })
})

describe('duplicateTreeNos', () => {
  it('兩棵撞同一個編號要報出嚟（但係警告，唔係阻止）', () => {
    const trees = [
      makeTree({ id: 'a', tree_no: '3' }),
      makeTree({ id: 'b', tree_no: '3' }),
      makeTree({ id: 'c', tree_no: '4' }),
    ]
    expect(duplicateTreeNos(trees)).toEqual(['3'])
  })

  it('冇撞就冇警告', () => {
    expect(duplicateTreeNos([makeTree({ id: 'a', tree_no: '1' })])).toEqual([])
  })

  it('空編號唔當撞', () => {
    const trees = [makeTree({ id: 'a', tree_no: '' }), makeTree({ id: 'b', tree_no: '  ' })]
    expect(duplicateTreeNos(trees)).toEqual([])
  })
})

describe('toggleValue', () => {
  it('撳一下開，再撳一下閂，唔會影響其他選項', () => {
    expect(toggleValue(['pruning'], 'removal')).toEqual(['pruning', 'removal'])
    expect(toggleValue(['pruning', 'removal'], 'pruning')).toEqual(['removal'])
  })
})
