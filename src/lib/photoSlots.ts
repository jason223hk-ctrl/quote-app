import {
  MITIGATION_LEGACY,
  OTHER_WORK_OPTIONS,
  PRUNING_OPTIONS,
  REMOVAL_OPTION,
  mitigationToken,
  optionLabel,
  type Option,
} from './options'

/**
 * 一棵樹上面有邊幾格影相。
 *
 * 純資料，冇 React、冇 DOM —— 所以測得到。
 * 規格出處：`docs/P3-現場影相-設計.md` 第一章「一個工序一格，格入面任影幾多張」。
 */
export type PhotoSlotSpec = {
  /** `null` = 全景格。 */
  mitigation: string | null
  title: string
  hint: string
}

const ALL: Option[] = [...PRUNING_OPTIONS, REMOVAL_OPTION, ...OTHER_WORK_OPTIONS]

export const WHOLE_TREE_SLOT: PhotoSlotSpec = {
  mitigation: null,
  title: '全景相（成棵樹）',
  hint: '影一張影到成棵樹嘅相。',
}

/**
 * ⛔ Legacy `pruning` 唔會出格（D8，Jason 2026-08-23）。
 *
 * 佢係群組標題唔係工序，**冇 token，砌唔到 Drive 檔名**。
 * 文案照 Jason 定嗰句，⛔ **一個字都唔准改**：
 * 一個具體動作（選擇一項修剪細項）＋ 一個具體對象（工序相片）。
 */
export const LEGACY_NO_SLOT_MESSAGE = '請先選擇一項修剪細項，然後拍攝工序相片。'

/**
 * 揀咗嘅工序 → 有邊幾格。
 *
 * ⛔ 順序跟返畫面上嘅順序（修剪四項 → 移除 → 其他五項），
 * 唔係跟用家撳嘅先後 —— 咁樣同一棵樹每次開都係同一個排法。
 */
export function slotsFor(mitigations: string[]): PhotoSlotSpec[] {
  const picked = new Set(mitigations)
  const slots: PhotoSlotSpec[] = [WHOLE_TREE_SLOT]

  for (const option of ALL) {
    if (!picked.has(option.value)) continue
    // ⛔ 冇 token 就砌唔到檔名，所以唔出格（legacy 就係咁）。
    if (mitigationToken(option.value) === null) continue
    slots.push({
      mitigation: option.value,
      title: option.label,
      hint: `呢一格係「${option.label}」嘅相，影幾多張都得。`,
    })
  }
  return slots
}

/** 呢棵樹係咪淨係得 legacy 代號 —— 係就要出 D8 嗰句。 */
export function needsLegacyNotice(mitigations: string[]): boolean {
  return mitigations.includes(MITIGATION_LEGACY) && slotsFor(mitigations).length === 1
}

/**
 * 「其他」嘅檔名 token：`Other-1`、`Other-2`…（D6 丙，Jason 2026-08-23）。
 *
 * ⛔ 點解唔用用家打嗰段字：`safeFilename` **唔會擋中文**，
 * 所以中文入得到檔名，但 **tree app 個類別排序認唔到佢**。
 * `Other-N` 係純英文，兩邊都安全。
 *
 * ⚠️ `n` 由 1 數起 —— 同一棵樹第幾個「其他」。
 */
export function otherToken(n: number): string {
  return `Other-${Math.max(1, Math.floor(n))}`
}

/** 格嘅標題用中文名；legacy 都顯示得返（「修剪（未細分）」）。 */
export function slotTitle(mitigation: string | null): string {
  return mitigation === null ? WHOLE_TREE_SLOT.title : optionLabel(ALL, mitigation)
}
