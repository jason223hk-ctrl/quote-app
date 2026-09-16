import { describe, expect, it } from 'vitest'
import { MITIGATION_LEGACY, SELECTABLE_MITIGATIONS } from './options'
import {
  CONFLICTS_WITH_REMOVAL,
  REMOVAL,
  blockedReason,
  bothPicked,
  canPick,
} from './removalExclusive'

/* ══════════════════════════════════════════════════════════════════
   Jason 2026-08-24 原話：「移除係獨立，有移除就唔會有修剪同拉索加固，
   可能會起樹頭」（P3f §12）。下面逐格照嗰張表。
   ══════════════════════════════════════════════════════════════════ */

describe('⛔ 有移除 ⇒ 修剪同拉索加固剪唔到', () => {
  const removal = [REMOVAL]

  it.each(['crown_cleaning', 'crown_thinning', 'crown_reduction', 'crown_raising'])(
    '已經列為移除 ⇒ %s 剪唔到，而且出「此樹已列為移除」',
    (value) => {
      expect(canPick(removal, value)).toBe(false)
      expect(blockedReason(removal, value)).toBe('修剪（此樹已列為移除）')
    },
  )

  it('拉索加固都剪唔到，⛔ 但佢有自己嗰句', () => {
    expect(blockedReason(removal, 'cabling')).toBe('拉索加固（此樹已列為移除）')
  })
})

describe('⛔ 有修剪／拉索 ⇒ 移除剪唔到', () => {
  it.each(['crown_cleaning', 'crown_thinning', 'crown_reduction', 'crown_raising', 'cabling'])(
    '已經有 %s ⇒ 移除剪唔到',
    (value) => {
      expect(blockedReason([value], REMOVAL)).toBe('移除（此樹已有修剪工序）')
    },
  )

  it('⚠️ 舊單嗰個「修剪（未細分）」都算修剪 —— ⛔ 唔准漏', () => {
    // ⭐ 漏咗佢，舊樹剔住 legacy 再剔移除就靜靜咁過到，
    //    而舊單正正就係最多呢種嘢嗰批。
    expect(blockedReason([MITIGATION_LEGACY], REMOVAL)).toBe('移除（此樹已有修剪工序）')
  })
})

describe('✅ 唔准擋嗰啲', () => {
  it('⭐ 移除 ＋ 起樹頭 係正常組合（P3f 明文）', () => {
    expect(canPick([REMOVAL], 'stump_removal')).toBe(true)
    expect(canPick(['stump_removal'], REMOVAL)).toBe(true)
  })

  it('近景、其他 兩邊都加得', () => {
    for (const value of ['close_up', 'other']) {
      expect(canPick([REMOVAL], value)).toBe(true)
      expect(canPick(['crown_cleaning'], value)).toBe(true)
    }
  })

  it('修根⛔ 唔喺互斥表入面（P3f 嗰張表冇佢）', () => {
    expect(canPick([REMOVAL], 'root_pruning')).toBe(true)
  })

  it('乜都未剔 ⇒ 樣樣都剪得', () => {
    for (const option of SELECTABLE_MITIGATIONS) {
      expect(canPick([], option.value)).toBe(true)
    }
  })

  it('幾項修剪一齊剔 ⇒ ⛔ 唔關佢哋事', () => {
    expect(canPick(['crown_cleaning'], 'crown_thinning')).toBe(true)
  })
})

describe('⛔⛔ 已經剔咗嘅，永遠剪得返轉頭', () => {
  /* ⚠️ 呢組守嘅係附錄 B 嗰條「一條規矩啱、但冇出口」。
     一棵舊樹兩樣都有，如果連「剔走其中一樣」都擋住，
     佢就永遠卡死喺違規狀態，⛔ 連修都修唔到。 */
  it('兩樣都有嘅舊樹 ⇒ 兩邊都剔得走', () => {
    const both = [REMOVAL, 'crown_cleaning']
    expect(canPick(both, REMOVAL)).toBe(true)
    expect(canPick(both, 'crown_cleaning')).toBe(true)
  })

  it('剔走咗修剪之後，移除照剔得返', () => {
    expect(canPick([REMOVAL], REMOVAL)).toBe(true)
  })
})

describe('⚠️ 認得出舊資料，⛔ 但唔會郁佢', () => {
  it('兩樣都有 ⇒ 認得出', () => {
    expect(bothPicked([REMOVAL, 'crown_thinning'])).toBe(true)
    expect(bothPicked([REMOVAL, MITIGATION_LEGACY])).toBe(true)
    expect(bothPicked([REMOVAL, 'cabling'])).toBe(true)
  })

  it('⭐ 移除 ＋ 起樹頭 ⛔ 唔算違規', () => {
    expect(bothPicked([REMOVAL, 'stump_removal'])).toBe(false)
  })

  it('淨係一邊 ⇒ 唔算', () => {
    expect(bothPicked([REMOVAL])).toBe(false)
    expect(bothPicked(['crown_cleaning'])).toBe(false)
    expect(bothPicked([])).toBe(false)
  })

  it('⛔⛔ 呢個檔一句都唔准自己改資料 —— 傳入去嗰個 array 原封不動', () => {
    // ⚠️ 靜靜雞抹走人哋存咗嘅嘢係最差嗰個做法。呢條測試就係守住呢句。
    const original = [REMOVAL, 'crown_cleaning']
    const copy = [...original]
    bothPicked(original)
    canPick(original, 'cabling')
    blockedReason(original, REMOVAL)
    expect(original).toEqual(copy)
  })
})

describe('⛔ 互斥表本身', () => {
  it('五項，⛔ 唔多唔少', () => {
    expect([...CONFLICTS_WITH_REMOVAL].sort()).toEqual(
      ['cabling', 'crown_cleaning', 'crown_raising', 'crown_reduction', 'crown_thinning'].sort(),
    )
  })

  it('⛔ 起樹頭⛔ 唔喺入面', () => {
    expect(CONFLICTS_WITH_REMOVAL).not.toContain('stump_removal')
  })
})
