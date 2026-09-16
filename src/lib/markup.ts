/**
 * 「加成 ％」嗰格 —— 純邏輯。**⛔ 唔掂 React、⛔ 唔掂 DB。**
 *
 * ⭐⭐ **點解要開呢個檔 —— ⛔ 唔准淨係記住結論**
 *
 * 2026-09-16 出 P9 自動儲存報告嗰陣，去真瀏覽器量返「加成 ％」——
 * 佢係全 app **唯一一格已經冇儲存掣、打一個字存一次**嘅嘢。量到兩個窿：
 *
 * **窿一：存唔到完全冇聲。** `void onMarkupSave(n)`，⛔ 冇 `.catch`。
 * 實測（對數殼扮伺服器拒絕，真鍵盤打「35」）：
 *
 * ```
 * 有冇紅字         false       ⛔ 一個字都冇
 * 有冇 role=alert  false
 * pageerror        「伺服器唔俾改呢一單」× 2
 * ```
 *
 * **窿二：打錯一個字母就卡死喺 `NaN`。** 個格本來顯示
 * `String(Number(markupInput))` —— 一個**有損**嘅來回。打 `abc` ⇒ 個格變 `NaN`，
 * ⭐ 跟住你再打乜都係接落 `"NaN"` 後面（`"NaN5"`）⇒ 永遠都係 `NaN`。
 * ⚠️ 而**報價價錢**同時變咗 **`$NaN`** —— 實測：
 *
 * ```
 * 一開       格 "50"    報價價錢 $65,100
 * 打咗 abc   格 "NaN"   報價價錢 $NaN
 * 打咗 -5    格 "NaN"   報價價錢 $NaN      ← ⛔ 打唔返出嚟
 * 清空       格 ""      報價價錢 $43,400
 * ```
 *
 * ⚠️⚠️ **報價價錢係報俾客人嗰個數。** ⛔ 唔係一格靚唔靚嘅嘢。
 *
 * ⇒ 規矩：**個格永遠顯示人打咗乜**（⛔ 唔准倒返轉由個數砌返個字串），
 *   而**個數淨係喺「真係一個 ≥0 嘅數」嗰陣先存在**。
 */

/** 人打咗嗰串字 ⇒ 存唔存得落 DB 嘅數。⛔ `null` ＝ 唔存。 */
export function markupToSave(typed: string): number | null | undefined {
  const trimmed = typed.trim()
  // ⭐ 清空 ＝ 明確講「冇加成」⇒ 存 `null`。
  if (trimmed === '') return null
  const n = Number(trimmed)
  // ⛔ 打錯字唔好寫落 DB。⚠️ `undefined` ＝ 「乜都唔好做」，同 `null`（存 null）唔同。
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

/**
 * 人打咗嗰串字 ⇒ 計價錢用嗰個數。
 *
 * ⛔⛔ **永遠唔會回 `NaN`。** ⚠️ 一個 `NaN` 漏落去，報價價錢就會變 `$NaN`。
 */
export function markupToPct(typed: string): number | null {
  const n = markupToSave(typed)
  return typeof n === 'number' ? n : null
}

/**
 * 存唔到嗰陣講嘅話。
 *
 * ⛔ 中文、⛔ 講得出搵邊個做乜（CLAUDE.md §2.7）。
 * ⭐ 一定要講明**你打嘅字仲喺畫面度** —— ⚠️ 唔講嘅話人會以為自己要重新打過。
 * ⚠️ 伺服器嗰句原因（`refusalReason()` 三句入面啱嗰一句）照樣要出，
 *    ⛔ 唔准食咗佢換一句通用嘢。
 */
export function markupSaveFailed(reason: string): string {
  return `加成 ％ 存唔到：${reason.trim()} ⚠️ 你打咗嘅數仲喺格入面，⛔ 未存到入去。`
}
