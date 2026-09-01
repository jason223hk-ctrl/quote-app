import type { Region, Shift, QuoteStatus } from './records'
import type { PriceRow, PriceTable, PriceSnapshot } from './prices'
import { WASTE_OPTIONS, CRANE_OPTIONS, LIFT_OPTIONS, STUMP_OPTIONS } from './options'

/**
 * 計價。**純函數，唔掂 DB、唔掂 React** —— 咁先測得到。
 *
 * 規格來源：原型 stage57 ＋ `單價表-拍板.md`（Jason 2026-08-26 逐條拍板）。
 * 呢個檔要守住八條由事故換返嚟嘅規矩，⛔ 一條都唔可以慳：
 *
 *  1. 搵唔到價 → 出「逐次報價，未計入」，⛔ 唔准當 $0
 *  2. 待報價用現價；已報價／已中標用快照
 *  3. 快照冇嗰條 key 先跌返現價（新加嘅類別）
 *  4. 夾車 `架數 × 價`，⛔ 唔乘日數；9 噸碎冇架數
 *  5. Overhead 自動計、跟日數、⛔ 唔乘人數
 *  6. 夜價唔分區；⛔ 冇夜價嘅照用日頭價，唔准自己加成
 *  7. 加成% 辦公室專用（UI 把關）
 *  8. 成本／收客價 ⛔ 永遠唔上 PDF（UI 把關）
 */

/** 計價要嘅現場數字。由 quote_site_form 嚟。 */
export type PricingInput = {
  workDays: number | null
  crewTotal: number | null
  climbersPerDay: number | null
  wasteOptions: string[]
  wasteT24Qty: number | null
  wasteT30Qty: number | null
  machineOptions: string[]
  stumpOptions: string[]
  region: Region | null
  shift: Shift | null
}

export type CostLine = { label: string; amount: number }

export type Quote = {
  /** 計到數嗰啲 */
  lines: CostLine[]
  /** ⛔ 計唔到數嗰啲（逐次報價／未填）—— 一定要出返，唔准靜靜咁唔計 */
  ask: string[]
  /** lines 加埋。⛔ 唔包 ask。 */
  total: number
}

/** 冇填日數就當一日（Jason 2026-08-28：Overhead 同人手一套規矩）。 */
function daysOf(input: PricingInput): number {
  const d = input.workDays
  return d && d > 0 ? d : 1
}

/**
 * 查一個項目嘅價。
 *
 * ⛔ 返 `null` ＝ 逐次報價／未填。呼叫嗰邊一定要分開處理，⛔ 唔准 `?? 0`。
 *
 * 夜晚：揀咗「夜」而且**嗰個項目有夜價**先用夜價，而且夜價唔分區。
 * ⛔ 冇夜價（price_night === null）就照用日頭價 —— 唔准自己加成。
 */
export function priceOf(row: PriceRow | undefined, region: Region | null, shift: Shift | null): number | null {
  if (!row) return null

  if (shift === 'night' && row.price_night !== null && row.price_night !== undefined) {
    return row.price_night
  }

  // ⚠️ 地區未揀 → 唔知用邊個價 → 當「未計入」，⛔ 唔准偷偷當新界。
  if (!region) return null

  const byRegion: Record<Region, number | null> = {
    NT: row.price_nt,
    KLN: row.price_kl,
    HK: row.price_hk,
  }
  const v = byRegion[region]
  return v === null || v === undefined ? null : v
}

/**
 * 用邊張單價表。
 *
 * 待報價 ＝ 未出過報價紙、冇任何承諾 → 用**全 app 現價**。
 * 已報價／已中標 → 用**快照**，因為個價已經俾咗客戶，
 * ⛔ 公司之後加價唔可以追溯改咗人哋張單。
 *
 * ⚠️ 快照係「轉已報價」嗰刻影嘅，所以**之後新加嘅類別唔會喺快照入面**。
 * ⛔ 唔跌返落現價嘅話，新類別喺舊工程一律當 $0，成本會靜靜哋計少咗。
 * ⭐ 所以只有「快照根本冇呢條 key」先跌返現價；有嘅一律照用快照。
 */
export function resolveRow(
  key: string,
  live: PriceTable,
  snapshot: PriceSnapshot | null,
  status: QuoteStatus,
): PriceRow | undefined {
  const liveRow = live.find((r) => r.key === key)
  const usesSnapshot = status !== 'pending' && status !== 'site' && snapshot !== null
  if (!usesSnapshot) return liveRow

  const snapRow = snapshot!.find((r) => r.key === key)
  return snapRow ?? liveRow
}

