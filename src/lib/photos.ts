import type { SupabaseClient } from '@supabase/supabase-js'
import { translateDbError } from './records'

/**
 * quote_photos 一行。
 *
 * P3a 只行「一張全景相上到 R2」呢一條路，所以 Drive 嗰四個欄、`remark`、`marks`
 * 喺呢一版**淨係讀，唔會寫**。欄位由第一日就開齊（`docs/開發紀錄.md` §九），
 * 因為「一張相仲剩幾份副本」要數得出，遲啲先加就數唔到返轉頭。
 */
export type QuotePhoto = {
  id: string
  record_id: string
  /** 留空 = 工程相（P3b 之後先做）。P3a 一定有樹。 */
  tree_id: string | null
  /** 留空 = 全景相。P3a 一律留空。 */
  mitigation: string | null
  seq: number
  /** 影相嗰刻定死，每次重試用返同一個。R2 檔名亦係用佢。 */
  operation_id: string

  r2_key: string
  r2_synced_at: string | null
  r2_error: string
  drive_file_id: string
  drive_synced_at: string | null
  drive_error: string
  size_bytes: number | null
  sha256: string

  /** 影相嗰刻，唔係寫入資料庫嗰刻。離線影完幾個鐘先有網，兩個時間差好遠。 */
  captured_at: string | null
  remark: string
  marks: unknown

  created_by: string
  created_at: string
  deleted_at: string | null
}

/**
 * 一張相嘅狀態。
 *
 * P3a 得四個 —— **冇「已同步，兩份齊」**，因為 P3a 冇 Drive。
 * 冇兩份就唔准講兩份（`docs/P3-現場影相-設計.md` 第四章）。
 */
export type PhotoStatus = 'local' | 'uploading' | 'r2' | 'synced' | 'error'

export const PHOTO_STATUS_LABEL: Record<PhotoStatus, string> = {
  local: '只喺部機',
  uploading: '上緊',
  r2: '已入 R2（Drive 未做）',
  synced: '已同步，兩份齊',
  error: '有事要人睇',
}

/**
 * ⛔ 唔准靜靜降級：每個狀態都要有一句寫得出嘅中文。
 * 「只喺部機」特登講到明張相仲未安全，唔可以令人以為做完。
 */
export const PHOTO_STATUS_HINT: Record<PhotoStatus, string> = {
  local: '仲未上到雲端。唔好清瀏覽器資料，返到有網開一開 app。',
  uploading: '上緊，唔好熄咗個 app。',
  r2: '雲端有一份，Drive 嗰份補緊。通常幾秒到幾分鐘就得。',
  synced: '兩份雲端副本齊晒。',
  error: '上唔到。撳「再試一次」，唔會影多張相。',
}

/** R2 檔名。`{用戶id}/{影相編號}.jpg`（`docs/P3-現場影相-設計.md` 第三章）。 */
export function r2KeyFor(userId: string, operationId: string): string {
  return `${userId}/${operationId}.jpg`
}

/** 影相編號。影相嗰刻定一次，之後每次重試都用返同一個，所以重試唔會整多份。 */
export function newOperationId(): string {
  return crypto.randomUUID()
}

/**
 * 由 DB 一行推返個狀態出嚟。UI 唔准自己另外記一份。
 *
 * `driveAttempts` 係本機記住嘅「Drive 試咗幾多次」。
 * ⛔ 連續失敗 `MAX_DRIVE_ATTEMPTS` 次之後就唔再自動試，轉「有事要人睇」——
 * 每次開 app 都自動試、每次都出聲，人好快唔再理，而唔理就等於個警告冇咗作用
 * （`docs/P3b-計劃書.md` §7.5）。
 */
export function statusOfRow(row: QuotePhoto, driveAttempts = 0): PhotoStatus {
  if (row.r2_synced_at !== null) {
    if (row.drive_synced_at !== null) return 'synced'
    if (driveAttempts >= MAX_DRIVE_ATTEMPTS) return 'error'
    return 'r2'
  }
  if (row.r2_error.trim() !== '') return 'error'
  return 'local'
}

/** ⛔ 連續失敗三次就停自動重試（Jason 2026-08-22）。 */
export const MAX_DRIVE_ATTEMPTS = 3

/** ⛔ 一次補三張。唔准一次過發成個工程嘅請求 —— 地盤網絡差，三十個會一齊死。 */
export const MIRROR_BATCH_SIZE = 3

/**
 * 揀邊幾張相今次補鏡像。
 *
 * 只揀「已入 R2、Drive 未做、而且仲未試夠三次」嗰啲，舊嘅行先。
 */
export function pickMirrorBatch(
  rows: QuotePhoto[],
  attempts: (photoId: string) => number,
  batchSize = MIRROR_BATCH_SIZE,
): QuotePhoto[] {
  return rows
    .filter((row) => row.r2_synced_at !== null && row.drive_synced_at === null)
    .filter((row) => attempts(row.id) < MAX_DRIVE_ATTEMPTS)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, batchSize)
}

export type Digest = { size: number; sha256: string }

