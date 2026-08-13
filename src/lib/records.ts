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

/** 欄位中文名。錯誤訊息同表單提示都用返同一份，唔會兩邊叫法唔同。 */
export const FIELD_LABELS: Record<string, string> = {
  record_date: '日期',
  name: '個名',
  main_con: '大判',
  site: '地點',
  client: '客戶／聯絡人',
  region: '地區',
  shift: '日／夜更',
  start_time: '預計開工',
  odoo_ref: 'Odoo REF#',
  internal_note: '內部備註',
  status: '狀態',
  created_by: '建立者',
}

export type FieldErrors = Partial<Record<keyof RecordInput, string>>

/**
 * 一定要填嘅欄。地區同日／夜更係必填而唔係俾個預設值——
 * 佢哋直接影響夾車、吊機、夜更價，靜靜幫人揀等於靜靜報錯價。
 */
export function validateInput(input: RecordInput): FieldErrors {
  const errors: FieldErrors = {}
  if (input.record_date.trim() === '') errors.record_date = '請揀日期'
  if (input.name.trim() === '') errors.name = '請填個名'
  if (input.region === '') errors.region = '請揀地區'
  if (input.shift === '') errors.shift = '請揀日更定夜更'
  return errors
}

/**
 * 表單 → DB 欄位。
 *
 * 呢啲 text 欄喺 schema 係 not null default ''，所以空白一律送空字串，
 * **永遠唔送 null**（送 null 會逐個欄爆 not-null constraint，現場填漏一欄就落唔到單）。
 * 只掂表單擁有嘅欄，status / markup_pct / locked / archived / deleted_at 一律唔碰。
 */
export function inputToRow(input: RecordInput): Record<string, string> {
  return {
    record_date: input.record_date,
    name: input.name.trim(),
    main_con: input.main_con.trim(),
    site: input.site.trim(),
    client: input.client.trim(),
    region: input.region,
    shift: input.shift,
    start_time: input.start_time.trim(),
    odoo_ref: input.odoo_ref.trim(),
    internal_note: input.internal_note.trim(),
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

/**
 * DB 嘅英文 error 阿耀、聰、Isaac 睇唔明，所以譯返人話中文。
 * 原文照樣寫落 console（見 reportError），方便查。
 */
export function translateDbError(message: string): string {
  const notNull = /null value in column "([^"]+)"/.exec(message)
  if (notNull) {
    const field = FIELD_LABELS[notNull[1]] ?? notNull[1]
    return `「${field}」未填好，請檢查返再儲存。`
  }

  if (message.includes('permission denied')) {
    return '呢個帳號未有權限讀寫報價單。資料庫嗰邊未 GRANT 俾 authenticated，要 admin 補返。'
  }

  if (message.includes('row-level security')) {
    return '冇權限做呢個動作。你只可以改自己開、而且未鎖定嘅單。'
  }

  if (message.includes('PGRST116') || message.toLowerCase().includes('0 rows')) {
    return NO_ROW_MESSAGE
  }

  if (message.includes('duplicate key')) {
    return '呢一單好似已經存在，請返清單睇返。'
  }

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return '連唔到伺服器，請check返個網絡再試。'
  }

  return '儲存唔到，請再試一次。如果一直唔得，請截圖搵 Jason。'
}

/** 原文英文留喺 console，畫面出中文。 */
function reportError(message: string): Error {
  console.error('[quote-app] DB error:', message)
  return new Error(translateDbError(message))
}

export function createRecordsApi(client: SupabaseClient, userId: string): RecordsApi {
  async function writeBack(
    promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<QuoteRecord> {
    const { data, error } = await promise
    if (error) throw reportError(error.message)
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

      if (error) throw reportError(error.message)
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
