import type { SupabaseClient } from '@supabase/supabase-js'

export type QuoteStatus = 'site' | 'pending' | 'quoted' | 'sent' | 'won' | 'lost'
export type Region = 'NT' | 'KLN' | 'HK'
export type Shift = 'day' | 'night'

/** quote_records 一行。Schema 由 Jason 喺 Supabase 建，呢度只係對應，唔改。 */
export type QuoteRecord = {
  id: string
  record_date: string
  name: string
  main_con: string | null
  site: string | null
  client: string | null
  region: Region | null
  shift: Shift | null
  start_time: string | null
  odoo_ref: string | null
  internal_note: string | null
  status: QuoteStatus
  markup_pct: number | null
  archived: boolean
  locked: boolean
  transferred_project_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 表單填出嚟嘅嘢。全部 string，寫入前先轉 null。 */
export type RecordInput = {
  record_date: string
  name: string
  main_con: string
  site: string
  client: string
  region: Region | ''
  shift: Shift | ''
  start_time: string
  odoo_ref: string
  internal_note: string
}

export const EMPTY_INPUT: RecordInput = {
  record_date: '',
  name: '',
  main_con: '',
  site: '',
  client: '',
  region: '',
  shift: '',
  start_time: '',
  odoo_ref: '',
  internal_note: '',
}

/**
 * UI 只認呢個介面，唔直接摸 Supabase client。
 * 好處：本機可以用 in-memory 假 api 行真流程，唔使連 DB。
 */
export type RecordsApi = {
  list: () => Promise<QuoteRecord[]>
  create: (input: RecordInput) => Promise<QuoteRecord>
  update: (id: string, input: RecordInput) => Promise<QuoteRecord>
  setArchived: (id: string, archived: boolean) => Promise<QuoteRecord>
  softDelete: (id: string) => Promise<QuoteRecord>
}

function toNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** 表單 → DB 欄位。只掂表單擁有嘅欄，status / markup_pct / locked 等一律唔碰。 */
export function inputToRow(input: RecordInput): Record<string, string | null> {
  return {
    record_date: input.record_date,
    name: input.name.trim(),
    main_con: toNull(input.main_con),
    site: toNull(input.site),
    client: toNull(input.client),
    region: input.region === '' ? null : input.region,
    shift: input.shift === '' ? null : input.shift,
    start_time: toNull(input.start_time),
    odoo_ref: toNull(input.odoo_ref),
    internal_note: toNull(input.internal_note),
  }
}

/** DB 一行 → 表單值，方便編輯。 */
export function rowToInput(record: QuoteRecord): RecordInput {
  return {
    record_date: record.record_date,
    name: record.name,
    main_con: record.main_con ?? '',
    site: record.site ?? '',
    client: record.client ?? '',
    region: record.region ?? '',
    shift: record.shift ?? '',
    start_time: record.start_time ?? '',
    odoo_ref: record.odoo_ref ?? '',
    internal_note: record.internal_note ?? '',
  }
}

/**
 * RLS 唔會 throw，佢只係令 0 行受影響。所以改唔到嘅時候要講得清楚點解，
 * 唔可以扮成功（P0 定落嘅規矩：未 readback 確認唔算成功）。
 */
const NO_ROW_MESSAGE =
  '改唔到呢一單。可能已經鎖定（locked），或者唔係你開嘅單。要 admin 幫手先改得。'

function describeError(message: string): string {
  if (message.includes('PGRST116') || message.toLowerCase().includes('0 rows')) {
    return NO_ROW_MESSAGE
  }
  return message
}

export function createRecordsApi(client: SupabaseClient, userId: string): RecordsApi {
  async function writeBack(
    promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<QuoteRecord> {
    const { data, error } = await promise
    if (error) throw new Error(describeError(error.message))
    if (!data) throw new Error(NO_ROW_MESSAGE)
    return data as QuoteRecord
  }

  function patch(id: string, values: Record<string, string | boolean | null>) {
    return client
      .from('quote_records')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle()
  }

  return {
    async list() {
      // 軟刪除嘅單喺 server 側就隔走，任何篩選都唔會攞得返出嚟。
      const { data, error } = await client
        .from('quote_records')
        .select('*')
        .is('deleted_at', null)
        .order('record_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return (data ?? []) as QuoteRecord[]
    },

    create(input) {
      return writeBack(
        client
          .from('quote_records')
          .insert({ ...inputToRow(input), created_by: userId })
          .select()
          .maybeSingle(),
      )
    },

    update(id, input) {
      return writeBack(patch(id, inputToRow(input)))
    },

    setArchived(id, archived) {
      return writeBack(patch(id, { archived }))
    },

    softDelete(id) {
      // 真刪係做唔到嘅（schema 特登冇 delete policy），只寫 deleted_at。
      return writeBack(patch(id, { deleted_at: new Date().toISOString() }))
    },
  }
}
