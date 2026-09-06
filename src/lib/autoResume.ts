import { MAX_DRIVE_ATTEMPTS, pickMirrorBatch, type QuotePhoto } from './photos'
import type { PendingPhoto, UploadResult } from './photoUpload'

/**
 * 自動重傳嘅純邏輯。**唔掂 IndexedDB、唔掂 React、唔掂 fetch** —— 咁先測得到。
 *
 * 規格：`docs/上線清單.md` 第 1 條第 3 項
 * 「**收到網就自動再傳，⛔ 唔使人手撳**」。
 *
 * ⭐⭐ 一條規矩管住成個檔：**⛔ 唔准放棄。**
 *    放棄 ＝ 張相靜靜咁永遠留喺部機，⛔ 而且冇人會知少咗 ——
 *    正正就係第 1 條開頭嗰句「未上載嘅相唔准靜靜雞冇咗」。
 *    所以呢度**冇「試夠 N 次就唔再試」**：失敗就等下一輪，一路等到有網為止。
 *
 * ⚠️ 同 Drive 鏡像嗰邊（`MAX_DRIVE_ATTEMPTS` 夠三次就停）特登唔同，唔係手民之誤：
 *    Drive 嗰份係**第二份**副本，唔急喺呢一分鐘搞掂；
 *    呢度講緊嘅相**一份雲端副本都未有**，部機一冇就真係冇咗。
 */

/**
 * 幾耐先掃一次 Drive。
 *
 * ⚠️ 掃一次 ＝ 問 DB 攞晒所有相嗰行。⛔ 唔好每分鐘都問 ——
 * 阿耀部機用緊自己數據，而 Drive 遲五分鐘唔會令張相冇咗。
 * ⭐ 但啱啱先上到 R2 嗰陣係例外（`force`）：嗰下即刻補，
 *    因為 Jason 2026-09-05 拍板嘅理由就係「唔可以等有人開返嗰版」。
 */
export const MIRROR_SWEEP_MS = 5 * 60 * 1000

/**
 * `uploading` 拖過幾耐就當佢死咗。
 *
 * ⚠️ 一張相寫住 `uploading`，只有兩個可能：真係上緊，或者上到一半 app 被 kill 咗
 * （阿耀撳咗 home、系統回收咗個 tab、冇電熄機）。⛔ 部機度睇落一模一樣。
 *
 * ⭐ 兩分鐘係按「一張 2800px JPEG 喺地盤 4G 上到 R2」計，⛔ 唔係求其填。
 * 同一部機、同一個 session 度重複上傳由 `claimUpload()` 攔住，所以呢個數
 * 只係用嚟救「上一次開 app 死咗」嗰批。
 */
export const STALE_UPLOADING_MS = 2 * 60 * 1000

/**
 * 一輪最多傳幾多張。
 *
 * ⛔ 唔准一次過發成個工程嘅請求 —— 地盤網絡差，三十張一齊上會一齊死，
 * 而且會霸住條線，令阿耀嗰陣影緊嗰張反而上唔到。
 * ⭐ 傳唔晒唔緊要：下一輪（最多六十秒後）會再嚟。
 */
export const MAX_PER_ROUND = 3

/** 幾耐掃一次。⛔ 唔好調得太密 —— 一分鐘一次夠晒，慳電同慳數據。 */
export const RESUME_INTERVAL_MS = 60 * 1000

/**
 * 呢張相要唔要重傳。
 *
 * - `local`：影咗但未上過（多數係當時冇網）⇒ 要。
 * - `error`：上過但失敗 ⇒ 要。⛔ 唔理佢失敗過幾多次。
 * - `uploaded`：⛔ **唔要。** 已經有雲端副本，再上一次係白費同事嘅數據。
 * - `uploading`：拖夠 `STALE_UPLOADING_MS` 先要 —— 未夠鐘就當佢真係上緊。
 */
