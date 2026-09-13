import { isUploadInFlight } from './autoResume'
import type { QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'

/**
 * 相片版嘅「攞返最新狀態」。**純邏輯，⛔ 唔掂 IndexedDB、唔掂 React。**
 *
 * ⭐ `PhotoSlot` 個 `reload()` 同「向下拉刷新」行**同一個 function** ——
 *    ⛔ 唔係兩套。咁樣下面四條保證先至係真嘅，⚠️ 唔係寫喺註解度嘅願望。
 *
 * ⛔⛔ **Jason 2026-09-14 講明，下拉刷新絕對唔准做嘅四樣**：
 *
 *   1. ⛔ 取消上載中嗰張
 *   2. ⛔ 令佢重頭再傳
 *   3. ⛔ 令佢喺畫面消失
 *   4. ⛔ 令佢傳兩次
 *
 * ⭐⭐ **點解呢個 function 做唔到嗰四樣**（⛔ 唔係靠自律，係做唔到）：
 *
 *   · 佢**只有兩個 dep，兩個都係「攞」**（`listLocal`、`listRows`）——
 *     ⛔ 冇 `save`、⛔ 冇 `upload`、⛔ 冇 `abort`。
 *     即係**冇任何一句可以寫嘢或者叫停一個上載**。（第 1、2 條）
 *   · 佢回嘅係部機**原封不動**嗰批 —— 上載中嗰張照樣喺入面。（第 3 條）
 *   · 傳兩次由 `claimUpload()` 個鎖擋住，而呢度**完全冇掂個鎖**。（第 4 條）
 *
 * ⚠️ 呢四句唔係空話：`photoRefresh.test.ts` 逐條釘住。
 */
export type PhotoRefreshDeps = {
  /** 部機嗰份（呢一單）。 */
  listLocal: () => Promise<PendingPhoto[]>
  /** 雲端嗰份（呢一單）。 */
  listRows: () => Promise<QuotePhoto[]>
}

export type PhotoRefreshResult = {
  local: PendingPhoto[]
  /**
   * 雲端嗰批。**⛔ 攞唔到就係 `null`**，⛔ 唔係一個空 array ——
   * ⚠️ 空 array 讀落係「呢單一張相都冇上過」，同「而家問唔到」係兩件事。
   */
  rows: QuotePhoto[] | null
  /** 攞唔到雲端嗰份。⭐ 畫面要出一句話俾人知睇緊嘅係部機嗰份。 */
  stale: boolean
}

/**
 * 攞返最新狀態。
 *
 * ⛔⛔ **部機嗰份要行先、要出到**（2026-09-05 真機中過嗰個 bug）：
 *    本來兩樣一齊 `Promise.all`，雲端一失敗連部機嗰份都唔會出，
 *    ⚠️ 飛航模式下就會「張相真係存咗，但畫面永遠見唔到」。
 *
 * ⛔ 呢個 function **唔會 throw**：部機都讀唔到就回一個空清單 ＋ `stale`，
 *    ⚠️ 下拉刷新係背景做嘢，一 throw 就冇人接得住。
 */
export async function refreshPhotos(deps: PhotoRefreshDeps): Promise<PhotoRefreshResult> {
  let local: PendingPhoto[] = []
  let localFailed = false
  try {
    local = await deps.listLocal()
  } catch (caught) {
    console.error('[quote-app] photo refresh: cannot read local photos:', caught)
    localFailed = true
  }

  try {
    return { local, rows: await deps.listRows(), stale: localFailed }
  } catch {
    // ⛔ 唔准清空 —— 上一次攞到嗰批仍然係啱嘅，清咗反而少咗嘢睇。
    //    ⭐ 回 `null` ＝「今次問唔到」，由畫面決定留返舊嗰批。
    return { local, rows: null, stale: true }
  }
}

/**
 * 呢張相而家係咪有人上緊。
 *
 * ⭐ 出喺呢度純粹係方便畫面／測試讀 —— ⛔ 佢**冇**改變任何嘢，
 *    亦⛔ 唔會影響 `refreshPhotos` 做乜。
 */
export function uploadingNow(operationId: string): boolean {
  return isUploadInFlight(operationId)
}
