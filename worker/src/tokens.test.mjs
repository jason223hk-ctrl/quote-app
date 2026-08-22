import { describe, expect, it } from 'vitest'
import { MITIGATION_TOKENS } from './names.mjs'
import { SELECTABLE_MITIGATIONS, MITIGATION_LEGACY } from '../../src/lib/options'

/**
 * Worker 同前端各有一份 mitigation → token 嘅對照。
 * ⛔ 兩份一個字都唔可以差，否則 Drive 檔名同畫面對唔上。
 * 呢個測試就係唔准佢哋分家。
 */
describe('Worker 同 options.ts 嘅 token 要一模一樣', () => {
  it('每個揀得嘅代號，Worker 都有同一個 token', () => {
    for (const option of SELECTABLE_MITIGATIONS) {
      expect(MITIGATION_TOKENS[option.value], `${option.value} 對唔上`).toBe(option.en)
    }
  })

  it('Worker 冇多咗代號出嚟', () => {
    expect(Object.keys(MITIGATION_TOKENS).sort()).toEqual(
      SELECTABLE_MITIGATIONS.map((option) => option.value).sort(),
    )
  })

  it('⚠️ legacy `pruning` 特登冇 token —— 佢係群組標題，唔係工序', () => {
    expect(MITIGATION_TOKENS[MITIGATION_LEGACY]).toBeUndefined()
  })
})