/**
 * 砌成本明細。
 *
 * ⛔ 冇揀嘅嘢唔出行；揀咗但計唔到價嘅要入 `ask`，⛔ 唔准當佢唔存在。
 */
export function quoteLines(
  input: PricingInput,
  live: PriceTable,
  snapshot: PriceSnapshot | null,
  status: QuoteStatus,
): Quote {
  const days = daysOf(input)
  const lines: CostLine[] = []
  const ask: string[] = []
  const { region, shift } = input

  const row = (key: string) => resolveRow(key, live, snapshot, status)
  const price = (key: string) => priceOf(row(key), region, shift)

  // ── 人手：人數 × 日數 × 價 ─────────────────────────────────
  const climbers = input.climbersPerDay ?? 0
  const crew = input.crewTotal ?? 0

  if (climbers > 0) {
    const p = price('climber')
    if (p === null) ask.push('攀樹師')
    else lines.push({ label: `攀樹師 ${climbers} 人 × ${days} 日`, amount: climbers * days * p })
  }
  if (crew > 0) {
    const p = price('crew')
    if (p === null) ask.push('地面工人')
    else lines.push({ label: `地面工人 ${crew} 人 × ${days} 日`, amount: crew * days * p })
  }

  // ── Overhead：⭐ 自動計入，⛔ 唔使剔、⛔ 唔乘人數 ──────────────
  {
    const p = price('overhead')
    if (p === null) ask.push('Overhead')
    else lines.push({ label: `Overhead ${days} 日`, amount: days * p })
  }

  // ── 垃圾：⛔ 一律唔乘日數（Jason 2026-08-26）────────────────
  for (const opt of WASTE_OPTIONS) {
    const key = opt.value
    if (key === 'none' || !input.wasteOptions.includes(key)) continue

    const r = row(key)
    const p = priceOf(r, region, shift)
    if (p === null) {
      ask.push(opt.label)
      continue
    }
    // 9 噸碎冇架數欄 —— 剔咗就算一次。
    const qty = r?.has_qty ? qtyOf(input, key) : 1
    lines.push({
      label: opt.label + (r?.has_qty ? ` ${qty} 架` : ''),
      amount: qty * p,
    })
  }

  // ── 吊雞、升降台：部數 × 日數 × 價 ─────────────────────────
  for (const opt of [...CRANE_OPTIONS, ...LIFT_OPTIONS]) {
    const key = opt.value
    if (!input.machineOptions.includes(key)) continue

    const p = price(key)
    const prefix = CRANE_OPTIONS.some((c) => c.value === key) ? '吊雞 － ' : '升降台 － '
    if (p === null) {
      ask.push(prefix + opt.label)
      continue
    }
    lines.push({ label: `${opt.label} × ${days} 日`, amount: days * p })
  }

  // ── 起樹頭：剔咗就一次。⛔ 兩項都係逐次報價（Jason 2026-08-28）──
  for (const opt of STUMP_OPTIONS) {
    const key = opt.value
    if (key === 'no' || !input.stumpOptions.includes(key)) continue

    const p = price(key)
    if (p === null) {
      ask.push('起樹頭 － ' + opt.label)
      continue
    }
    lines.push({ label: opt.label, amount: p })
  }

  return { lines, ask, total: lines.reduce((sum, l) => sum + l.amount, 0) }
}

function qtyOf(input: PricingInput, key: string): number {
  if (key === 't24') return input.wasteT24Qty ?? 1
  if (key === 't30') return input.wasteT30Qty ?? 1
  return 1
}

/**
 * 收客價 ＝ 成本 × (1 + 加成%)。
 * ⭐「加成五成」＝ 成本 × 1.5（Jason 2026-09-01 拍板），⛔ 唔係「賺一半」。
 */
export function askingPrice(total: number, markupPct: number | null): number {
  const pct = markupPct ?? 0
  return Math.round(total * (1 + pct / 100))
}

/** 畫面要寫出嚟嘅乘數，等人唔使自己心算。0 或者空就唔出。 */
export function markupHow(markupPct: number | null): string {
  const pct = markupPct ?? 0
  if (!(pct > 0)) return ''
  const x = Math.round((1 + pct / 100) * 100) / 100
  return `成本 × ${x}（加成 ${pct}%）`
}
