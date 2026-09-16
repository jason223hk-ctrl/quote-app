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
 *
 * ⚠️⚠️ **`r2` 同 `error` 兩句已經搬咗落 `photoHint()`，⛔ 唔好喺呢度改返。**
 *    見下面 `photoHint()` 檔頭 —— 一個狀態唔夠講清楚「你而家做得到咩」。
 */
export const PHOTO_STATUS_HINT: Record<PhotoStatus, string> = {
  local: '仲未上到雲端。唔好清瀏覽器資料，返到有網開一開 app。',
  uploading: '上緊，唔好熄咗個 app。',
  r2: '雲端（R2）已經有一份，⛔ 唔會冇咗。Drive 嗰份補緊。',
  synced: '兩份雲端副本齊晒。',
  /* ⚠️ `error` 呢句**⛔ 出唔到畫面** —— `photoHint()` 見到 `error` 一定會行
     三條分支其中一條。留喺度淨係為咗 `Record<PhotoStatus, string>` 齊整。
     ⛔ 唔好喺呢度加字期望佢會出 —— 要改就改 `photoHint()`。 */
  error: '上唔到。',
}

/**
 * 一張相而家卡喺邊 —— ⛔ 唔止一個 `status`，因為**同一個 `status` 之下，
 * 「你而家做得到咩」可以完全唔同**。
 */
export type PhotoTrouble = {
  status: PhotoStatus
  /** 雲端（R2）嗰份有冇。⭐ 有 ＝ 張相安全咗，⛔ 唔會因為 Drive 抄唔到而冇。 */
  r2Done: boolean
  /** **呢部機**仲有冇呢張相嘅 bytes。⛔ 冇就重試唔到（重試要靠部機嗰份）。 */
  hasLocal: boolean
}

/**
 * 出畫面嗰句提示。
 *
 * ⭐⭐⭐ **⛔ 兩條硬規矩（Jason 2026-09-16 拍板），⛔ 一條都唔准拆**
 *
 * **①** ⛔ **唔准承諾一個我哋量唔到嘅時間。**
 *
 * ⚠️ 舊版寫住「Drive 嗰份補緊。**通常幾秒到幾分鐘就得。**」
 * 2026-09-16 Jason 部真機同一張卡上面**同時**寫住
 * 「抄唔到去 Drive：Drive 查詢失敗（429）」——
 * ⭐ 而 429 可以係「今日 Google 額度用晒」，嗰種**等成日都唔會好**。
 * ⇒ **「幾分鐘就得」嗰句喺嗰一刻係假嘅**，而且係我哋自己講嘅。
 * ⛔ 我哋根本量唔到要幾耐 ⇒ **就唔好講。**
 *
 * **②** **要講得出佢而家做得到咩。⭐ 如果答案係「乜都做唔到，等就得」，
 *    就老實咁寫出嚟。** 而且**張相喺 R2 安唔安全，一定要寫明** ——
 *    ⭐ 嗰個先係佢真正想知嘅嘢。
 *
 * ⚠️⚠️ **點解要拆開 `r2Done` 同 `hasLocal` —— ⛔ 唔准淨係記住結論**
 *
 * 舊版 `error` 得一句「上唔到。撳『再試一次』，唔會影多張相。」，
 * 但 `error` 底下其實有**兩種完全唔同嘅處境**：
 *
 *   · **R2 都未上到**（部機仲有份）⇒ 撳「再試一次」**真係會再上一次**。✅
 *   · **R2 上咗，Drive 試咗三次都唔得** ⇒ `PhotoSlot` 個 `runMirror()`
 *     **第一行就會因為 `driveAttempts >= MAX_DRIVE_ATTEMPTS` 直接返**，
 *     ⛔⛔ **一個請求都唔會發。**
 *
 * ⇒ 即係第二種情況之下，**畫面叫佢撳一粒乜都唔會做嘅掣**。
 * ⭐ 同「撳個狀態格冇反應」係一模一樣嘅病：**粒掣喺度、撳得落、乜都唔發生。**
 *
 * ⛔ 所以呢度⛔ 唔可以淨係睇 `status`。
 */
