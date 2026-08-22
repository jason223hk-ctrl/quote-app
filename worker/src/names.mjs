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
 * ⛔ `seq` 由 **1** 數起，寫入嗰邊負責（`photoInsertToRow`）。
 * **呢度冇「0 當 1」嘅特例** —— 有特例就會變成兩個地方各有一套講法，
 * 而今日已經有一次教訓係「文件寫咗但 code 從來冇跟」。
 */
export function pairedNumber(seq) {
  // ⛔ 唔啱嘅 seq 就唔准砌 —— 回 null，⛔ 唔准靜靜咁補救成 1。
  //
  // 呢個唔係「0 當 1」嘅特例：特例會**靜靜咁**幫你揀一個答案，
  // 呢度係**拒絕**，然後上面會出一句中文，人先知有嘢要修。
  // 2026-08-22 真機中過：舊行 seq 仲係 0，鏡像照抄，
  // Drive 上面出咗個 `1_Whole View_-1_Before.jpg`。
  if (!Number.isFinite(seq) || seq < 1) return null
  return String(2 * Math.floor(seq) - 1).padStart(2, '0')
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
  const nn = pairedNumber(seq)
  if (nn === null) return null
  return `${safeFilename(treeNo)}_${safeFilename(token)}_${nn}_Before.jpg`
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