export function isResumable(item: PendingPhoto, now: number): boolean {
  if (item.status === 'uploaded') return false
  if (item.status === 'local' || item.status === 'error') return true

  // 淨返 'uploading'。冇開始時間 ＝ 上一次開 app 留低嘅，一定當佢死咗。
  if (!item.uploadingSince) return true
  const started = Date.parse(item.uploadingSince)
  if (Number.isNaN(started)) return true
  return now - started >= STALE_UPLOADING_MS
}

/**
 * 揀出要重傳嘅，排好次序。
 *
 * ⭐ **試得少嘅行先**：一張未試過嘅相好大機會一撳就上到；
 * 一張試極都唔得嘅（多數係個檔本身有事）唔應該霸住每一輪嘅三個位，
 * ⛔ 否則後面嗰啲永遠輪唔到。
 * 打成平手就舊嗰張行先 —— 影得耐嘅風險大啲（同事隨時會清瀏覽器資料）。
 */
export function resumable(items: PendingPhoto[], now: number): PendingPhoto[] {
  return items
    .filter((item) => isResumable(item, now))
    .sort((a, b) => {
      if (a.attempts !== b.attempts) return a.attempts - b.attempts
      return a.capturedAt.localeCompare(b.capturedAt)
    })
}

/**
 * 而家邊幾張喺度上緊。**module-level，成個 app 共用一份。**
 *
 * ⛔⛔ 冇呢個鎖就會撞：阿耀撳「再試一次」嗰下，背景嗰輪啱啱都揀中同一張 ⇒
 *    兩條路一齊行 `uploadPending` ⇒ 兩邊都 `findRow` 見唔到行 ⇒ 兩邊各自派一個 seq ⇒
 *    第二個 insert 撞 `operation_id` 嘅 unique index ⇒ 畫面彈一句英文錯誤，
 *    ⚠️ 而張相其實已經上到。**睇落係壞咗，實情係成功咗** —— 最難查嗰種 bug。
 */
const inFlight = new Set<string>()

/** 霸位。回 `false` ＝ 已經有人喺度上緊呢張，⛔ 唔好再上多次。 */
export function claimUpload(operationId: string): boolean {
  if (inFlight.has(operationId)) return false
  inFlight.add(operationId)
  return true
}

/** 放位。⛔ 一定要喺 `finally` 度叫 —— 漏咗就等於張相永遠鎖死，再冇人傳得到。 */
export function releaseUpload(operationId: string): void {
  inFlight.delete(operationId)
}

/** 而家有冇人上緊呢張。 */
export function isUploadInFlight(operationId: string): boolean {
  return inFlight.has(operationId)
}

/** 撞正背景重傳嗰陣撳「再試一次」。⛔ 唔准靜靜咁乜都唔做。 */
export const BUSY_MESSAGE = '呢張相而家背景度自動上緊，唔使撳。等佢傳完就得。'

export type ResumeDeps = {
  /** 部機所有相。⛔ 唔分工程 —— 見 `photoStore.listAll`。 */
  listAll: () => Promise<PendingPhoto[]>
  /** 寫返落部機。 */
  save: (item: PendingPhoto) => Promise<void>
  /** 真正上傳一張。 */
  upload: (item: PendingPhoto) => Promise<UploadResult>
  /** 而家幾點。測試餵一個固定值入嚟。 */
  now?: () => number
  /** 有冇網。⛔ 冇網就唔試 —— 試極都係白試，仲要每次失敗都加一次 attempts。 */
  online?: () => boolean
}

export type ResumeReport = {
  /** 揀咗幾多張出嚟試。 */
  tried: number
  /** 上到幾多張。 */
  sent: number
  /** 試咗但唔得幾多張。⛔ 唔係放棄，係等下一輪。 */
  failed: number
  /** 有人上緊、今輪讓開咗幾多張。 */
  busy: number
  /** 成輪都冇行嘅原因。 */
  skipped: 'offline' | 'running' | 'list-failed' | null
}

const IDLE: ResumeReport = { tried: 0, sent: 0, failed: 0, busy: 0, skipped: null }

/**
 * 同一時間只可以有一輪。
 *
 * ⚠️ 四個觸發（開 app、`online`、返前景、每分鐘）好容易一齊到：
 * 熄咗飛航模式嗰一刻，`online` 同 `visibilitychange` 通常爭先恐後咁一齊嚟。
 * ⛔ 唔攔住就會三輪疊住行，變咗一次過發九個請求。
 */
