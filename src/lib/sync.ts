import { MITIGATION_OPTIONS } from './options'
import type { QuotePhoto } from './photos'

/**
 * 同步頁嘅純邏輯。**唔掂 DB、唔掂 React** —— 咁先測得到。
 *
 * 規格：`docs/P3f-全app版面-實作計劃.md` §3.10。
 *
 * ⭐⭐ 一條規矩管住成個檔：**「未上到」同「上唔到」係兩件事**。
 *    待同步 ＝ 系統仲會自己搞掂，人唔使做嘢。
 *    同步失敗 ＝ 要人睇。
 *    ⛔ 兩者溝埋一齊嘅話，同事日日見到一個橙色數字，好快就當佢唔存在。
 */

export type PhotoSyncState = 'synced' | 'pending' | 'failed'

/**
 * 一張相而家係咩狀態。**只睇 DB**，⛔ 唔睇本機記住嘅重試次數 ——
 * 因為呢一版係「成間公司」嘅總覽，第二部機影嘅相一樣要數得到。
 *
 * ⚠️ 次序好緊要：**先睇成功**。一張相可以之前失敗過（`drive_error` 有字），
 * 之後重試成功（`drive_synced_at` 有值）——⛔ 嗰陣唔可以當佢仲係失敗。
 */
export function photoSyncState(row: QuotePhoto): PhotoSyncState {
  if (row.drive_synced_at !== null) return 'synced'
  if (row.drive_error.trim() !== '' || row.r2_error.trim() !== '') return 'failed'
  return 'pending'
}

export type SyncCounts = { synced: number; pending: number; failed: number }

export function syncCounts(rows: QuotePhoto[]): SyncCounts {
  const counts: SyncCounts = { synced: 0, pending: 0, failed: 0 }
  for (const row of rows) {
    if (row.deleted_at !== null) continue
    counts[photoSyncState(row)] += 1
  }
  return counts
}

/** 全部相都掂 ＝ 冇待同步、冇失敗。⛔ 一張相都冇都算掂。 */
export function allDone(counts: SyncCounts): boolean {
  return counts.pending === 0 && counts.failed === 0
}

export type RecordSync = {
  recordId: string
  counts: SyncCounts
}

/** 逐個工程一行。⛔ 一張相都冇嘅工程唔出 —— 冇嘢好同步。 */
export function byRecord(rows: QuotePhoto[]): RecordSync[] {
  const map = new Map<string, QuotePhoto[]>()
  for (const row of rows) {
    if (row.deleted_at !== null) continue
    const list = map.get(row.record_id)
    if (list) list.push(row)
    else map.set(row.record_id, [row])
  }
  return [...map.entries()].map(([recordId, list]) => ({
    recordId,
    counts: syncCounts(list),
  }))
}

/**
 * 最後一次成功同步係幾時。⛔ 冇成功過就回 null（唔可以出「1970」）。
 */
export function lastSyncedAt(rows: QuotePhoto[]): string | null {
  let latest: string | null = null
  for (const row of rows) {
    const at = row.drive_synced_at
    if (at === null) continue
    if (latest === null || at > latest) latest = at
  }
  return latest
}

/**
 * 一張相喺失敗清單度點寫個位置。
 *
 * ⛔ 環境相唔屬於任何一棵樹，所以⛔ 唔可以出一個空白樹牌。
 */
/**
 * ⚠️ 收窄咗個參數型別（2026-09-14）：本來要一個完整 `QuotePhoto`，但佢淨係讀
 * `tree_id` 同 `mitigation` 兩個欄。⭐ 放寬咗之後，**部機嗰啲仲未入到 DB 嘅相**
 * 都用得返同一句 —— ⛔ 唔使另外抄一份出嚟（抄兩份 ⇒ 兩邊講法遲早唔同）。
 */
export function photoWhere(
  row: { tree_id: string | null; mitigation: string | null },
  treeNo: string | null,
): string {
  if (row.tree_id === null) return '環境相'
  const tag = treeNo === null || treeNo.trim() === '' ? '（未填樹牌）' : treeNo
  if (row.mitigation === null) return `${tag}・全景相`
  // ⛔ 唔可以出 `removal` 呢啲代號 —— 前線同事讀唔明，佢會當個 app 壞咗。
  const label = MITIGATION_OPTIONS.find((option) => option.value === row.mitigation)?.label
  return `${tag}・${label ?? row.mitigation}`
}

/**
 * 失敗清單第二行：**你使唔使做嘢**。
 *
 * ⭐⭐ 呢個係成個檔最重要嗰一句 —— tree app 用血換返嚟嘅教訓
 * （`src/domain/photoHealth.ts` 開頭）：淨係列一句錯誤原文，
 * 同事唔會覺得「有一張相有事」，佢會覺得「個系統壞咗」，然後唔再信個 app。
 *
 * ⚠️ 判斷只可以睇**我哋自己寫入去嗰啲**錯誤 —— 嗰四句係 worker 明文寫嘅
 * （`worker/src/worker.mjs`：砌唔到檔名、撞檔名、對唔到大細）。
 * 其餘全部係 exception 原文，格式冇保證。
 *
 * ⛔⛔ 分唔到類就一律當「要人睇」。⛔ 唔准出「無需處理」——
 *    一句「唔使理」係一個**指示**：佢叫一個本來應該出聲嘅人唔好出聲。
 */
