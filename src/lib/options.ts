/**
 * 現場用嘅選項清單。
 *
 * 呢啲嘢 P4 會搬去 admin 設定頁俾人自己加減，所以一律當佢係「資料」：
 * 集中喺呢個檔，UI 只負責 render，唔好散落喺 JSX 度寫死。
 *
 * `en` 係之後出 PDF 俾客人用嘅英文名，唔可以淨係留中文。
 */
export type Option = {
  value: string
  label: string
  en: string
}

/**
 * 樹木處理方法。
 *
 * ⚠️ 2026-08-22 重新分組（推翻咗 08-14「唔駛改工序名」嗰個決定，理由見
 * `docs/開發紀錄.md` §5.4）：**啲英文名唔係「PDF 好唔好睇」，
 * 佢就係 Drive 檔名入面嗰個類別 token** —— 對唔上，張相就入唔到 tree app
 * 個類別排序，「跟返 tree app 命名格式就可以放返入 tree app 用」就兌現唔到。
 *
 * ⛔ 下面五個 token（`Crown Cleaning`、`Crown Thinning`、`Crown Reduction`、
 * `Crown Raising`、`Close Up`）係 tree app `PRUNING_WORK_TYPES` 嘅**原文**，
 * **大細楷一個字都唔准差**。
 */

/** 修剪嗰四個細項。⛔ 「修剪」本身唔係一個揀得嘅代號，係一個群組標題。 */
export const PRUNING_OPTIONS: Option[] = [
  { value: 'crown_cleaning', label: '清理樹冠', en: 'Crown Cleaning' },
  { value: 'crown_thinning', label: '疏枝', en: 'Crown Thinning' },
  { value: 'crown_reduction', label: '縮減樹冠', en: 'Crown Reduction' },
  { value: 'crown_raising', label: '提升樹冠', en: 'Crown Raising' },
]

/**
 * 「移除」自己一個位，同「修剪」同一級（Jason 2026-08-22 逐格確認）。
 *
 * **點解唔擺喺「其他處理方法」**：**斬走成棵樹係一件同修剪同級嘅大事**，
 * 唔應該收埋喺「其他」入面。
 *
 * ⚠️ 但佢同「修剪」有一樣唔同：**「修剪」係純標題，剔唔到；「移除」係可剔選項。**
 */
export const REMOVAL_OPTION: Option = { value: 'removal', label: '移除', en: 'Removal' }

/**
 * 「其他處理方法」組，五項。
 *
 * ⚠️ `close_up`（近景）**本身唔係一種處理方法，係一種相**。
 * 擺喺呢度唔完美，**但係 Jason 拍板嘅位置，⛔ 唔准自己再搬。**
 */
export const OTHER_WORK_OPTIONS: Option[] = [
  { value: 'stump_removal', label: '起樹頭', en: 'Stump Removal' },
  { value: 'cabling', label: '拉索加固', en: 'Cabling' },
  { value: 'root_pruning', label: '修根', en: 'Root Pruning' },
  { value: 'close_up', label: '近景', en: 'Close Up' },
  // ⚠️ `Other-1`，唔係 `Other`（D6 丙，Jason 2026-08-23 拍板，⛔ 唔重開）。
  // ⛔ 呢個 `en` 同 Worker `MITIGATION_TOKENS` 要一個字都唔差 ——
  //    `worker/src/tokens.test.mjs` 就係唔准佢哋分家。
  { value: 'other', label: '其他', en: 'Other-1' },
]

export const MITIGATION_OTHER = 'other'

/**
 * ⛔ Legacy 代號，**淨係用嚟顯示返舊單，唔可以揀**。
 *
 * `pruning` 以前係一個揀得嘅葉，2026-08-22 之後變成群組標題。
 * 2026-08-22 實測：`quote_trees` 入面有 **2 行**用過佢
 * （P2 試用期、Jason 本人開嘅測試資料）。
 *
 * `CLAUDE.md` 零真刪 + 舊單資料要永遠查得返，所以：
 * ⛔ 唔准 update 舊行、⛔ 唔准自動幫佢揀細項、⛔ 唔准喺清單度畀人揀返佢。
 */
export const MITIGATION_LEGACY = 'pruning'

export const LEGACY_MITIGATION_OPTIONS: Option[] = [
  { value: MITIGATION_LEGACY, label: '修剪（未細分）', en: 'Pruning (unspecified)' },
]

/**
 * 揀得嘅嘢。⛔ **唔包 legacy** —— 新單只可以揀四個細項同五個平排項。
 */
