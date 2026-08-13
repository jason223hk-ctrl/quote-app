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

/** 樹木處理方法。可多揀；揀咗 other 先彈打字欄。 */
export const MITIGATION_OPTIONS: Option[] = [
  { value: 'pruning', label: '修剪', en: 'Pruning' },
  { value: 'crown_cleaning', label: '清除枯枝', en: 'Crown cleaning' },
  { value: 'crown_reduction', label: '縮樹冠或修矮', en: 'Crown reduction' },
  { value: 'crown_raising', label: '提升樹冠', en: 'Crown raising' },
  { value: 'removal', label: '斬樹或移除', en: 'Removal' },
  { value: 'stump_removal', label: '起樹頭', en: 'Stump removal' },
  { value: 'cabling', label: '拉索加固', en: 'Cabling' },
  { value: 'root_pruning', label: '修根', en: 'Root pruning' },
  { value: 'other', label: '其他', en: 'Other' },
]

export const MITIGATION_OTHER = 'other'

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