export function photoHint(trouble: PhotoTrouble): string {
  const { status, r2Done, hasLocal } = trouble

  if (status !== 'error') return PHOTO_STATUS_HINT[status]

  // ⭐ R2 有份 ⇒ 卡住嘅係 Drive 嗰份。⛔ 而呢個情況人做唔到嘢。
  if (r2Done) {
    return (
      '⭐ 張相已經安全入咗雲端，⛔ 唔會冇咗 —— 差嘅淨係 Drive 嗰份副本。' +
      '試咗三次都唔得，⛔ 唔會再自動試。' +
      '⚠️ 你而家做唔到嘢，請截圖搵 Jason。'
    )
  }

  // 連 R2 都未上到，而部機仲有份 ⇒ 撳「再試一次」真係會再上一次。
  if (hasLocal) {
    return '上唔到雲端。張相仲喺部機度，⛔ 唔會冇咗。撳「再試一次」——⛔ 唔會影多張相。'
  }

  /* ⚠️ 連 R2 都未上到，而**呢部機冇份**（喺第二部機影嘅）。
     ⛔ 今日行唔到呢條路（`saveRow()` 係 R2 上咗之後先寫行，而 `r2_error`
     由頭到尾冇人寫過非空值）—— ⭐ 但⛔ 唔准因為「行唔到」就出一句錯嘅字：
     一個將來加嘅路徑會靜靜咁踩中佢，而嗰陣冇人記得呢度。 */
  return (
    '上唔到雲端，而呢部機冇呢張相嘅副本（喺第二部機影嘅）。' +
    '⛔ 喺呢部機做唔到嘢 —— 請喺影嗰部機開一開 app。'
  )
}

/**
 * 「再試一次」粒掣出唔出。
 *
 * ⛔⛔ **⛔ 唔准淨係睇 `status === 'error'`。** 見 `photoHint()`：
 *    Drive 試夠三次嗰種，粒掣撳落去**一個請求都唔會發**。
 * ⭐ **一粒乜都唔做嘅掣，比冇粒掣更差** —— 人會一路撳一路等，
 *    而個 app 由頭到尾冇郁過。
 */
