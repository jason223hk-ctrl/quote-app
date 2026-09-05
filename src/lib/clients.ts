import type { SupabaseClient } from '@supabase/supabase-js'
import { translateDbError } from './records'

/**
 * `quote_clients` —— 客戶簿（全公司共用一本）。
 *
 * 規格：`docs/P7-客戶簿-人名.md` §三、原型 stage57 `#screenClients`。
 *
 * ⭐⭐ 一筆 ＝ **客戶 ＋ 聯絡人 ＋ 電話成組**（Jason 2026-08-25），
 *    ⛔ 唔係淨係記個客戶名 —— 同一個房屋署會有唔同屋邨唔同管工。
 *
 * ⛔⛔ 同 `quote_records` **冇任何 foreign key**，係特登嘅：
 *    揀咗客戶係**複製一份**入個工程。之後改客戶簿、刪客戶，
 *    ⛔ 都唔會影響已經填咗入工程嗰啲。有 FK 就做唔到呢件事。
 *
 * ⛔ 零真刪：唔要就寫 `deleted_at`（DB 冇 DELETE policy，真係刪唔到）。
 */

export type QuoteClient = {
  id: string
  client: string
  contact: string
  phone: string
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ClientInput = { client: string; contact: string; phone: string }

export const EMPTY_CLIENT: ClientInput = { client: '', contact: '', phone: '' }

export type ClientsApi = {
  list: () => Promise<QuoteClient[]>
  create: (input: ClientInput) => Promise<QuoteClient>
  update: (id: string, input: ClientInput) => Promise<QuoteClient>
  /** ⛔ 零真刪 —— 寫 `deleted_at`。 */
  softDelete: (id: string) => Promise<QuoteClient>
}

/** 卡上面／揀客戶清單嗰行嘅字。⛔ 空嘅唔准留低一個孤零零嘅「·」。 */
export function clientLabel(c: ClientInput): string {
  return [c.client, c.contact, c.phone]
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join(' · ')
}

export function trimInput(input: ClientInput): ClientInput {
  return {
    client: input.client.trim(),
    contact: input.contact.trim(),
    phone: input.phone.trim(),
  }
}

/** 三格全部空白。⛔ 唔准入（原型 `saveClient()` 出「請至少填一項」）。 */
export function isBlank(input: ClientInput): boolean {
  const t = trimInput(input)
  return t.client === '' && t.contact === '' && t.phone === ''
}

/**
 * 兩筆算唔算同一個。
 *
 * ⚠️⚠️ 呢度**特登跟 DB 個唯一索引，⛔ 唔跟原型**。
 *   · 原型 `saveClient()` 係 `x.co === c.co` —— trim 咗但**分大細楷**。
 *   · DB `quote_clients_unique_idx` 係 `lower(btrim(...))` 三格。
 *
 * ⛔ 前端鬆過 DB 嘅話，人打完撳儲存 → 過到前端 → 俾 DB 彈返 23505，
 *    出嘅係一句英文 constraint 名。⭐ 前端同 DB 用同一把尺先唔會咁。
 *    （呢個唔同係 `docs/P7-客戶簿-人名.md` 寫明咗嘅，Jason 收咗貨。）
 */
export function sameClient(a: ClientInput, b: ClientInput): boolean {
  const key = (c: ClientInput) => {
    const t = trimInput(c)
    return `${t.client.toLowerCase()} ${t.contact.toLowerCase()} ${t.phone.toLowerCase()}`
  }
  return key(a) === key(b)
}

/** 揾返本簿入面有冇一模一樣嘅。`skipId` ＝ 改緊嗰筆自己，⛔ 唔算撞。 */
export function findDuplicate(
  list: QuoteClient[],
  input: ClientInput,
  skipId: string | null,
): QuoteClient | null {
  return list.find((one) => one.id !== skipId && sameClient(one, input)) ?? null
}

/**
 * 搜尋。原型：`cbLabel(c).toLowerCase().includes(query)` —— 三格併埋一齊搵。
 * ⛔ 空 query ＝ 全部出，⛔ 唔係一個都唔出。
 */
export function matchClients(list: QuoteClient[], query: string): QuoteClient[] {
  const q = query.trim().toLowerCase()
  if (q === '') return list
  return list.filter((one) => clientLabel(one).toLowerCase().includes(q))
}

export const DUPLICATE_MESSAGE = '客戶簿已有相同記錄。'
export const BLANK_MESSAGE = '請至少填一項。'

/** DB 彈返嚟嘅撞重複，要譯成人話。⛔ 唔准將 constraint 名照出俾人睇。 */
export function translateClientError(message: string): string {
  if (/quote_clients_unique_idx|duplicate key/i.test(message)) return DUPLICATE_MESSAGE
  if (/quote_clients_not_all_blank/i.test(message)) return BLANK_MESSAGE
  return translateDbError(message)
}

function reportError(message: string): Error {
  console.error('[quote-app] DB error:', message)
  return new Error(translateClientError(message))
}

const NO_ROW_MESSAGE = '改唔到呢個客戶。可能有人啱啱刪咗佢，或者你冇權改。'

export function createClientsApi(client: SupabaseClient, userId: string): ClientsApi {
  async function writeBack(
    promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<QuoteClient> {
    const { data, error } = await promise
    if (error) throw reportError(error.message)
    // ⛔ 0 行一定要當被拒絕（`CLAUDE.md` §2.6）—— RLS 唔會 throw，佢只係唔改。
    if (!data) throw new Error(NO_ROW_MESSAGE)
    return data as QuoteClient
  }

  function patch(id: string, values: Record<string, unknown>) {
    return client
      .from('quote_clients')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle()
  }

  return {
    async list() {
      const { data, error } = await client
        .from('quote_clients')
        .select('*')
        .is('deleted_at', null)
        .order('client', { ascending: true })
        .order('contact', { ascending: true })

      if (error) throw reportError(error.message)
      return (data ?? []) as QuoteClient[]
    },

    create(input) {
      return writeBack(
        client
          .from('quote_clients')
          .insert({ ...trimInput(input), created_by: userId })
          .select()
          .maybeSingle(),
      )
    },

    update(id, input) {
      return writeBack(patch(id, trimInput(input)))
    },

    softDelete(id) {
      return writeBack(patch(id, { deleted_at: new Date().toISOString() }))
    },
  }
}
