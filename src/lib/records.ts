import type { SupabaseClient } from '@supabase/supabase-js'

export type QuoteStatus = 'site' | 'pending' | 'quoted' | 'sent' | 'won' | 'lost'
export type Region = 'NT' | 'KLN' | 'HK'
export type Shift = 'day' | 'night'

export type SourceKind = 'gps' | 'manual'

/**
 * quote_records 一行。Schema 由 Jason 喺 Supabase 建，呢度只係對應，唔改。
 *
 * main_con / site / start_time / odoo_ref 由 P2.5 開始唔再喺表單顯示，
 * 但欄位仲喺 DB、舊單資料一律保留，永遠查得返——所以型別要留住佢哋。
 */
export type QuoteRecord = {
  id: string
  record_date: string
  name: string
  address: string
  client: string | null
  contact: string
  phone: string
  region: Region | null
  shift: Shift | null
  internal_note: string | null
  gps_lat: number | null
  gps_lng: number | null
  gps_at: string | null
  address_source: SourceKind
  region_source: SourceKind
  /** 以下四個係舊表單嘅欄位：唔顯示、唔寫入，但唔准刪。 */
  main_con: string | null
  site: string | null
  start_time: string | null
  odoo_ref: string | null
  status: QuoteStatus
  markup_pct: number | null
  /**
   * 轉「已報價」嗰刻影低嘅單價表副本（quote_prices 全表）。
   * null ＝ 仲係待報價，用全 app 現價。
   * ⛔ 有咗就唔可以再跟現價 —— 個價已經俾咗客戶，公司之後加價唔可以追溯改人哋張單。
   * ⚠️ 特登唔 import PriceSnapshot：prices.ts 反過嚟 import 呢個檔（translateDbError），
   *    寫死型別會做成循環引用。用嗰邊自己 cast。
   */
  price_snapshot: unknown
  price_snapshot_at: string | null
  archived: boolean
  locked: boolean
  transferred_project_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * 新增工程表單填出嚟嘅嘢（P2.5 規格）。
 * 欄位順序：日期、日／夜工作、工程名稱、地址、地區、客戶、聯絡人、電話、其他備註。
 * 客戶就係大判（Jason 確認），所以冇獨立大判格。
 */
export type RecordInput = {
  record_date: string
  shift: Shift | ''
  name: string
  address: string
  region: Region | ''
  client: string
  contact: string
  phone: string
  internal_note: string
  gps_lat: number | null
  gps_lng: number | null
  gps_at: string | null
  address_source: SourceKind
  region_source: SourceKind
}

export const EMPTY_INPUT: RecordInput = {
  record_date: '',
  // 新單一開就係日更，唔再係「未選」。
  shift: 'day',
  name: '',
  address: '',
  region: '',
  client: '',
  contact: '',
  phone: '',
  internal_note: '',
  gps_lat: null,
  gps_lng: null,
  gps_at: null,
  address_source: 'manual',
  region_source: 'manual',
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
  /** 加成％。⛔ 只有辦公室改得（RLS 把關），畫面嗰層淨係決定畀唔畀你㩒。 */
  setMarkup: (id: string, pct: number | null) => Promise<QuoteRecord>
  softDelete: (id: string) => Promise<QuoteRecord>
}

/** 欄位中文名。錯誤訊息同表單提示都用返同一份，唔會兩邊叫法唔同。 */
export const FIELD_LABELS: Record<string, string> = {
  record_date: '日期',
  name: '工程名稱',
  address: '地址',
  client: '客戶',
  contact: '聯絡人',
  phone: '電話',
  region: '地區',
  shift: '日／夜工作',
  internal_note: '其他備註',
  gps_lat: 'GPS 緯度',
  gps_lng: 'GPS 經度',
  gps_at: 'GPS 時間',
  address_source: '地址來源',
  region_source: '地區來源',
  // 舊表單欄位，唔再顯示但 DB 仲有
  main_con: '大判',
  site: '地點',
  start_time: '預計開工',
  odoo_ref: 'Odoo REF#',
  status: '狀態',
  created_by: '建立者',
  // 樹木
  tree_no: '樹編號',
  species: '品種',
  height_m: '樹高',
  dbh_mm: 'DBH',
  crown_m: '冠幅',
  mitigations: '處理方法',
  mitigation_other: '其他處理方法',
  note: '備註',
  // 現場資料表
  crew_total: '總共幾多人',
  work_days: '做幾多天',
  climbers_per_day: '一日幾多個攀樹師',
  waste_options: '垃圾處理',
  waste_t24_qty: '24噸夾車架數',
  waste_t30_qty: '30噸夾車架數',
  machine_options: '機械',
  lift_other: '升降台 Other',
  stump_options: '起樹頭',
}

export type FieldErrors = Partial<Record<keyof RecordInput, string>>

/**
 * 一定要填嘅欄。地區同日／夜更係必填而唔係俾個預設值——
 * 佢哋直接影響夾車、吊機、夜更價，靜靜幫人揀等於靜靜報錯價。
 */
export function validateInput(input: RecordInput): FieldErrors {
  const errors: FieldErrors = {}
  if (input.record_date.trim() === '') errors.record_date = '請揀日期'
  if (input.name.trim() === '') errors.name = '請填工程名稱'
  if (input.address.trim() === '') errors.address = '請填地址'
  if (input.region === '') errors.region = '請揀地區'
  return errors
}

/**
 * 表單 → DB 欄位。
 *
 * 呢啲 text 欄喺 schema 係 not null default ''，所以空白一律送空字串，
 * **永遠唔送 null**（送 null 會逐個欄爆 not-null constraint，現場填漏一欄就落唔到單）。
 * 只掂表單擁有嘅欄，status / markup_pct / locked / archived / deleted_at 一律唔碰。
 */
export function inputToRow(input: RecordInput): Record<string, unknown> {
  return {
    record_date: input.record_date,
    shift: input.shift,
    name: input.name.trim(),
    address: input.address.trim(),
    region: input.region,
    client: input.client.trim(),
    contact: input.contact.trim(),
    phone: input.phone.trim(),
    internal_note: input.internal_note.trim(),
    gps_lat: input.gps_lat,
    gps_lng: input.gps_lng,
    gps_at: input.gps_at,
    address_source: input.address_source,
    region_source: input.region_source,
  }
  // 特登冇 main_con / site / start_time / odoo_ref：
  // 表單唔再顯示佢哋，如果照送空字串就會靜靜刪咗舊單嘅資料。
  // 唔喺 payload 出現 = update 唔會郁佢哋。
}

/** DB 一行 → 表單值，方便編輯。 */
export function rowToInput(record: QuoteRecord): RecordInput {
  return {
    record_date: record.record_date,
    // 舊單可能係 null（P2.5 之前未有預設），開返出嚟當日更。
    shift: record.shift ?? 'day',
    name: record.name,
    // 舊單嘅 site 已經由 Jason 抄咗入 address，所以呢度唔使再 fallback。
    address: record.address ?? '',
    region: record.region ?? '',
    client: record.client ?? '',
    contact: record.contact ?? '',
    phone: record.phone ?? '',
    internal_note: record.internal_note ?? '',
    gps_lat: record.gps_lat ?? null,
    gps_lng: record.gps_lng ?? null,
    gps_at: record.gps_at ?? null,
    address_source: record.address_source ?? 'manual',
    region_source: record.region_source ?? 'manual',
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

  function patch(id: string, values: Record<string, unknown>) {
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

    setMarkup(id, pct) {
      return writeBack(patch(id, { markup_pct: pct }))
    },

    softDelete(id) {
      // 真刪係做唔到嘅（schema 特登冇 delete policy），只寫 deleted_at。
      return writeBack(patch(id, { deleted_at: new Date().toISOString() }))
    },
  }
}