export type SyncAdvice = { text: string; permanent: boolean }

/**
 * Drive 條授權死咗（過期或者俾人收返）。
 *
 * ⚠️ 靠字串認，⛔ 唔靠估 —— Google 唔會俾一個乾淨嘅 error code 你。
 *    每個字串都係真係見過或者 Google 明文寫住嘅：
 *      · `Token has been expired or revoked.` —— 2026-09-06 真機見過
 *      · `invalid_grant`                      —— Google 對同一件事嘅 error code
 *      · `unauthorized_client`                —— 條 client 俾人 revoke 咗
 *
 * ⛔ 認唔出就唔好硬砌 —— 落唔到類寧願講「認唔出」，
 *    ⚠️ 亂認一個唔啱嘅類，會叫人去做一件搞唔掂件事嘅嘢。
 */
export function isDriveAuthExpired(message: string): boolean {
  return /token has been expired or revoked|invalid_grant|unauthorized_client/i.test(message)
}

/**
 * ⛔⛔ 呢句嘢入面有兩樣缺一不可：
 *
 * 1. **講明相冇事。** 阿耀見到「失敗」第一個反應係「我張相冇咗」——
 *    ⭐ 實情係相已經入咗 R2，Drive 只係第二份副本。
 *    ⛔ 唔講嘅話，佢會走去重影一次，而重影嗰下先係真係整亂啲嘢。
 * 2. **講明要人做嘢，⛔ 唔係等系統。** 條 refresh token 死咗，
 *    ⛔ 重試一萬次都係同一個答案。
 */
export const DRIVE_AUTH_EXPIRED_MESSAGE =
  '需要處理：Drive 授權已過期，需要重新登入才能複製上 Drive。' +
  '相片已經安全存入雲端（R2），不會丟失。請截圖，並用 WhatsApp 聯絡 Jason。'

/** 登入唔到但唔係過期（多數係 `invalid_client`）——⛔ 修法唔同，所以句嘢都唔同。 */
export const DRIVE_LOGIN_FAILED_MESSAGE =
  '需要處理：Drive 無法登入，這是設定方面的問題，不是你操作錯誤。' +
  '相片已經安全存入雲端（R2），不會丟失。請截圖，並用 WhatsApp 聯絡 Jason。'

/**
 * ⛔ Google 自己個 reason code —— **會自己好返嗰啲**。
 *
 * ⚠️ 呢個 list 一定要同 `worker/src/driveError.mjs` 個 `reasonInChinese()`
 *    「等陣會自己好返」嗰組**對得住**。⛔ 唔准兩邊各寫各。
 * ⭐ `src/lib/syncWorkerContract.test.ts` 有一把尺睇住兩邊 ——
 *    佢**直接叫真嘅 worker function**，⛔ 唔係抄一句假嘅訊息落嚟。
 */
export const TRANSIENT_DRIVE_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded']

/**
 * 呢句錯係唔係 worker 個 `driveFailure()` 砌出嚟嘅？
 *
 * ⛔ 認嘅係 `HTTP <三位數>` —— ASCII，⛔ 唔係中文。
 * ⭐ 點解夠：`driveFailure()` **每一句**都由 `${where} 失敗（HTTP ${status}` 開頭。
 *    ⚠️ 而「失敗」兩個字**改得**，`HTTP 429` 呢個形狀⛔ 改唔到（佢係 HTTP 本身）。
 */
export function isWorkerDriveFailure(message: string): boolean {
  return /HTTP \d{3}/.test(message)
}