export const SELECTABLE_MITIGATIONS: Option[] = [
  ...PRUNING_OPTIONS,
  REMOVAL_OPTION,
  ...OTHER_WORK_OPTIONS,
]

/**
 * 查名用嘅完整清單。**包埋 legacy**，所以舊單顯示得返「修剪（未細分）」，
 * 唔會空白、唔會出返個代號。
 *
 * ⚠️ 呢個係**顯示**用，唔係揀嘢用。揀嘢要用 `PRUNING_OPTIONS` +
 * `OTHER_WORK_OPTIONS`（見 `TreeFormPage`）。
 */
export const MITIGATION_OPTIONS: Option[] = [
  ...SELECTABLE_MITIGATIONS,
  ...LEGACY_MITIGATION_OPTIONS,
]

/** 揀唔揀得。legacy 一律唔畀揀。 */
export function isSelectableMitigation(value: string): boolean {
  return SELECTABLE_MITIGATIONS.some((option) => option.value === value)
}

/**
 * 有冇 legacy 代號喺入面 —— 有就代表呢棵樹係舊單，
 * 畫面要講到明，⛔ 唔准靜靜咁當佢冇嘢揀過。
 */
export function hasLegacyMitigation(values: string[]): boolean {
  return values.includes(MITIGATION_LEGACY)
}

/**
 * Drive 檔名用嘅類別 token。
 *
 * ⚠️ legacy `pruning` **冇 token** —— 佢係群組標題，唔係一個工序。
 * 即係話**只有 legacy、冇細分嗰棵樹影唔到工序相**，淨係影得全景相。
 * 呢件事要喺畫面講清楚，唔好等到現場先發現。
 */
export function mitigationToken(value: string): string | null {
  return SELECTABLE_MITIGATIONS.find((option) => option.value === value)?.en ?? null
}

/** 垃圾處理。必填，至少揀一個。t24 / t30 揀咗要填架數。 */
export const WASTE_OPTIONS: Option[] = [
  { value: 't24', label: '24噸夾車', en: '24T grab lorry' },
  { value: 't30', label: '30噸夾車', en: '30T grab lorry' },
  { value: 't9', label: '9噸碎', en: '9T chipper truck' },
  { value: 'none', label: '垃圾不用清走', en: 'No waste removal' },
]

/** 揀邊個選項先要填架數，同埋架數存去邊個欄。 */
export const WASTE_QTY_FIELDS = {
  t24: 'waste_t24_qty',
  t30: 'waste_t30_qty',
} as const

/**
 * 吊雞。肥仔就係東哥，同一個人，app 一律顯示「肥仔」。
 */
export const CRANE_OPTIONS: Option[] = [
  { value: 'crane_fatboy', label: '肥仔 - 30噸', en: 'Fat Boy 30T' },
  { value: 'crane_fai30', label: '輝哥 - 30噸 + 科同', en: 'Fai 30T + Foton' },
  { value: 'crane_fai86', label: '輝哥 8+6', en: 'Fai 8+6' },
  { value: 'crane_fai100', label: '輝哥 100T 8+6尾', en: 'Fai 100T 8+6' },
]

/** 升降台。lift_other 揀咗先彈打字欄，內容存去 lift_other 欄。 */
export const LIFT_OPTIONS: Option[] = [
  { value: 'lift_18', label: '18M', en: '18M lift' },
  { value: 'lift_25', label: '25M', en: '25M lift' },
  { value: 'lift_32', label: '32M', en: '32M lift' },
  { value: 'lift_37', label: '37M', en: '37M lift' },
  { value: 'lift_46', label: '46M', en: '46M lift' },
  { value: 'lift_other', label: 'Other', en: 'Other lift' },
]

export const LIFT_OTHER = 'lift_other'

/** 機械組嘅「不用」。純粹記錄，唔會熄其他掣。 */
export const MACHINE_NONE_OPTIONS: Option[] = [
  { value: 'none', label: '不用', en: 'No machine' },
]

/** 機械組三個細組合埋一齊存落 machine_options。 */
export const MACHINE_OPTIONS: Option[] = [
  ...CRANE_OPTIONS,
  ...LIFT_OPTIONS,
  ...MACHINE_NONE_OPTIONS,
]

/** 起樹頭。三個都可以獨立揀，冇任何互斥。 */
export const STUMP_OPTIONS: Option[] = [
  { value: 'yes_self', label: '自己起', en: 'Self' },
  { value: 'yes_chuen', label: '銓哥報價', en: 'Chuen quote' },
  { value: 'no', label: '不要', en: 'No' },
]

export function optionLabel(options: Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
}

export function optionLabels(options: Option[], values: string[]): string[] {
  return values.map((value) => optionLabel(options, value))
}
