import type { PendingPhoto } from './photoUpload'

/**
 * P8 步 4：**刪咗一單之後，跟住嗰幾步**。純邏輯，⛔ 冇 fetch、⛔ 唔掂 React。
 *
 * ⛔⛔ **次序係定死嘅，⛔ 唔准調轉：**
 *
 *   ⓪ `records.softDelete()` —— ⚠️ **⛔ 唔喺呢個檔**，喺叫嗰邊（`HomePage`）。
 *      ⭐ 佢先至係「刪除」本身，而且 Worker 條 `/purge` **閘一**就係要佢寫低咗
 *        `deleted_at` 先肯做嘢（`worker/src/worker.mjs` `purgeRecord()`）。
 *   ① `/purge` —— 清走雲端嗰兩份（R2 刪 bytes、Drive 掉垃圾桶）。
 *   ② **最尾**先刪部機 IndexedDB 嗰份。
 *
 * ⭐⭐ **點解部機嗰份要擺最尾 —— ⛔ 唔准淨係記住結論**
 *
 * ⚠️ 未傳上雲端嗰啲相，**部機呢一份就係全世界唯一一份**
 *    （`src/lib/purgeCounts.ts` `onlyOnPhoneCount()` 講緊嘅就係佢哋）。
 * ⇒ 調轉次序（部機行先）嘅話，`/purge` 一撲街就變成：
 *      **唯一嗰份冇咗，而雲端嗰份一個 byte 都冇清走。**
 *    ⛔ 兩邊都輸，而且救唔返。
 * ⭐ 呢個同 Worker 入面「④ stamp 一定要喺 ②③ 之後」係**同一個道理**：
 *    ⛔ 唔准出現「帳面清咗、實物留住」，亦⛔ 唔准出現「實物冇咗、帳面冇清」。
 *
 * ⛔⛔ **而且：雲端冇清得晒，就⛔ 一張部機嘅相都唔准刪**（見 `mayClearLocal()`）。
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ 今日呢條路**行都唔行** —— 而佢⛔ 唔係「未寫好」，係**特登閂住**
 *
 * `PHOTOS_REALLY_PURGED`（`src/lib/deleteDialog.ts`）今日仲係 `false`，
 * 而彈窗照嗰個 boolean 出緊「刪除只是收起⋯後台**仍可取回**」。
 *
 * ⭐ 所以**同一個 boolean 一定要同時話事「講乜」同埋「做乜」** ——
 *   ⛔ 唔可以一個掣管文案、另一個掣管動作：
 *
 *     · 文案講「可取回」而實際清咗 ⇒ ⛔⛔ **最衰嗰個方向**，人以為攞得返，
 *       實情 bytes 已經冇咗。
 *     · 文案講「永久刪除」而實際冇清 ⇒ 一句假嘅嚇人說話（`deleteDialog.ts` 檔頭
 *       已經講過點解⛔ 唔准）。
 *
 * ⇒ 所以 `purgeAfterDelete()` 收 `reallyPurged` 做**參數**（⛔ 唔係喺入面讀
 *   個常數）：**兩條路都測得到**，⛔ 唔使等到 flip 嗰日先第一次行。
 *
 * ⚠️⚠️ **要講白嘅代價**：gate 住即係話呢段 code **喺 flip 嗰日先第一次真行**。
 *   ⭐ 已經有一條規矩接住：**第一次真清，一定要清一單假工程**
 *     （`docs/P8-真清相-計劃書.md`，⛔ 永久例外）。
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * ⭐⭐ **清相嘅結果有冇一個位顯示俾人睇（P8 步 5：設定頁嗰行 ＋「繼續清」掣）。**
 *
 * ⛔⛔ **呢個⛔ 唔係一粒無謂嘅掣，佢係一條排序規矩：**
 *    **`PURGE_OUTCOME_SHOWN` 要喺 `PHOTOS_REALLY_PURGED` 之前變 `true`。**
 *
 * ⚠️ 點解要有佢：`/purge` 一次最多清 `PURGE_BATCH_MAX`（今日 10）張，
 *    清一半、或者俾 RLS 拒一部分，**都係一個完全正常嘅回覆**。
 *    ⇒ 如果冇一個位講返「仲有 N 張未清」，**剩低嗰啲 bytes 會永遠留喺雲端**，
 *      而⛔ 冇人會知 —— 單工程喺畫面上面已經冇咗。
 *
 * ⛔ 「記住到時要做步 5」呢種話**⛔ 唔係一個修法**（`docs/開發紀錄.md` 附錄 B
 *    D10 第三條）。⇒ 所以呢度唔係寫一句註解提人，係**擺一條會紅嘅尺**：
 *    `src/lib/purgeAfterDelete.test.ts` 入面嗰條測試，喺
 *    `PHOTOS_REALLY_PURGED` 變 `true` 而呢個仲係 `false` 嗰一刻**就會紅**。
 */
