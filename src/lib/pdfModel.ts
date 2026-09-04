/**
 * 匯出 PDF 嘅**純邏輯**：邊幾張相入 PDF、點分頁、抬頭三行寫乜、相底三行寫乜。
 * ⛔ 唔掂 DB、⛔ 唔掂 React、⛔ 唔掂 pdf-lib —— 咁先測得到。
 *
 * 規格出處：
 * - `docs/P5P6-待辦.md`「2026-08-25 定稿四：匯出 PDF 頁」同之後幾條補充
 * - `docs/交接-CO.md` §二「PDF」
 *
 * ⛔⛔ 兩條硬規矩，成個檔靠佢哋：
 *   一、**環境相唔入 PDF**（Jason 2026-08-25 拍板）。
 *   二、**成本同收客價永遠唔上 PDF**。呢個檔由頭到尾冇一個價錢欄，⛔ 唔准加。
 */

import { MITIGATION_OPTIONS, PRUNING_OPTIONS, MITIGATION_LEGACY } from './options'
import type { QuotePhoto } from './photos'
import type { QuoteTree } from './trees'
import { photoFileLabel } from './pdfNames'

/** 每個 A4 頁面四張相（Jason 2026-08-25）。⛔ 第一頁都係四張，⛔ 唔留位畀大抬頭。 */
export const SHOTS_PER_PAGE = 4

export type ExportShot = {
  photoId: string
  treeId: string
  treeNo: string
  /** 相底第一行。⛔ 砌唔到就唔出呢張相（見 `buildShots`）。 */
  file: string
  /** 相底第二行：**成棵樹**嘅工序，英文，一行寫晒。⛔ 唔係淨係嗰張相自己嗰個。 */
  worksEn: string
  /** 相底第三行。⛔ 冇填就係空字串，唔出、唔留白位。 */
  note: string
  /** 全景相預設已經揀入 PDF（影完即刻算揀咗）。工序相要自己揀。 */
  whole: boolean
}

/**
 * 一棵樹嘅工序，英文，一行寫晒（例：`Crown Cleaning, Crown Reduction`）。
 *
 * ⚠️ 次序跟 `MITIGATION_OPTIONS` 嘅排位，⛔ 唔跟 DB 入面 array 嘅次序 ——
 * 同一批工序喺兩棵樹上面要出同一個次序，否則睇落似兩件唔同嘅嘢。
 */
export function worksEnOf(tree: QuoteTree): string {
  const order = MITIGATION_OPTIONS.map((option) => option.value)
  return (tree.mitigations ?? [])
    .filter((key) => order.includes(key))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((key) => MITIGATION_OPTIONS.find((option) => option.value === key)?.en ?? key)
    .join(', ')
}

/**
 * 由樹同相砌出「可以入 PDF」嗰批。
 *
 * ⛔ 環境相（`tree_id === null`）唔收。
 * ⛔ 已刪嘅相唔收。
 * ⛔ 砌唔到檔名嘅相唔收 —— 一行冇檔名嘅相底喺紙上面等於一張認唔返嘅相。
 */
export function buildShots(trees: QuoteTree[], photos: QuotePhoto[]): ExportShot[] {
  const byId = new Map(trees.map((tree) => [tree.id, tree]))
  const out: ExportShot[] = []
  for (const photo of photos) {
    if (photo.deleted_at !== null) continue
    if (photo.tree_id === null) continue
    const tree = byId.get(photo.tree_id)
    if (!tree) continue
    const file = photoFileLabel(tree.tree_no, photo.mitigation, photo.seq)
    if (file === null) continue
    out.push({
      photoId: photo.id,
      treeId: tree.id,
      treeNo: tree.tree_no,
      file,
      worksEn: worksEnOf(tree),
      note: (photo.remark ?? '').trim(),
      whole: photo.mitigation === null,
    })
  }
  // 跟樹木清單嘅次序，然後跟檔名 —— ⛔ 唔跟 DB 攞返嚟嗰個次序（佢冇保證）。
  const rank = new Map(trees.map((tree, index) => [tree.id, index]))
  return out.sort(
    (a, b) =>
      (rank.get(a.treeId) ?? 0) - (rank.get(b.treeId) ?? 0) || a.file.localeCompare(b.file),
  )
}

/** 分頁：每頁四張。⛔ 一張相都冇就零頁 —— 由畫面攔住，⛔ 唔喺呢度出一版白紙。 */
export function paginate<T>(items: T[], perPage = SHOTS_PER_PAGE): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage))
  return pages
}

const PRUNE_KEYS = [...PRUNING_OPTIONS.map((option) => option.value), MITIGATION_LEGACY]

export function hasPrune(tree: QuoteTree): boolean {
  return (tree.mitigations ?? []).some((key) => PRUNE_KEYS.includes(key))
}

export function hasRemoval(tree: QuoteTree): boolean {
  return (tree.mitigations ?? []).includes('removal')
}

/**
 * 抬頭第三行「樹木數目」。
 *
 * ⭐ 數嘅係**今次匯出真係有相出嗰啲樹**（第四輪第 1 條，Jason 2026-08-28）——
 * ⛔ 唔係成個工程有幾多棵。揀返一棵樹匯出，就唔可以再寫「修剪 3 棵」。
 *
 * ⛔ 只出真係有嘅分類。一棵都未分工序就出「共 N 棵」。一棵都冇就回空字串
 * （⛔ 唔准出「共 0 棵」）。
 *
 * ⚠️ 一棵樹同時有修剪同移除，兩邊都會數到佢。呢個係 Jason 原型嘅行為，⛔ 唔准自己改。
 */
