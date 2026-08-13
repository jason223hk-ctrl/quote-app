/** 表單共用嘅細嘢。數字欄同錯誤 map 兩邊（樹、現場資料表）都要用。 */

export type Errors<T> = Partial<Record<keyof T, string>>

/**
 * 數字欄：留空就係 null，**唔准變零**。
 * 未量度同零係兩件事——樹高 0m 同「未量」對報價完全兩回事。
 */
export function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** 空白 = 合法（等於未填）。填咗就一定要係唔細過零嘅數字。 */
export function isBlankOrNonNegativeNumber(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return true
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0
}

export function numberToInput(value: number | null): string {
  return value === null || value === undefined ? '' : String(value)
}

/** 多揀清單：撳一下就 on/off，唔會熄其他選項。 */
export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}
