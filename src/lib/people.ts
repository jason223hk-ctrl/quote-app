import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 建立人名（`quote_people`，P7 開咗張表；PR #66 份 SQL 入人）。
 *
 * ⭐ 做咩：工程卡第一行尾出「邊個開呢單」，搜尋面板可以揀「建立人」。
 *   畫面照原型 PR #83（`public/proto-people-names.html`）嘅預設揀法。
 *
 * ⛔⛔ 呢張表**唔係**權限表 —— 權限係 `quote_admins`。一個人喺呢度有名，
 *    ⛔ 唔代表佢係辦公室；呢度出唔到名，⛔ 亦唔代表佢冇權。
 *
 * ⚠️ 張表冇佢名嘅人（未入 SQL、或者未開帳號）⇒ 卡上**⛔ 唔出名**
 *    （原型「乙 · 唔出」；AI 代揀，待 Jason 確認）。⛔ 唔准估一個名出嚟，
 *    ⛔ 亦唔准出 UUID／email。
 */
export type Person = {
  userId: string
  name: string
}

export type PeopleApi = {
  /** ⛔ 失敗要 throw —— 回 `[]` 就同「張表真係冇人」分唔開。 */
  list: () => Promise<Person[]>
}

export function createPeopleApi(client: SupabaseClient): PeopleApi {
  return {
    async list() {
      const { data, error } = await client.from('quote_people').select('user_id, display_name')
      if (error) throw new Error(error.message)
      return sortPeople(
        (data ?? []).map((row: { user_id: string; display_name: string }) => ({
          userId: row.user_id,
          name: row.display_name.trim(),
        })),
      ).filter((person) => person.name !== '')
    },
  }
}

/**
 * 下拉嘅次序：按名排（中文按筆劃／英文按字母，交俾瀏覽器嘅 `zh-Hant` 排序）。
 * ⭐ 定死一個次序，⛔ 唔跟 DB 回嚟嘅次序 —— DB 冇 `order by` 嘅話次序冇保證，
 *    每次開個下拉都唔同位，人會揀錯。
 */
export function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
}

/** `user_id → 名`。⛔ 揾唔到就 `null`（＝卡上唔出），⛔ 唔准補一個名。 */
export function creatorName(
  people: Person[] | null,
  createdBy: string | null | undefined,
): string | null {
  if (people === null || !createdBy) return null
  return people.find((person) => person.userId === createdBy)?.name ?? null
}
