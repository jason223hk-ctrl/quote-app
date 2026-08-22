import { describe, expect, it } from 'vitest'
import { pairedNumber, photoFilename, projectFolderName, safeFilename } from './names.mjs'

describe('safeFilename（tree app 原文）', () => {
  it('非法字元換底線', () => {
    expect(safeFilename('T/7:58*?')).toBe('T_7_58__')
  })
  it('空就 untitled', () => {
    expect(safeFilename('')).toBe('untitled')
    expect(safeFilename('   ')).toBe('untitled')
  })
  it('最多 80 字', () => {
    expect(safeFilename('x'.repeat(200))).toHaveLength(80)
  })
  it('中文照留', () => {
    expect(safeFilename('裘錦秋中學')).toBe('裘錦秋中學')
  })
})

describe('projectFolderName', () => {
  it('工作日期_工程名', () => {
    expect(projectFolderName('2026-08-15', '裘錦秋中學')).toBe('2026-08-15_裘錦秋中學')
  })
  it('⛔ 冇 Odoo 單號', () => {
    expect(projectFolderName('2026-08-15', '裘錦秋中學')).not.toMatch(/Order/i)
  })
})

describe('⛔ NN 係成對編號', () => {
  it('第一張 01、第二張 03、第三張 05', () => {
    expect([1, 2, 3].map(pairedNumber)).toEqual(['01', '03', '05'])
  })
  it('⛔ 全部單數 —— 雙數留返俾 tree app 補後相', () => {
    for (const seq of [1, 2, 3, 4, 5]) expect(Number(pairedNumber(seq)) % 2).toBe(1)
  })
  it('⛔ 冇「0 當 1」嘅特例 —— seq 由 1 數起係寫入嗰邊嘅責任', () => {
    expect(pairedNumber(0)).toBe('-1')
  })
  it('兩位數', () => {
    expect(pairedNumber(1)).toBe('01')
    expect(pairedNumber(6)).toBe('11')
  })
})

describe('photoFilename', () => {
  it('四段用底線接埋，類別喺 NN 之前', () => {
    expect(photoFilename('T1', 'Whole View', 1)).toBe('T1_Whole View_01_Before.jpg')
  })
  it('工序相', () => {
    expect(photoFilename('T1', 'Crown Cleaning', 2)).toBe('T1_Crown Cleaning_03_Before.jpg')
  })
  it('⛔ 尾段永遠 Before，冇 After', () => {
    expect(photoFilename('T1', 'Close Up', 1)).not.toContain('After')
  })
  it('樹編號照清洗', () => {
    expect(photoFilename('T/7:58*?', 'Whole View', 1)).toBe('T_7_58___Whole View_01_Before.jpg')
  })
  it('⛔ 冇 token 就砌唔到，回 null —— 唔准靠估', () => {
    expect(photoFilename('T1', null, 1)).toBeNull()
    expect(photoFilename('T1', '', 1)).toBeNull()
  })
})
