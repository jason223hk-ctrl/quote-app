/**
 * PDF 相底第一行嗰個檔名。
 *
 * ⛔⛔ 呢度嘅規則同 `worker/src/names.mjs` **一定要一模一樣** ——
 *    紙面上寫住 `1_Crown Cleaning_01`，Drive 上面真係叫 `1_Crown Cleaning_01_Before.jpg`。
 *    對唔上嘅話，同事拎住張 PDF 去 Drive 揾嗰張相，係揾唔到嘅。
 *
 * ⚠️ 咁點解唔直接 import worker 嗰個？因為 worker 係 `.mjs`、行喺 Cloudflare，
 *    而呢邊係 TypeScript bundle。⇒ 兩份實作，⛔ 而兩份實作一定要有嘢釘住 ——
 *    `pdfNames.test.ts` 逐個 case 同 `worker/src/names.mjs` 對答案。
 *    ⛔ 唔准淨係「睇落一樣」就算。
 *
 * ⚠️ 紙面上⛔ 冇 `_Before` 同 `.jpg`：
 *    quote app 全部相都係 Before，印出嚟每一行都多兩個字冇意思（Jason 2026-08-25 定稿二）。
 */

import { SELECTABLE_MITIGATIONS } from './options'

/** tree app 個 `safeFilename` 原文。⛔ 唔准簡化。 */
export function safeFilename(name: string): string {
  return (
    (name || '')
      // eslint-disable-next-line no-control-regex -- ⛔ 控制字元一定要換走，否則出唔到檔名。呢個 regex 係 worker 原文，⛔ 一個字都唔准改。
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .trim()
      .slice(0, 80) || 'untitled'
  )
}

/**
 * ⛔ NN 係成對編號，唔係順序數：同一格入面第 k 對，Before ＝ 2k−1。
 * quote app 全部係 Before，所以永遠單數。
 *
 * ⛔ `seq` 由 1 數起。唔啱就回 null —— ⛔ 唔准靜靜咁補救成 1。
 */
export function pairedNumber(seq: number): string | null {
  if (!Number.isFinite(seq) || seq < 1) return null
  return String(2 * Math.floor(seq) - 1).padStart(2, '0')
}

/**
 * mitigation 代號 → Drive 類別 token。`null` ＝ 全景相。
 *
 * ⚠️ 查嘅係 `SELECTABLE_MITIGATIONS`，⛔ 唔係 `MITIGATION_OPTIONS` ——
 *    後者包埋 legacy `pruning`（「修剪（未細分）」）。佢係一個**群組標題**，
 *    唔係一個工序，worker 個 `MITIGATION_TOKENS` 特登冇佢 ⇒ 呢度亦都要砌唔到。
 *    ⛔ 用 `MITIGATION_OPTIONS` 就會出一個 `1_Pruning (unspecified)_01`，
 *    而 Drive 上面根本冇呢個檔 —— 對數測試 2026-09-03 即刻捉咗出嚟。
 */
export function mitigationToken(mitigation: string | null): string | null {
  if (mitigation === null) return 'Whole View'
  return SELECTABLE_MITIGATIONS.find((option) => option.value === mitigation)?.en ?? null
}

/** `1_Crown Cleaning_01`。⛔ 砌唔到就回 null，唔准靠估。 */
export function photoFileLabel(
  treeNo: string,
  mitigation: string | null,
  seq: number,
): string | null {
  const token = mitigationToken(mitigation)
  if (token === null) return null
  const nn = pairedNumber(seq)
  if (nn === null) return null
  return `${safeFilename(treeNo)}_${safeFilename(token)}_${nn}`
}

/** `Site_01`。環境相冇「事前事後」，所以係順序數。⛔ 但環境相唔入 PDF，呢個淨係畀 app 內部用。 */
export function sitePhotoLabel(seq: number): string | null {
  if (!Number.isFinite(seq) || seq < 1) return null
  return `Site_${String(Math.floor(seq)).padStart(2, '0')}`
}
