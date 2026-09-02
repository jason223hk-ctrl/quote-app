import type { CalcMode, PriceCategory, PricePatch, PriceRow, PriceTable } from './prices'

/**
 * 單價設定畫面嘅純邏輯。**唔掂 DB、唔掂 React** —— 咁先測得到。
 *
 * 規格來源：原型 stage57 `#screenPrice` ＋ `P4-單價表-migration.sql`。
 *
 * ⭐⭐ 由頭到尾守住一條：**價錢 null ≠ 0**。
 *    null ＝ 逐次報價／未填。⛔ 任何時候都唔准 `?? 0`，
 *    亦都⛔ 唔准將「打空咗格」當成 null 寫落 DB ——
 *    咁做會將一個有價嘅項目靜靜哋變成「逐次報價」，
 *    全部待報價工程嘅成本即刻跌，而且冇人知。
 */

/** 六個類別嘅中文標題。⭐ 同原型 `PRICE` 嗰六個 heading 一字不差。 */
const CATEGORY_TITLE: Record<PriceCategory, string> = {
  manpower: '人手',
  fixed: '固定',
  waste: '夾車',
  crane: '吊雞',
  lift: '升降台',
  stump: '起樹頭',
}

/** 畫面上嘅次序。⛔ 唔跟 DB 嘅 category 字母序 —— 要跟原型嗰個次序。 */
const CATEGORY_ORDER: PriceCategory[] = ['manpower', 'fixed', 'waste', 'crane', 'lift', 'stump']

/** 三個地區 ＋ 夜晚。⛔ 夜價唔分區（全港一個數，Jason 2026-08-28 拍板）。 */
export const AREA_COLS = [
  { col: 'price_nt', label: '新界' },
  { col: 'price_kl', label: '九龍' },
  { col: 'price_hk', label: '香港、大嶼山' },
  { col: 'price_night', label: '夜晚' },
] as const

export type AreaCol = (typeof AREA_COLS)[number]['col']

export type PriceGroup = {
  category: PriceCategory
  title: string
  rows: PriceRow[]
}

/** 照類別分組，⛔ 空嘅類別唔出（例如全部 archive 咗）。 */
export function groupPrices(table: PriceTable): PriceGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    title: CATEGORY_TITLE[category],
    rows: table
      .filter((r) => r.category === category)
      .sort((a, b) => a.sort_order - b.sort_order),
  })).filter((g) => g.rows.length > 0)
}

export type RowShape =
  /** 三個地區價都係 null ＝ 逐次報價。⛔ 唔係 $0。 */
  | { kind: 'ask' }
  /** 三區同價、又冇夜價 → 一行一個數就夠。 */
  | { kind: 'single'; value: number }
  /** 有區分、或者有夜價 → 一行一個地區，⛔ 唔可以塞埋一格（睇唔到就改唔到）。 */
  | { kind: 'byArea'; areas: { col: AreaCol; label: string; value: number | null }[] }

/**
 * 一行點顯示。
 *
 * ⚠️ DB 冇一個欄話你知「呢項係咪分區」—— 係睇實際數值推返出嚟：
 * 三區一樣而且冇夜價，就當佢係單一價。
 * ⭐ 咁樣有個好處：邊日辦公室真係將九龍改高咗，嗰行會自己散開做四行，
 *    ⛔ 唔會出現「改咗但畫面睇唔到」。
 */
export function shapeOf(row: PriceRow): RowShape {
  const { price_nt: nt, price_kl: kl, price_hk: hk, price_night: night } = row

  if (nt === null && kl === null && hk === null && night === null) return { kind: 'ask' }

  const sameDay = nt !== null && nt === kl && kl === hk
  if (sameDay && night === null) return { kind: 'single', value: nt }

  return {
    kind: 'byArea',
    areas: AREA_COLS.map(({ col, label }) => ({ col, label, value: row[col] })),
  }
}

/** 右邊格下面嗰行細字。 */
export function unitLabel(row: PriceRow): string {
  if (shapeOf(row).kind === 'ask') return '逐次報價'
  const byMode: Record<CalcMode, string> = {
    per_person_day: '每人每日',
    auto_per_day: '每日（自動計入）',
    per_day: '每日',
    per_unit: '每架',
    once: '每次',
  }
  return byMode[row.calc_mode]
}

/**
 * 打咗嘅字轉返個數。
 *
 * ⛔ 空白、負數、唔係數字一律當**改壞咗**（返 `null`），
 *    呼叫嗰邊要擋住唔准儲存 —— ⛔ 唔准當 0，亦⛔ 唔准當「清空做逐次報價」。
 */
export function parseMoney(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * 砌一個 patch。
 *
 * ⭐ 單一價要**三個地區欄一齊寫** —— 淨係寫其中一個嘅話，
 *    嗰行即刻變成「分區」，另外兩區仲係舊價，畫面會散開做四行。
 */
export function patchFor(shape: RowShape, col: AreaCol | null, value: number): PricePatch {
  if (shape.kind === 'single' || col === null) {
    return { price_nt: value, price_kl: value, price_hk: value }
  }
  return { [col]: value } as PricePatch
}

/** 一行而家實際嘅值，用嚟同草稿比較。 */
export function valueOf(row: PriceRow, col: AreaCol | null): number | null {
  if (col === null) return row.price_nt
  return row[col]
}
