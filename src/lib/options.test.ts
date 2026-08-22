import { describe, expect, it } from 'vitest'
import {
  LEGACY_MITIGATION_OPTIONS,
  MITIGATION_LEGACY,
  MITIGATION_OPTIONS,
  MITIGATION_OTHER,
  OTHER_WORK_OPTIONS,
  PRUNING_OPTIONS,
  SELECTABLE_MITIGATIONS,
  hasLegacyMitigation,
  isSelectableMitigation,
  mitigationToken,
  optionLabels,
} from './options'

/**
 * tree app `PRUNING_WORK_TYPES` 嘅原文。
 * ⛔ 一個字都唔准差，大細楷都要啱 —— 呢五個字串就係 Drive 檔名入面
 * 嗰個類別 token，對唔上張相就入唔到 tree app 個類別排序。
 */
const TREE_APP_TOKENS = [
  'Crown Cleaning',
  'Crown Reduction',
  'Crown Thinning',
  'Crown Raising',
  'Close Up',
]

describe('英文 token 要同 tree app 一個字唔差', () => {
  it('五個 token 全部有', () => {
    const ours = SELECTABLE_MITIGATIONS.map((option) => option.en)
    for (const token of TREE_APP_TOKENS) {
      expect(ours, `爭咗 ${token}`).toContain(token)
    }
  })

  it('⛔ 大細楷要啱 —— 唔可以係 "Crown cleaning"', () => {
    const ours = SELECTABLE_MITIGATIONS.map((option) => option.en)
    expect(ours).not.toContain('Crown cleaning')
    expect(ours).not.toContain('Crown reduction')
    expect(ours).not.toContain('Crown raising')
  })

  it('每個代號都砌得出一個 token', () => {
    for (const option of SELECTABLE_MITIGATIONS) {
      expect(mitigationToken(option.value)).toBe(option.en)
    }
  })
})

describe('新結構', () => {
  it('修剪有四個細項', () => {
    expect(PRUNING_OPTIONS.map((option) => option.value)).toEqual([
      'crown_cleaning',
      'crown_thinning',
      'crown_reduction',
      'crown_raising',
    ])
  })

  it('平排項目有五個加其他', () => {
    expect(OTHER_WORK_OPTIONS.map((option) => option.value)).toEqual([
      'removal',
      'stump_removal',
      'cabling',
      'root_pruning',
      'close_up',
      MITIGATION_OTHER,
    ])
  })

  it('中文名跟 Jason 定嗰套', () => {
    const labels = Object.fromEntries(
      SELECTABLE_MITIGATIONS.map((option) => [option.value, option.label]),
    )
    expect(labels.crown_cleaning).toBe('清理樹冠')
    expect(labels.crown_thinning).toBe('疏枝')
    expect(labels.crown_reduction).toBe('縮減樹冠')
    expect(labels.crown_raising).toBe('提升樹冠')
    expect(labels.removal).toBe('移除')
    expect(labels.close_up).toBe('近景')
  })

  it('冇代號撞名', () => {
    const values = MITIGATION_OPTIONS.map((option) => option.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('⛔ legacy pruning', () => {
  it('揀唔到 —— 新單只可以揀細項', () => {
    expect(isSelectableMitigation(MITIGATION_LEGACY)).toBe(false)
    expect(SELECTABLE_MITIGATIONS.map((option) => option.value)).not.toContain(MITIGATION_LEGACY)
  })

  it('但顯示得返「修剪（未細分）」', () => {
    expect(optionLabels(MITIGATION_OPTIONS, [MITIGATION_LEGACY])).toEqual(['修剪（未細分）'])
  })

  it('⛔ 唔可以空白、⛔ 唔可以出返個代號', () => {
    const [label] = optionLabels(MITIGATION_OPTIONS, [MITIGATION_LEGACY])
    expect(label.trim()).not.toBe('')
    expect(label).not.toBe(MITIGATION_LEGACY)
  })

  it('⛔ 唔可以 throw', () => {
    expect(() => optionLabels(MITIGATION_OPTIONS, [MITIGATION_LEGACY])).not.toThrow()
  })

  it('⛔ 唔可以喺清單度消失 —— 同其他工序一齊擺都要見到', () => {
    expect(optionLabels(MITIGATION_OPTIONS, [MITIGATION_LEGACY, 'removal'])).toEqual([
      '修剪（未細分）',
      '移除',
    ])
  })

  it('認得出一棵樹係舊格式', () => {
    expect(hasLegacyMitigation([MITIGATION_LEGACY])).toBe(true)
    expect(hasLegacyMitigation(['crown_cleaning'])).toBe(false)
    expect(hasLegacyMitigation([])).toBe(false)
  })

  it('⛔ 冇 token —— 所以呢種樹影唔到工序相，淨係影得全景相', () => {
    expect(mitigationToken(MITIGATION_LEGACY)).toBeNull()
  })

  it('legacy 清單得佢一個，唔會偷偷混入揀得嘅嘢', () => {
    expect(LEGACY_MITIGATION_OPTIONS.map((option) => option.value)).toEqual([MITIGATION_LEGACY])
  })
})

describe('唔識嘅代號', () => {
  it('照出返個代號，唔會 throw、唔會空白', () => {
    expect(optionLabels(MITIGATION_OPTIONS, ['未來某個代號'])).toEqual(['未來某個代號'])
  })
})