export const PURGE_OUTCOME_SHOWN = false

/**
 * Worker 條 `/purge` 回嘅嘢，**normalise 完**嗰個樣。
 *
 * ⭐ 連「根本打唔到 Worker」「Worker 未 deploy 呢條路」嗰幾種都**砌成同一個樣**
 *   （`ok: false` ＋ 一句中文），⛔ 唔係另開一個 type ——
 *   ⚠️ 落到呢度要答嘅只有一條：**雲端清得晒未**。
 *   ⛔ 但「點解清唔到」嗰句字**⛔ 唔准合埋**（CLAUDE.md §2.6）——
 *     所以 `message` 係由 `photoTransport.ts` 逐種情況分開砌好先交過嚟。
 */
export type PurgeReply = {
  /** ⛔ `true` ＝ **今次全部搞掂**（冇一張失敗、亦冇撞上限）。 */
  ok: boolean
  /** 今次真係打咗剔嘅張數。 */
  purged: number
  /** 之前已經清走咗嘅。 */
  alreadyDone: number
  /** 雲端本來就冇 bytes 嘅（只剩部機一份嗰啲）。 */
  nothingToClear: number
  /** 今次冇掃到、仲留喺雲端嘅張數（撞上限）。 */
  remaining: number
  /** 撞咗一次最多清幾多張嗰個上限。 */
  hitLimit: boolean
  /** 逐張講點解清唔到。⛔ 中文。 */
  failed: { photoId: string; why: string }[]
  /** 出得街嗰句。⛔ 中文，由 Worker 個 `purgeSummary()` 或者 transport 砌。 */
  message: string
}

/**
 * 今次清相去到邊。**四種，⛔ 唔准合埋。**
 *
 * ⚠️ `partial` 同 `refused` 喺「刪唔刪得部機」上面**行為一樣**（兩樣都唔刪），
 *    ⛔ 但佢哋⛔ 唔係同一件事：
 *      · `partial` ＝ **有 bytes 已經冇咗**，仲有手尾要跟（撳「繼續清」）。
 *      · `refused` ＝ **一個 byte 都冇掂過**，要搵人（權限）或者補嘢（未安裝）。
 *    ⭐ 兩句嘢要講唔同嘅下一步（CLAUDE.md §2.7）⇒ 所以分開兩個名。
 */
export type PurgeOutcomeKind = 'skipped' | 'cleared' | 'partial' | 'refused'

export function purgeOutcomeKind(reply: PurgeReply): Exclude<PurgeOutcomeKind, 'skipped'> {
  if (reply.ok) return 'cleared'
  // ⭐ 撞上限都算「動過手」—— ⚠️ 清咗嘅嗰幾張已經救唔返。
  if (reply.purged > 0 || reply.hitLimit) return 'partial'
  return 'refused'
}

/**
 * 部機嗰份刪唔刪得。**⛔ 只有 `cleared` 一種可以。**
 *
 * ⛔⛔ **`skipped` ⛔ 唔准刪** —— ⚠️ 今日（gate 住）刪一單工程**本來就唔會**
 *    動部機嗰批相：佢哋會變成「孤兒相」，由設定頁嗰粒「清走傳唔到嘅相」
 *    照原本嗰條路處理（`src/lib/clearStranded.ts`）。
 *    ⭐ 步 4 ⛔ 唔准趁機改咗今日嘅行為。
 *
 * ⛔⛔ **`partial` / `refused` 亦⛔ 唔准刪。**
 *    ⚠️ 雲端仲有嘢未清 ⇒ 之後要撳「繼續清」。而部機嗰份係**唯一一份**嘅相，
 *    喺「成件事未做完」嘅時候刪咗，就係**主動減少剩低嘅副本數目**。
 *    ⭐ 保守方向同 `clearStranded()` 一樣：**唔肯定就唔刪**。
 */
export function mayClearLocal(kind: PurgeOutcomeKind): boolean {
  return kind === 'cleared'
}

