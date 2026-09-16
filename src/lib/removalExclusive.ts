import { MITIGATION_LEGACY, PRUNING_OPTIONS, REMOVAL_OPTION } from './options'

/**
 * 「移除」同「修剪／拉索加固」互斥 —— **純邏輯，⛔ 唔掂 React、⛔ 唔掂 DB。**
 *
 * ⭐⭐ **點解呢條唔係「靚唔靚」，係會計錯錢 —— ⛔ 唔准淨係記住結論**
 *
 * **Jason 2026-08-24 原話**（`docs/P3f-全app版面-實作計劃.md` §12）：
 *
 * > 「移除係獨立，有移除就唔會有修剪同拉索加固，可能會起樹頭」
 *
 * ⚠️ 整棵樹拎走，就唔會同時修剪佢。⭐ 兩樣都剔咗 ＝ **一棵已經冇咗嘅樹，
 * 報價單上面照計埋修剪錢**。呢個唔係顯示問題，係**出咗去俾客人嘅價錢**。
 *
 * ⛔⛔ **呢條拍咗板之後 22 日冇入過真 code**（2026-08-24 → 2026-09-16 先做）——
 *    同「封存」同「藍底色」係同一個病，見 `docs/開發紀錄.md` 附錄 B
 *    「原型拍咗板 ≠ 入咗真 code」。
 *
 * ⭐ 做法跟返 P8 步 1：**規矩先寫成純函數 ＋ 針死測試，畫面後來先接。**
 *    ⚠️ 呢個檔**⛔ 唔會攔任何嘢** —— 佢淨係答「剪唔剪得」同「點解剪唔得」。
 *    邊個位用、點樣出（變灰？出字？），係畫面嗰半，⛔ 而嗰半要原型先行（§2.11）。
 */

/**
 * 同「移除」打交嗰批。
 *
 * ⭐ 四項修剪 ＋ 拉索加固 —— 逐項照 P3f §12 嗰張表，⛔ 冇加冇減。
 * ⚠️ **⛔ 唔包 `stump_removal`（起樹頭）** —— P3f 明文：
 *    「✅ 移除 ＋ 起樹頭 係正常組合，⛔ 唔准擋」。
 * ⚠️ **⛔ 亦唔包 `close_up`（近景）同 `other`（其他）** —— 「兩邊都加得」。
 */
export const CONFLICTS_WITH_REMOVAL: readonly string[] = [
  ...PRUNING_OPTIONS.map((option) => option.value),
  'cabling',
]

/**
 * ⚠️ **舊單嗰個「修剪（未細分）」都要當成修剪。**
 *
 * ⛔ 唔計佢嘅話，一棵舊樹剔住 `pruning` 再剔「移除」就會靜靜咁過到 ——
 * ⭐ 而舊單正正就係最容易兩樣都有嗰批（呢條規矩以前根本唔存在）。
 */
const PRUNING_LIKE: readonly string[] = [...CONFLICTS_WITH_REMOVAL, MITIGATION_LEGACY]

export const REMOVAL = REMOVAL_OPTION.value

/** 剪唔剪得落 ＋ 點解。⛔ `null` ＝ 剪得。 */
export type BlockedReason = string | null

/**
 * 想剔 `value`，而家已經剔咗 `current` —— 剪唔剪得？
 *
 * ⛔⛔ **已經剔咗嗰個，永遠剪得返轉頭。** ⚠️ 呢句係救命嘅：
 *    一棵舊樹兩樣都有（見下面 `bothPicked()`），如果連「剔走其中一樣」
 *    都俾人擋住，佢就**永遠卡死喺一個違規狀態**，⛔ 連修都修唔到。
 *    ⭐ 呢個就係附錄 B 嗰條「一條規矩啱、但冇出口」。
 *
 * ⛔ 文案逐字照 P3f §12，⛔ 唔准自己改。
 */
export function blockedReason(current: readonly string[], value: string): BlockedReason {
  // ⭐ 剔走永遠得。
  if (current.includes(value)) return null

  if (value === REMOVAL && current.some((one) => PRUNING_LIKE.includes(one))) {
    return '移除（此樹已有修剪工序）'
  }

  if (current.includes(REMOVAL)) {
    if (value === 'cabling') return '拉索加固（此樹已列為移除）'
    if (CONFLICTS_WITH_REMOVAL.includes(value)) return '修剪（此樹已列為移除）'
  }

  return null
}

/** 剪唔剪得落。⭐ 畫面就係用呢個去決定粒掣灰唔灰。 */
export function canPick(current: readonly string[], value: string): boolean {
  return blockedReason(current, value) === null
}

/**
 * ⚠️⚠️ **一棵樹而家兩樣都有 —— 即係喺呢條規矩之前存落嚟嘅舊資料。**
 *
 * ⛔⛔ **呢個 function ⛔ 唔會幫你「修正」佢，亦都⛔ 唔准有人加一段
 *    自動抹走其中一樣嘅 code。** ⭐ 靜靜雞把人已經存咗嘅嘢抹走，
 *    係呢種情況入面**最差嗰個做法** —— 冇人會知少咗乜。
 *
 * ⇒ 佢淨係**認得出**。點處理（留住？出個提示？叫人自己揀？）
 *    係 Jason 嘅決定，⛔ 未拍板。
 */
export function bothPicked(mitigations: readonly string[]): boolean {
  return mitigations.includes(REMOVAL) && mitigations.some((one) => PRUNING_LIKE.includes(one))
}