/**
 * 對數。size 同 sha256 兩樣都要一模一樣先算過。
 * ⛔ 對唔上就當失敗 —— 唔准寫「已入 R2」（計劃書第八節）。
 */
export function digestMatches(expected: Digest, actual: Digest): boolean {
  return expected.size === actual.size && expected.sha256 === actual.sha256
}

export function digestMismatchMessage(expected: Digest, actual: Digest): string {
  if (expected.size !== actual.size) {
    return `對唔到數：上傳前 ${expected.size} bytes，讀返出嚟 ${actual.size} bytes。呢張相未算上到，請再試一次。`
  }
  return '對唔到數：讀返出嚟嘅內容同上傳嗰份唔一樣。呢張相未算上到，請再試一次。'
}

export function bytesToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes))
}

export type PhotoInsert = {
  recordId: string
  treeId: string
  operationId: string
  seq: number
  r2Key: string
  sizeBytes: number
  sha256: string
  capturedAt: string
}

/**
 * 表單 → DB。
 *
 * 文字欄永遠送空字串唔送 null（P1 教訓，`CLAUDE.md` §2.3）。
 * `mitigation` 留空係 null —— 佢係「邊個工序」，全景相真係冇，同「空字串」唔同意思。
 * Drive 三個欄同 `remark` / `marks` **特登唔出現喺 payload**：P3a 唔郁佢哋。
 */
export function photoInsertToRow(input: PhotoInsert, userId: string): Record<string, unknown> {
  return {
    record_id: input.recordId,
    tree_id: input.treeId,
    mitigation: null,
    // ⛔ seq 由 1 數起。檔名嗰個 NN = 2 × seq − 1，寫 0 就會計出 -1。
    // 呢個規矩由寫入呢一個位負責，⛔ 唔准喺砌檔名嗰邊加特例補救。
    seq: input.seq,
    operation_id: input.operationId,
    r2_key: input.r2Key,
    r2_synced_at: new Date().toISOString(),
    r2_error: '',
    size_bytes: input.sizeBytes,
    sha256: input.sha256,
    captured_at: input.capturedAt,
    created_by: userId,
  }
}

/**
 * 資料庫嗰邊嘅 unique 撞咗。
 *
 * `operation_id` 有 unique index，所以「重試唔會多一行」呢件事**係資料庫守住嘅**，
 * 唔係淨係靠 code 揸住。撞到嗰陣**唔係出事，係「呢張相之前已經寫咗」** ——
 * 兩部機一齊上、或者網絡抽一抽，都會行到呢一條。
 */
export function isUniqueViolation(error: { code?: string; message: string }): boolean {
  return (
    error.code === '23505' ||
    /duplicate key value violates unique constraint/i.test(error.message)
  )
}

/** 撞咗 unique 但又揾唔返嗰行 —— 唔常見，但唔准靜靜過骨，要出中文。 */
export const DUPLICATE_NOT_FOUND_MESSAGE =
  '資料庫話呢張相已經有紀錄，但即刻揾返出嚟又揾唔到。相仲喺部機度，唔會冇咗。請截圖搵 Jason。'

export type PhotosApi = {
  listByRecord: (recordId: string) => Promise<QuotePhoto[]>
  /** 用影相編號揾返 —— 重試之前查一次，就唔會整兩行出嚟。 */
  findByOperationId: (operationId: string) => Promise<QuotePhoto | null>
  create: (input: PhotoInsert) => Promise<QuotePhoto>
}

function reportError(message: string): Error {
  console.error('[quote-app] DB error:', message)
  return new Error(translateDbError(message))
}

const NO_ROW_MESSAGE =
  '相片記錄寫唔入資料庫。可能母單已經鎖定，或者唔係你開嘅單。相仲喺部機度，唔會冇咗。'

export function createPhotosApi(client: SupabaseClient, userId: string): PhotosApi {
  const api: PhotosApi = {
    async listByRecord(recordId) {
      const { data, error } = await client
        .from('quote_photos')
        .select('*')
        .eq('record_id', recordId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (error) throw reportError(error.message)
      return (data ?? []) as QuotePhoto[]
    },

    async findByOperationId(operationId) {
      const { data, error } = await client
        .from('quote_photos')
        .select('*')
        .eq('operation_id', operationId)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) throw reportError(error.message)
      return (data ?? null) as QuotePhoto | null
    },

    async create(input) {
      const { data, error } = await client
        .from('quote_photos')
        .insert(photoInsertToRow(input, userId))
        .select()
        .maybeSingle()

      if (error) {
        if (isUniqueViolation(error)) {
          // 之前已經寫咗一行。當佢成功 —— 但要真係揾返嗰行出嚟先算，唔准當然。
          console.error('[quote-app] duplicate insert ignored:', error.message)
          const existing = await api.findByOperationId(input.operationId)
          if (existing) return existing
          throw new Error(DUPLICATE_NOT_FOUND_MESSAGE)
        }
        throw reportError(error.message)
      }
      // RLS 唔會 throw，佢只係令 0 行受影響。0 行一定要當被拒絕（CLAUDE.md §2.6）。
      if (!data) throw new Error(NO_ROW_MESSAGE)
      return data as QuotePhoto
    },
  }

  return api
}
