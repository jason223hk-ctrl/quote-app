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