export function photoCanRetry(trouble: PhotoTrouble): boolean {
  return trouble.status === 'error' && !trouble.r2Done && trouble.hasLocal
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
  /** ⛔ null ＝ 環境相（成個工程一份，唔屬於任何一棵樹）。 */
  treeId: string | null
  /**
   * 邊個工序。⛔ null ＝ 全景相（成棵樹）。
   * ⚠️ 佢係「邊個工序」，全景相真係冇，同「空字串」唔同意思 —— ⛔ 唔准送空字串。
   */
  mitigation: string | null
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
    mitigation: input.mitigation,
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
/**
 * 撞嘅係咪「同一格個號」嗰個 index（`quote_photos_slot_seq_uidx`）。
 *
 * ⚠️ 認個 index 名。⛔ 唔准反過嚟寫「唔係 operation_id 就當係佢」——
 * 將來加多個 unique index，嗰種寫法會靜靜咁將新嗰個當成撞號，然後無限重試。
 */
export function isSlotSeqViolation(error: { message: string }): boolean {
  return /quote_photos_slot_seq_uidx/i.test(error.message)
}

export function isUniqueViolation(error: { code?: string; message: string }): boolean {
  return (
    error.code === '23505' ||
    /duplicate key value violates unique constraint/i.test(error.message)
  )
}

/** 撞咗 unique 但又揾唔返嗰行 —— 唔常見，但唔准靜靜過骨，要出中文。 */
export const DUPLICATE_NOT_FOUND_MESSAGE =
  '資料庫話呢張相已經有紀錄，但即刻揾返出嚟又揾唔到。相仲喺部機度，唔會冇咗。請截圖搵 Jason。'

/**
 * 同一格撞咗號（`quote_photos_slot_seq_uidx`）。
 *
 * ⛔⛔ 呢個**唔係** `operation_id` 嗰種撞。兩者都係 23505，但意思相反：
 *   - `operation_id` 撞 ＝ **呢張相之前已經寫咗**，重試唔會多一行 ⇒ 當佢成功。
 *   - 同一格撞號 ＝ **另一張相霸咗呢個號** ⇒ 要**攞下一個號再試**。
 *
 * ⚠️ 2026-09-04 真機中過：兩者當咗同一件事處理，於是第二張環境相彈
 * 「資料庫話呢張相已經有紀錄，但即刻搵返出嚟又搵唔到」——
 * 句嘢本身冇講錯，但佢叫人截圖搵 Jason，而其實系統自己重試就搞得掂。
 */
export class SlotSeqTakenError extends Error {
  constructor(message = '呢個號已經俾同一格另一張相霸咗。') {
    super(message)
    this.name = 'SlotSeqTakenError'
  }
}

export type PhotosApi = {
  listByRecord: (recordId: string) => Promise<QuotePhoto[]>
  /**
   * 全部工程嘅相，一次過。同步頁用。
   * ⛔ RLS 已經幫你限死係你自己嘅嘢，⛔ 唔使亦唔准喺前端再篩一次「邊個 user」。
   */
  listAll: () => Promise<QuotePhoto[]>
  /** 用影相編號揾返 —— 重試之前查一次，就唔會整兩行出嚟。 */
  findByOperationId: (operationId: string) => Promise<QuotePhoto | null>
  /**
   * 問資料庫攞呢一格下一個號。
   *
   * ⛔⛔ 由 **DB** 派號，⛔ 前端唔准自己數（`P3c-計劃書.md` D1）。
   * 前端數嘅話，阿耀數唔到聰嗰行（RLS 一收窄就會咁），兩個人永遠算返同一個號。
   *
   * ⚠️ 「先派號、後 insert」中間有一個**已知而且有界**嘅 race：
   * 兩部機可能攞到同一個號。⇒ 個 unique index 係最後一道閘，
   * 撞到就攞下一個號再試（`uploadPending` 做，最多三次）。
   */
  allocateSeq: (recordId: string, treeId: string | null, mitigation: string | null) => Promise<number>
  create: (input: PhotoInsert) => Promise<QuotePhoto>
}

function reportError(message: string): Error {
  console.error('[quote-app] DB error:', message)
  return new Error(translateDbError(message))
}

/**
 * 相片行俾 RLS 拒絕（0 行）嗰句。
 *
 * ⚠️ 2026-09-14 補咗最後一句。原本得「…相仲喺部機度，唔會冇咗。」——
 *    ⛔ 冇講**下一步搵邊個、做乜**，違反 CLAUDE.md §2.7。
 *    ⭐ 而呢句正正就係 Testing01 嗰 4 張相會出嘅句，即係最需要講清楚嗰句。
 *
 * ⭐⭐ 出咗做 `export`：`stuckPhotos.ts` 要認得返呢一句，
 *    ⛔ 但**唔准喺嗰邊自己抄一段字串落去對** —— 抄咗，改文案就會靜靜咁失靈。
 *    ⚠️ 呢度冇得用 `instanceof`：張相嘅錯誤係**存落 IndexedDB 嘅一個字串**，
 *    過咗序列化，型別冚唪唥冇晒。所以唯一守得住嘅做法係大家用返同一個常數。
 */
export const PHOTO_NO_ROW_MESSAGE =
  '相片記錄寫唔入資料庫。可能母單已經鎖定，或者唔係你開嘅單。相仲喺部機度，唔會冇咗。請截圖，用 WhatsApp 搵 Jason。'

const NO_ROW_MESSAGE = PHOTO_NO_ROW_MESSAGE

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

    async listAll() {
      const { data, error } = await client
        .from('quote_photos')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

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

    async allocateSeq(recordId, treeId, mitigation) {
      const { data, error } = await client.rpc('allocate_quote_photo_seq', {
        p_record_id: recordId,
        p_tree_id: treeId,
        p_mitigation: mitigation,
      })

      if (error) throw reportError(error.message)
      // ⛔ 派唔到號就唔准自己填一個（`P3c-計劃書.md` §7）——
      //    自己填等於繞過咗個 index，兩行同號就真係會寫得入去。
      if (typeof data !== 'number' || !Number.isFinite(data) || data < 1) {
        throw new Error('攞唔到相片編號。相仲喺部機度，唔會冇咗。請撳「再試一次」。')
      }
      return data
    },

    async create(input) {
      const { data, error } = await client
        .from('quote_photos')
        .insert(photoInsertToRow(input, userId))
        .select()
        .maybeSingle()

      if (error) {
        if (isUniqueViolation(error)) {
          console.error('[quote-app] duplicate insert:', error.message)
          // 同一個 operation_id 之前已經寫咗一行 ⇒ 當佢成功。
          // ⛔ 但要真係揾返嗰行出嚟先算，唔准當然。
          const existing = await api.findByOperationId(input.operationId)
          if (existing) return existing
          // 揾唔返 ⇒ 撞嘅唔係 operation_id，係**同一格個號**。
          // ⛔ 呢個唔係「要人睇」，係「攞下一個號再試」。
          if (isSlotSeqViolation(error)) throw new SlotSeqTakenError()
          throw new Error(DUPLICATE_NOT_FOUND_MESSAGE)
        }
        throw reportError(error.message)
      }
      // RLS 唔會 throw，佢只係令 0 行受影響。0 行一定要當被拒絕（CLAUDE.md §2.6）。
      // ⛔ 2026-09-14 補返 console：呢條路本來一隻字都唔留，
      //    ⚠️ 事後想查「究竟有冇試過寫」都查唔到（同 `records.ts` 同一個窿）。
      if (!data) {
        console.error('[quote-app] write affected 0 rows (RLS refused): quote_photos')
        throw new Error(NO_ROW_MESSAGE)
      }
      return data as QuotePhoto
    },
  }

  return api
}
