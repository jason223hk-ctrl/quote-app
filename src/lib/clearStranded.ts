import { strandedPending } from './orphanPhotos'
import type { QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'

/**
 * 清掉「傳唔到、而且母單已經刪咗」嗰啲相。
 *
 * ⭐⭐ **點解要獨立一個 function，⛔ 唔喺畫面度寫**：
 *
 * 因為呢件事**唔准用畫面上面嗰個數去做**。畫面個 N 係上一次 render
 * 嗰陣計出嚟嘅；由嗰刻到人撳落「再撳一次確認」為止，中間可能過咗幾秒 ——
 * ⚠️ 而背景重傳**每分鐘都喺度行**，隨時會有一張啱啱上到、啱啱寫咗 DB 行。
 *
 * ⛔⛔ 用舊個 list 去刪，就會刪走一張**已經有雲端副本**嘅相嘅部機副本，
 *    或者更差 —— 一張**啱啱先傳成功**嘅相。
 *
 * ⭐ 所以呢度**撳落去嗰一刻先由頭讀一次、由頭計一次**，
 *    ⛔ 只刪嗰一刻仍然符合三個條件嗰批。
 *
 * ⛔ 全 app 唯一一個真刪。⚠️ 錯咗冇得返轉頭，所以下面每一條保險都唔准慳。
 */
export type ClearStrandedDeps = {
  /** 部機嗰批。 */
  listLocal: () => Promise<PendingPhoto[]>
  /** 雲端嗰批。⛔ 攞唔到就一張都唔清（見下面）。 */
  listRows: () => Promise<QuotePhoto[]>
  /**
   * 而家仲攞得返嘅工程 id。
   * ⛔⛔ `null` ＝ 唔知 ⇒ **一張都唔清**（`strandedPending` 自己會擋，
   *    ⚠️ 但呢度都寫明，因為呢條係整件事最危險嗰個位）。
   */
  live: Set<string> | null
  /** 真刪。⛔ 只會收到下面計出嚟嗰批編號。 */
  remove: (operationIds: string[]) => Promise<number>
}

export type ClearStrandedResult = {
  /** 真係清咗幾多張。 */
  removed: number
  /**
   * 冇清成，點解。⛔ `null` ＝ 冇問題。
   * ⚠️ 中文，而且要講得出下一步 —— 現場同事睇唔明英文（CLAUDE.md §2.7）。
   */
  blocked: string | null
}

/**
 * 撳落去嗰一刻先計、先刪。
 *
 * ⛔ 唔會 throw：兩段式確認撳落去之後冇人接得住一個 exception，
 *    ⚠️ 而一個掟出嚟嘅英文 error 對阿耀嚟講等於個 app 死咗機。
 */
export async function clearStranded(deps: ClearStrandedDeps): Promise<ClearStrandedResult> {
  if (!deps.live) {
    // ⛔⛔ 工程清單未載完／攞唔到。⚠️ 嗰陣每一單睇落都「已經刪咗」。
    return {
      removed: 0,
      blocked: '而家攞唔到工程清單，唔肯定邊啲工程仲喺度，所以乜都冇清。請check返個網絡再試。',
    }
  }

  let local: PendingPhoto[]
  try {
    local = await deps.listLocal()
  } catch (caught) {
    console.error('[quote-app] clear stranded: cannot read local photos:', caught)
    return { removed: 0, blocked: '讀唔到部機嗰批相，所以乜都冇清。請截圖，用 WhatsApp 搵 Jason。' }
  }

  let rows: QuotePhoto[]
  try {
    rows = await deps.listRows()
  } catch (caught) {
    // ⛔⛔ 呢個係**保守方向**：問唔到雲端，就唔敢講「雲端冇呢張」。
    //    ⚠️ 寧願一張都唔清，都唔可以清走一張其實喺雲端有副本、
    //    但我哋今次問唔到嘅相 —— 因為反過嚟嗰個錯係冇得返轉頭嘅。
    console.error('[quote-app] clear stranded: cannot read cloud rows:', caught)
    return {
      removed: 0,
      blocked: '而家問唔到雲端有冇呢啲相，唔肯定得唔得清，所以乜都冇清。請check返個網絡再試。',
    }
  }

  const targets = strandedPending(local, rows, deps.live)
  if (targets.length === 0) {
    // ⭐ 由 render 到撳落去之間全部傳晒 —— ⚠️ 呢個係好事，⛔ 唔係錯誤。
    return { removed: 0, blocked: null }
  }

  try {
    const removed = await deps.remove(targets.map((item) => item.operationId))
    return { removed, blocked: null }
  } catch (caught) {
    console.error('[quote-app] clear stranded: remove failed:', caught)
    return { removed: 0, blocked: '清唔到，部機嘅儲存空間出錯。請截圖，用 WhatsApp 搵 Jason。' }
  }
}