let running = false

/**
 * 行一輪。
 *
 * ⛔⛔ **一次一張、順序嚟**，唔用 `Promise.all` —— 見 `MAX_PER_ROUND`。
 * ⛔ 呢個 function **唔會 throw**。佢喺背景度行，冇人接得住，
 *    一 throw 就變成 unhandled rejection，之後幾輪仲會唔會行都講唔埋。
 */
export async function resumeOnce(deps: ResumeDeps): Promise<ResumeReport> {
  const now = deps.now ?? (() => Date.now())
  const online = deps.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  // ⛔ 冇網唔好試。試極都係白試，而且每次失敗都會令 attempts 加一 ——
  // 排序係按 attempts 嚟，白試會令一張相排到後面去，變相罰咗佢。
  if (!online()) return { ...IDLE, skipped: 'offline' }
  if (running) return { ...IDLE, skipped: 'running' }

  running = true
  try {
    let items: PendingPhoto[]
    try {
      items = await deps.listAll()
    } catch (caught) {
      console.error('[quote-app] auto resume: cannot read local photos:', caught)
      return { ...IDLE, skipped: 'list-failed' }
    }

    const batch = resumable(items, now()).slice(0, MAX_PER_ROUND)
    const report: ResumeReport = { ...IDLE, tried: 0 }

    for (const item of batch) {
      if (!claimUpload(item.operationId)) {
        report.busy += 1
        continue
      }
      report.tried += 1
      try {
        await deps.save({
          ...item,
          status: 'uploading',
          error: '',
          uploadingSince: new Date(now()).toISOString(),
        })

        const result = await deps.upload(item)

        if (result.ok) {
          // ⛔ 上到都唔刪部機嗰份（`photoStore.ts` 開頭嗰段）。
          await deps.save({ ...item, status: 'uploaded', error: '', uploadingSince: undefined })
          report.sent += 1
        } else {
          await deps.save({
            ...item,
            status: 'error',
            error: result.message,
            attempts: item.attempts + 1,
            uploadingSince: undefined,
          })
          report.failed += 1
        }
      } catch (caught) {
        // ⛔ 連寫部機都出事都唔准 throw 上去。留低狀態，下一輪再嚟。
        console.error('[quote-app] auto resume failed:', item.operationId, caught)
        report.failed += 1
      } finally {
        releaseUpload(item.operationId)
      }
    }

    return report
  } finally {
    running = false
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * 補 Drive 嗰份
 *
 * ⭐ Jason 2026-09-05 拍板（揀甲）：背景自動上到 R2 之後，**要順手補埋 Drive**。
 *    佢原話嘅理由 ——「有人會開返嗰版」呢個假設，同「有人會記得撳再試一次」
 *    係同一種假設，而今日已經證明咗嗰種假設唔成立。
 *
 * ⛔⛔ 呢度**唔准另開一套規矩**，一律行返 `PhotoSlot` 嗰套（`P3b-計劃書.md` §7.5）：
 *      · `pickMirrorBatch()` 揀邊幾張（已入 R2、Drive 未做、舊嘅行先）
 *      · `MAX_DRIVE_ATTEMPTS` —— 連續失敗三次就唔再自動試，等人手撳
 *      · **一次開 app 一張相試一次** —— 見 `triedMirror`
 *    ⚠️ 背景嗰條路**唔可以**因為「係自動嘅」就繞過呢啲限制去燒 Google 配額。
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * 今次開 app 已經試過補鏡像嘅相。**module-level，成個 app 一份。**
 *
 * ⚠️ `PhotoSlot` 嗰個 `triedRef` 係逐格相各自一份，一換版就冇咗；
 * 背景呢條路一直行落去，所以要一份跟住成個 app 嘅。
 *
 * ⛔ 冇呢個就會變連環重試：補完 → 下一輪又見到佢（DB 未寫得切）→ 再補一次，
 *    一次開 app 就燒晒三次配額 —— 正正係 §7.5 想避免嗰件事。
 */
const triedMirror = new Set<string>()

export type MirrorOutcome = { ok: true; alreadyDone?: boolean } | { ok: false; message: string }

export type MirrorDeps = {
  /** DB 嗰邊所有相嘅行。⛔ 要 DB 嗰份，唔係部機嗰份 —— 第二部機影嘅相一樣要補。 */
  listRows: () => Promise<QuotePhoto[]>
  /** 部機嗰份。淨係用嚟讀「Drive 試咗幾多次」同寫返結果（DB 冇呢個欄）。 */
  listAll: () => Promise<PendingPhoto[]>
  save: (item: PendingPhoto) => Promise<void>
  /** 叫 Worker 抄一份上 Drive。 */
  mirror: (photoId: string) => Promise<MirrorOutcome>
  now?: () => number
  online?: () => boolean
}

export type MirrorReport = {
  tried: number
  done: number
  failed: number
  skipped: 'offline' | 'running' | 'too-soon' | 'list-failed' | null
}

const MIRROR_IDLE: MirrorReport = { tried: 0, done: 0, failed: 0, skipped: null }

let mirrorRunning = false
let lastSweepAt = 0

/**
 * 掃一次，補返未上 Drive 嗰啲。
 *
 * `force` ＝ 啱啱先有相上到 R2，即刻補，⛔ 唔受五分鐘限制。
 * ⛔ 同 `resumeOnce` 一樣：**一次一張、順序嚟、唔會 throw**。
 */
export async function mirrorOnce(
  deps: MirrorDeps,
  options: { force?: boolean } = {},
): Promise<MirrorReport> {
  const now = deps.now ?? (() => Date.now())
  const online = deps.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  if (!online()) return { ...MIRROR_IDLE, skipped: 'offline' }
  if (mirrorRunning) return { ...MIRROR_IDLE, skipped: 'running' }

  const at = now()
  if (!options.force && at - lastSweepAt < MIRROR_SWEEP_MS) {
    return { ...MIRROR_IDLE, skipped: 'too-soon' }
  }

  mirrorRunning = true
  lastSweepAt = at
  try {
    let rows: QuotePhoto[]
    let locals: PendingPhoto[]
    try {
      rows = await deps.listRows()
      locals = await deps.listAll()
    } catch (caught) {
      console.error('[quote-app] auto mirror: cannot read photo list:', caught)
      return { ...MIRROR_IDLE, skipped: 'list-failed' }
    }

    // 「試咗幾多次」淨係部機記住（DB 冇呢個欄）。第二部機影嘅相冇本機紀錄，當 0 ——
    // ⛔ 同 `PhotoSlot` 嗰個 `attemptsOf` 一模一樣，唔准另計一套。
    const byOperation = new Map(locals.map((item) => [item.operationId, item]))
    const attemptsOf = (photoId: string) => {
      const row = rows.find((one) => one.id === photoId)
      return (row ? byOperation.get(row.operation_id)?.driveAttempts : 0) ?? 0
    }

    const batch = pickMirrorBatch(rows, attemptsOf).filter((row) => !triedMirror.has(row.id))
    const report: MirrorReport = { ...MIRROR_IDLE }

    for (const row of batch) {
      triedMirror.add(row.id)
      report.tried += 1
      try {
        const result = await deps.mirror(row.id)
        const before = byOperation.get(row.operation_id)
        if (before) {
          await deps.save({
            ...before,
            driveAttempts: result.ok ? 0 : (before.driveAttempts ?? 0) + 1,
            driveError: result.ok ? '' : result.message,
          })
        }
        if (result.ok) report.done += 1
        else report.failed += 1
      } catch (caught) {
        console.error('[quote-app] auto mirror failed:', row.id, caught)
        report.failed += 1
      }
    }

    return report
  } finally {
    mirrorRunning = false
  }
}

/** 而家 `MAX_DRIVE_ATTEMPTS` 係幾多 —— 出返俾人查，⛔ 唔准喺呢個檔另外定一個數。 */
export const DRIVE_ATTEMPT_LIMIT = MAX_DRIVE_ATTEMPTS
