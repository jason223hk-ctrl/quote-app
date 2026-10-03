/**
 * `/mirror` 同一張相喺 Drive 出咗多過一份嗰陣，**揀邊份留低**。**純邏輯，⛔ 冇 fetch。**
 *
 * ⚠️ 2026-10-03 Jason 真機：同一張相喺 Drive 有 4 份。
 *    前端已經做咗「同一個 tab 一次一個」（PR #77 `8a26ce4`），⛔ 但兩部機／兩個 tab
 *    同時抄，`/mirror` 個「先查有冇 → 冇就上」中間冇鎖 ⇒ 每個都會上一份。
 *    Drive 冇「唯一名」、Worker 冇鎖 ⇒ ⛔ 擋唔到「上兩份」，⭐ 但可以**事後收斂**：
 *
 * ⭐ 做法同 `ensureFolder()` 一樣（tree app 嗰次 22 個 webhook 開咗三個同名資料夾）：
 *    **每個人用同一條規矩揀，⛔ 唔使夾都會揀中同一份。**
 *
 * 規矩：**`createdTime` 最早嗰份贏；一樣早就 id 細嗰份贏。**
 *   ⭐ 點解揀「最早」：最早嗰份一出現就**永遠係最早** —— 之後先上嘅只會更遲，
 *     ⇒ 早啲睇同遲啲睇，揀中嘅都係同一份（揀「id 最細」就唔係：遲上嘅可能 id 更細）。
 *   ⚠️ AI 代揀，待 Jason 確認。
 */

/** 一次最多掉幾多份多出嚟嘅（外呼額度：Cloudflare 一個 request 50 個）。 */
export const MIRROR_TRASH_MAX = 5

/**
 * @param files `[{ id, createdTime }]`（⛔ 只係未入垃圾桶、`quotePhotoId` ＝ 呢張相嘅）
 * @returns `{ winnerId, loserIds }`；冇檔就 `winnerId: null`
 */
export function pickWinner(files) {
  const list = (files ?? []).filter((file) => typeof file?.id === 'string' && file.id !== '')
  const seen = new Set()
  const unique = []
  for (const file of list) {
    if (seen.has(file.id)) continue
    seen.add(file.id)
    unique.push(file)
  }
  if (unique.length === 0) return { winnerId: null, loserIds: [] }
  // ⛔ 冇 `createdTime` ⇒ 排最尾（唔知幾時開，⛔ 唔准當佢最早）。
  const when = (file) => (typeof file.createdTime === 'string' && file.createdTime !== '' ? Date.parse(file.createdTime) : Infinity)
  const sorted = [...unique].sort((a, b) => {
    const da = when(a)
    const db = when(b)
    if (da !== db) return da < db ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return { winnerId: sorted[0].id, loserIds: sorted.slice(1).map((file) => file.id) }
}

/**
 * 別人上嗰份，起碼要「舊過」幾耐先准掉（10 分鐘）。
 *
 * ⛔⛔ 點解唔係「輸咗嘅全部掉」：Drive 個 `files.list` 有時遲幾秒先見到新檔 ⇒
 *    同時嚟嘅另一個 call 可能**未見到**最早嗰份，以為自己贏、將**自己嗰份**寫入 DB。
 *    呢邊再掉埋佢嗰份 ⇒ DB 指住一個喺垃圾桶嘅檔。⛔ 呢個比「多咗一份」嚴重。
 *    ⇒ 只係：**自己今次上嗰份**（輸咗就自己收返），同埋**舊到唔會仲有人做緊**嘅。
 *    ⚠️ AI 代揀，待 Jason 確認（10 分鐘係估：一次 `/mirror` 最多十幾秒）。
 */
export const MIRROR_STALE_MS = 10 * 60 * 1000

/**
 * 輸咗嘅邊幾份准掉。⛔ 冇 `createdTime` 嘅別人份 ⇒ 唔掉（唔知幾時開）。
 *
 * @param files    同 `pickWinner()` 嗰張一樣
 * @param loserIds `pickWinner()` 出嚟嘅
 * @param mine     今次自己上嗰份嘅 id（冇上就 `null`）
 * @param nowMs    而家（`Date.now()`）
 */
export function trashable(files, loserIds, mine, nowMs) {
  const created = new Map((files ?? []).map((file) => [file?.id, file?.createdTime]))
  // ⭐ 自己嗰份排頭：額度唔夠都一定先收返自己上多咗嗰份。
  const ordered = loserIds.includes(mine) ? [mine, ...loserIds.filter((id) => id !== mine)] : loserIds
  return ordered
    .filter((id) => {
      if (id === mine) return true
      const at = created.get(id)
      if (typeof at !== 'string' || at === '') return false
      const ms = Date.parse(at)
      return Number.isFinite(ms) && nowMs - ms >= MIRROR_STALE_MS
    })
    .slice(0, MIRROR_TRASH_MAX)
}
