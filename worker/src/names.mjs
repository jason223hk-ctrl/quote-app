/**
 * Drive 資料夾名同檔名。純函數，冇 fetch、冇 env —— 所以測得到。
 *
 * 規則全部係 tree app 原文（2026-08-22 讀返 `src/domain/photoFilename.ts` 查實）：
 * 見 `docs/P3-現場影相-設計.md` 第三章。
 */

/** tree app 個 safeFilename 原文。 */
export function safeFilename(name) {
  return (name || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 80) || 'untitled'
}

/** 一個工程一個資料夾：`工作日期_工程名`。⛔ 冇 Odoo 單號。 */
export function projectFolderName(workDate, name) {
  return safeFilename(`${workDate ?? ''}_${name ?? ''}`)
}

/**
 * ⛔ NN 係成對編號，唔係順序數。
 *
 * tree app：同一個（樹、類別）入面第 k 對，Before = 2k−1、After = 2k。
 * quote app 全部都係 Before，所以永遠係單數 —— 雙數留返俾中標之後嘅後相。
 *
 * ⚠️ `seq` 由 1 數起。P3a 寫落去嘅係 0（嗰陣一格得一張全景相，冇次序可言），
 * 所以 0 當 1 —— 唔係咁嘅話會計出 `-1`。
 */
export function pairedNumber(seq) {
  const k = Number.isFinite(seq) && seq >= 1 ? Math.floor(seq) : 1
  return String(2 * k - 1).padStart(2, '0')
}

/**
 * 檔名：`{樹編號}_{類別}_{NN}_Before.jpg`
 *
 * ⚠️ 類別 token 喺 NN 之前 —— tree app 原文註解寫明係 Jason 特登要求，
 * 因為 Google Drive 按字母排序嗰陣可以 BY CATEGORY 分組。
 *
 * ⛔ 冇 token 就砌唔到，回 null，唔准靠估。
 */
export function photoFilename(treeNo, token, seq) {
  if (!token) return null
  return `${safeFilename(treeNo)}_${safeFilename(token)}_${pairedNumber(seq)}_Before.jpg`
}

/**
 * mitigation 代號 → Drive 檔名嘅類別 token。
 * ⛔ 同 `src/lib/options.ts` 嗰啲 `en` 一個字都唔可以差，
 *    因為呢五個係 tree app `PRUNING_WORK_TYPES` 原文。
 * ⚠️ legacy `pruning` 特登唔喺度 —— 佢係群組標題，唔係工序，砌唔到檔名。
 */
export const MITIGATION_TOKENS = {
  crown_cleaning: 'Crown Cleaning',
  crown_thinning: 'Crown Thinning',
  crown_reduction: 'Crown Reduction',
  crown_raising: 'Crown Raising',
  removal: 'Removal',
  stump_removal: 'Stump Removal',
  cabling: 'Cabling',
  root_pruning: 'Root Pruning',
  close_up: 'Close Up',
  other: 'Other',
}