export type PurgeOutcome = {
  kind: PurgeOutcomeKind
  /** 出得街嗰句。⛔ `null` ＝ 冇嘢要同人講（`skipped`）。 */
  message: string | null
  /**
   * 部機真係刪咗幾多張。
   * ⛔⛔ `null` ＝ **冇刪過**（⛔ 唔係「刪咗 0 張」）——
   *    ⚠️ 兩者喺畫面上面要分得開：一個係「冇嘢好刪」，一個係「唔准刪／刪唔到」。
   */
  localRemoved: number | null
  /** 部機嗰步撲咗街嗰句。⛔ `null` ＝ 冇事。 */
  localProblem: string | null
}

export type PurgeAfterDeleteDeps = {
  /**
   * ⛔ 就係 `PHOTOS_REALLY_PURGED`（`src/lib/deleteDialog.ts`）。
   * ⛔ 出咗做參數係為咗**兩條路都測得到** —— 見檔頭。
   */
  reallyPurged: boolean
  recordId: string
  /** 叫 Worker 條 `/purge`。⛔ 唔准 throw —— 失敗都要砌成一個 `ok: false` 交返。 */
  purge: (recordId: string) => Promise<PurgeReply>
  /** 部機嗰批。⛔ 失敗要 throw。 */
  listLocal: (recordId: string) => Promise<PendingPhoto[]>
  /** 真刪部機嗰批。⛔ 失敗要 throw。 */
  removeLocal: (operationIds: string[]) => Promise<number>
}

/** 部機讀唔到／刪唔到嗰兩句。⛔ 中文 ＋ 講得出下一步（CLAUDE.md §2.7）。 */
export const LOCAL_READ_FAILED =
  '雲端相片已經清走，但無法讀取本裝置的相片，所以本裝置這一份沒有清除。請到設定頁再清一次；如果一直這樣，請截圖，並用 WhatsApp 聯絡 Jason。'
export const LOCAL_REMOVE_FAILED =
  '雲端相片已經清走，但清除本裝置這一份時出錯。請到設定頁再清一次；如果一直這樣，請截圖，並用 WhatsApp 聯絡 Jason。'

/**
 * 跑 ① ②。
 *
 * ⛔⛔ **唔會 throw。** ⚠️ ⓪ `softDelete()` 已經成功咗 —— 單嘢係真係刪咗。
 *    喺呢度掟個錯出去，叫嗰邊（彈窗）就會**當成「刪唔到」**：彈窗唔閂、
 *    清單唔 reload、人再撳多次。⭐ 「清相唔順利」同「刪唔到單」係兩件事，
 *    ⛔ 唔准撈埋。
 */
export async function purgeAfterDelete(deps: PurgeAfterDeleteDeps): Promise<PurgeOutcome> {
  if (!deps.reallyPurged) {
    // ⛔ 連個 fetch 都唔行 —— 見檔頭：今日係特登閂住，⛔ 唔係「行完當冇事」。
    return { kind: 'skipped', message: null, localRemoved: null, localProblem: null }
  }

  const reply = await deps.purge(deps.recordId)
  const kind = purgeOutcomeKind(reply)

  if (!mayClearLocal(kind)) {
    return { kind, message: reply.message, localRemoved: null, localProblem: null }
  }

  /**
   * ⛔⛔ **撳落去嗰一刻先由頭讀一次**，⛔ 唔准用彈窗數嗰陣攞嗰份清單。
   *    ⚠️ 由彈窗一開到而家，背景重傳行過幾轉，隨時多咗／少咗幾張。
   *    ⭐ 同一條規矩喺 `src/lib/clearStranded.ts` 檔頭寫得最白。
   */
  let local: PendingPhoto[]
  try {
    local = await deps.listLocal(deps.recordId)
  } catch (caught) {
    console.error('[quote-app] purge after delete: cannot read local photos:', caught)
    return { kind, message: reply.message, localRemoved: null, localProblem: LOCAL_READ_FAILED }
  }

  const ids = local.filter((item) => item.recordId === deps.recordId).map((item) => item.operationId)
  try {
    const removed = await deps.removeLocal(ids)
    return { kind, message: reply.message, localRemoved: removed, localProblem: null }
  } catch (caught) {
    console.error('[quote-app] purge after delete: cannot remove local photos:', caught)
    return { kind, message: reply.message, localRemoved: null, localProblem: LOCAL_REMOVE_FAILED }
  }
}