export function treeCountText(trees: QuoteTree[]): string {
  const prune = trees.filter(hasPrune).length
  const removal = trees.filter(hasRemoval).length
  const bits: string[] = []
  if (prune) bits.push(`修剪 ${prune} 棵`)
  if (removal) bits.push(`移除 ${removal} 棵`)
  if (bits.length) return bits.join('｜')
  return trees.length ? `共 ${trees.length} 棵` : ''
}

export type Selection = {
  /** 剔咗嘅樹。⛔ 一張相都冇嘅樹剔唔到（第四輪第 10 條）。 */
  treeIds: Set<string>
  /** 剔咗嘅相。 */
  photoIds: Set<string>
}

export type PillKind = 'client' | 'crew' | 'clear'

/**
 * 三個 pill：
 * - `client` 客戶 ＝ 全部有相嘅樹剔曬，相就淨係全景相
 * - `crew`   同事 ＝ 全部有相嘅樹剔曬，全部相
 * - `clear`  全部清除 ＝ 一棵都唔剔、一張都唔要
 */
export function applyPill(kind: PillKind, shots: ExportShot[]): Selection {
  if (kind === 'clear') return { treeIds: new Set(), photoIds: new Set() }
  const photoIds = new Set(
    shots.filter((shot) => (kind === 'crew' ? true : shot.whole)).map((shot) => shot.photoId),
  )
  // ⛔ 冇相嘅樹唔加入去（第四輪第 10 條）。
  const treeIds = new Set(shots.map((shot) => shot.treeId))
  return { treeIds, photoIds }
}

/**
 * 三個 pill 邊個仲着燈。
 *
 * ⭐ 自己手動剔／甩剔任何一樣，三個 pill 就全部熄 —— 因為已經唔係嗰三個組合。
 * ⛔ 唔准靠一個「我上次撳咗邊個」嘅變數：撳完再手動改，個變數就講緊大話。
 */
export function activePill(selection: Selection, shots: ExportShot[]): PillKind | null {
  for (const kind of ['clear', 'client', 'crew'] as PillKind[]) {
    const want = applyPill(kind, shots)
    if (sameSet(want.treeIds, selection.treeIds) && sameSet(want.photoIds, selection.photoIds)) {
      return kind
    }
  }
  return null
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

/**
 * 真係會印落紙嗰批：⛔ 相要剔咗，**而且**佢棵樹都要剔咗。
 *
 * ⚠️ 兩個條件都要 —— 呢個係原型入面 `x.ph.pick && exTreeOn.has(x.tag)` 原文。
 * ⛔ 但畫面嗰邊有責任唔好整出「揀咗相但棵樹冇剔」呢種狀態：
 *    嗰種狀態會靜靜咁少印一張相，冇人會發現。見 `toggleShot`。
 */
export function selectedShots(shots: ExportShot[], selection: Selection): ExportShot[] {
  return shots.filter(
    (shot) => selection.photoIds.has(shot.photoId) && selection.treeIds.has(shot.treeId),
  )
}

/** 今次真係有相出嗰啲樹。抬頭第三行同「N/M 棵」都用佢。 */
export function exportedTrees(
  trees: QuoteTree[],
  shots: ExportShot[],
  selection: Selection,
): QuoteTree[] {
  const ids = new Set(selectedShots(shots, selection).map((shot) => shot.treeId))
  return trees.filter((tree) => ids.has(tree.id))
}

/** 剔／甩剔成棵樹。⛔ 冇相嘅樹剔唔到 —— 剔到嘅話 PDF 出嚟根本冇嗰棵樹。 */
export function toggleTree(
  selection: Selection,
  treeId: string,
  shots: ExportShot[],
): Selection {
  const mine = shots.filter((shot) => shot.treeId === treeId)
  if (mine.length === 0) return selection
  const treeIds = new Set(selection.treeIds)
  const photoIds = new Set(selection.photoIds)
  if (treeIds.has(treeId)) {
    treeIds.delete(treeId)
    for (const shot of mine) photoIds.delete(shot.photoId)
  } else {
    treeIds.add(treeId)
    // 開返一棵樹 ＝ 佢啲相全部剔返。⛔ 唔可以剔咗棵樹但零張相。
    for (const shot of mine) photoIds.add(shot.photoId)
  }
  return { treeIds, photoIds }
}

/**
 * 逐張揀。
 *
 * ⭐ 揀返一張，棵樹自動剔返（Jason 2026-08-25）——
 * ⛔ 唔可以出現「揀咗相但棵樹冇剔、結果張相唔出」呢種靜靜雞唔出相嘅情況。
 *
 * ⭐ 反過嚟：一棵樹最後一張相都甩咗剔，棵樹自己都熄 ——
 * ⛔ 一個剔咗但零張相嘅樹，喺「N 棵」度數到，但紙上面一張相都冇。
 */
export function toggleShot(
  selection: Selection,
  shot: ExportShot,
  shots: ExportShot[],
): Selection {
  const treeIds = new Set(selection.treeIds)
  const photoIds = new Set(selection.photoIds)
  if (photoIds.has(shot.photoId)) {
    photoIds.delete(shot.photoId)
    // ⛔ 剩返有相剔住就唔可以熄棵樹 —— 熄咗嘅話賸低嗰幾張會靜靜咁唔出。
    const stillOn = shots.some(
      (other) => other.treeId === shot.treeId && photoIds.has(other.photoId),
    )
    if (!stillOn) treeIds.delete(shot.treeId)
  } else {
    photoIds.add(shot.photoId)
    treeIds.add(shot.treeId)
  }
  return { treeIds, photoIds }
}
