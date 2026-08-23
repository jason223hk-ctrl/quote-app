import { describe, expect, it } from 'vitest'
import {
  LEGACY_NO_SLOT_MESSAGE,
  WHOLE_TREE_SLOT,
  needsLegacyNotice,
  otherToken,
  slotTitle,
  slotsFor,
} from './photoSlots'
import { MITIGATION_LEGACY } from './options'

describe('slotsFor', () => {
  it('乜都冇揀都有全景格', () => {
    expect(slotsFor([]).map((s) => s.mitigation)).toEqual([null])
  })

  it('揀一個工序就多一格', () => {
    expect(slotsFor(['crown_cleaning']).map((s) => s.mitigation)).toEqual([null, 'crown_cleaning'])
  })

  it('⛔ 順序跟畫面排法，唔跟用家撳嘅先後', () => {
    const picked = ['other', 'removal', 'crown_raising', 'crown_cleaning']
    expect(slotsFor(picked).map((s) => s.mitigation)).toEqual([
      null,
      'crown_cleaning',
      'crown_raising',
      'removal',
      'other',
    ])
  })

  it('⛔ legacy `pruning` 唔會出格 —— 佢冇 token，砌唔到檔名', () => {
    expect(slotsFor([MITIGATION_LEGACY]).map((s) => s.mitigation)).toEqual([null])
  })

  it('legacy 加一個細項：細項出格，legacy 唔出', () => {
    expect(slotsFor([MITIGATION_LEGACY, 'crown_thinning']).map((s) => s.mitigation)).toEqual([
      null,
      'crown_thinning',
    ])
  })

  it('每格都有中文標題同提示', () => {
    for (const slot of slotsFor(['close_up', 'stump_removal'])) {
      expect(slot.title.trim()).not.toBe('')
      expect(slot.hint.trim()).not.toBe('')
    }
  })
})

describe('⛔ legacy 樹要講到明點做（D8）', () => {
  it('淨係得 legacy 就要出提示', () => {
    expect(needsLegacyNotice([MITIGATION_LEGACY])).toBe(true)
  })

  it('揀咗細項之後就唔使出', () => {
    expect(needsLegacyNotice([MITIGATION_LEGACY, 'crown_cleaning'])).toBe(false)
  })

  it('冇 legacy 就唔關事', () => {
    expect(needsLegacyNotice(['removal'])).toBe(false)
  })

  it('文案要有一個具體動作同一個具體對象', () => {
    expect(LEGACY_NO_SLOT_MESSAGE).toBe('請先選擇一項修剪細項，然後拍攝工序相片。')
  })
})

describe('otherToken（D6 丙）', () => {
  it('Other-1、Other-2', () => {
    expect(otherToken(1)).toBe('Other-1')
    expect(otherToken(2)).toBe('Other-2')
  })

  it('⛔ 純英文 —— 中文入唔到檔名', () => {
    expect(otherToken(3)).toMatch(/^[A-Za-z]+-\d+$/)
  })

  it('唔會出 0 或者負數', () => {
    expect(otherToken(0)).toBe('Other-1')
    expect(otherToken(-5)).toBe('Other-1')
  })
})

describe('slotTitle', () => {
  it('全景格', () => {
    expect(slotTitle(null)).toBe(WHOLE_TREE_SLOT.title)
  })

  it('工序格用中文名', () => {
    expect(slotTitle('crown_thinning')).toBe('疏枝')
  })
})