export function syncAdvice(row: QuotePhoto): SyncAdvice {
  const message = row.drive_error.trim() !== '' ? row.drive_error : row.r2_error

  /*
   * ⛔⛔⛔ **呢度⛔ 唔准用中文字串做暗號。**
   *
   * ⚠️⚠️ 2026-09-19 真係中過，而且中咗之後上咗線：
   *   舊寫法係 `if (message.includes('搵 Jason'))`，
   *   而註解寫住「worker 四句都以『請截圖搵 Jason。』收尾」。
   *   ⇒ #56 把 worker 四句改成「請截圖並聯絡 Jason」、Jason deploy 咗
   *     （Version 81c304b3）⇒ **呢條分支一條新 error 都中唔到**。
   *
   * ⭐ 後果⛔ 唔係「少咗一句」：佢會跌落下面 `/50\d/` 條，
   *   於是一個「Drive HTTP 500 ＋ 未見過嘅 reason」由「要人處理」
   *   變成「**無需處理，系統會自動再試**」。⛔ 而系統⛔ 唔會好返。
   *
   * ⭐⭐ `records.ts` 自己個註解早就警告過同一件事：
   *   「⛔ 唔准用個訊息字串嚟認佢 —— 一改文案就靜靜咁失靈，
   *     而失靈嗰陣冇人見到。」**呢次就係佢本人。**
   *
   * ── 而家改用乜 ────────────────────────────────
   *
   * ⭐ 用 **Google 自己個 reason code**（`dailyLimitExceeded` 嗰啲）——
   *   佢係 API token，⛔ 唔係我哋寫嘅文案，⛔ 改書面語⛔ 唔會郁到佢。
   *
   * ⛔ **預設係「要人處理」** —— 同舊行為一樣：
   *   worker 解釋唔到（未見過嘅 reason／Google 冇講原因）就當永久性。
   *   ⚠️ 呢個⛔ 唔係保守多餘：講錯「唔使理」嘅代價係**冇人再睇**，
   *     講錯「要處理」嘅代價淨係麻煩一次。
   */
  // ⭐⭐ Drive 授權過咗期／俾人收返。**一定要行喺下面 403／401 嗰條之前** ——
  //    Google 呢個錯有陣時帶住 401，撞落嗰條就會出「額滿或者冇權限」，
  //    ⛔ 而嗰句叫唔到人去做啱嗰件事（重新授權）。
  //
  // ⚠️ 2026-09-06 真機出過，原文照抄如下：
  //    `Drive 登入失敗（400：Token has been expired or revoked.）`
  //    當時畫面出「系統認唔出呢個錯誤」——⛔ 但系統其實認得，
  //    只係 `400` 唔喺下面條 regex 入面。
  //
  //    ⛔ 呢度**特登唔寫出過幾多次** —— 冇人量過。畫面上面見到嘅係
  //    同步失敗嗰一行，⛔ 唔係一個計數；亦冇人查過 DB。
  //    ⚠️ 見 `docs/開發紀錄.md` 附錄 B「唔准講一個你冇量過嘅安全網」。
  //
  // ⛔ 唔准當佢係一時三刻嘅嘢、⛔ 唔准講「系統會自動再試」：
  //    條 refresh token 死咗，重試一萬次都係同一個答案，要人去重新授權。
  if (isDriveAuthExpired(message)) {
    return {
      permanent: true,
      text: DRIVE_AUTH_EXPIRED_MESSAGE,
    }
  }

  // ⚠️ 同上面嗰個係兩件事，⛔ 修法唔同：呢個係 client id／secret 唔啱
  //    （`invalid_client`），要改 Worker secret，⛔ 唔係重做授權。
  //    分唔清就會有人白做十五分鐘授權（`worker/src/worker.mjs` 個註解講過同一件事）。
  if (message.includes('Drive 登入失敗')) {
    return {
      permanent: true,
      text: DRIVE_LOGIN_FAILED_MESSAGE,
    }
  }

  /*
   * ⛔⛔ **呢一段一定要行喺上面兩條授權條之後** —— ⛔ 唔准搬上去。
   *
   * ⚠️ 2026-09-19 CO 捉到：我第一版把佢插咗喺最頂，
   *    ⇒ 任何一句帶住 `HTTP <三位數>`、而內容其實係
   *      `Token has been expired or revoked` 嘅訊息，
   *      會出通用嗰句「呢個問題唔會自己好返」，
   *      **⛔ 出唔到 `DRIVE_AUTH_EXPIRED_MESSAGE`** ——
   *      而得嗰句先叫得動人去**重新授權**。
   * ⭐ 呢個檔上面個註解本來就寫住「一定要行喺 403／401 嗰條之前」。
   *   ⛔ 舊嗰條中文暗號一樣遮住過佢，所以⛔ 唔係新 regression ——
   *   但我今次動到呢段，就係修佢嗰陣。
   */
  if (isWorkerDriveFailure(message)) {
    if (TRANSIENT_DRIVE_REASONS.some((code) => message.includes(code))) {
      return { permanent: false, text: '無需處理。相片已安全存入雲端，系統會自動再試。' }
    }
    return {
      permanent: true,
      text: '需要處理：這個問題不會自行恢復。請截圖，並用 WhatsApp 聯絡 Jason。',
    }
  }


  // Google 明講額滿／冇權限 —— 重試幾多次都係一樣。
  if (/storageQuota|quotaExceeded|403|insufficientPermissions|401/i.test(message)) {
    return {
      permanent: true,
      text: '需要處理：Google Drive 那邊拒絕接收（額滿或沒有權限）。請截圖，並用 WhatsApp 聯絡 Jason。',
    }
  }

  // 認得出係一時三刻嘅網絡／伺服器問題先講「唔使做嘢」。
  if (/50\d|timeout|timed out|network|fetch failed|ECONN/i.test(message)) {
    return {
      permanent: false,
      text: '無需處理。相片已安全存入雲端，系統會自動再試。',
    }
  }

  // ⛔ 落唔到類 ＝ 我哋唔知，⛔ 唔係冇事。
  return {
    permanent: true,
    text: '需要處理：系統無法辨認這個錯誤。請截圖，並用 WhatsApp 聯絡 Jason。',
  }
}

/** `tree_id` → 樹牌號。⛔ 搵唔到就係 null（唔知），⛔ 唔准當佢係空白樹牌。 */
export function treeNoMap(trees: { id: string; tree_no: string }[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const tree of trees) map[tree.id] = tree.tree_no
  return map
}
