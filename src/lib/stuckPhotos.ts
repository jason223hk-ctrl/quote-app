import { PHOTO_NO_ROW_MESSAGE, type QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'

/**
 * 「仲喺部機、未入到資料庫」嗰啲相。
 *
 * ⭐⭐ **點解要開呢個檔 —— ⛔ 唔准淨係記住結論**
 *
 * 2026-09-14 Jason 部機底 bar 一直寫住 **「未上載 4 張」**，佢原話係
 * **「一直存在、唔識消失」**，而佢**完全唔知發生緊乜事**。
 *
 * 查落去發現一件好簡單、但影響好大嘅事：
 *
 *   · 底 bar 個數 ＝ 數**部機 IndexedDB** 入面未上到嘅相（`pendingCount`）
 *   · 同步頁 ＝ **淨係讀 `quote_photos` 嗰堆 DB 行**（`photos.listAll()`）
 *
 * ⛔⛔ 一張相**上到 R2 但寫唔入 DB**（例如 RLS 拒絕）嗰陣，
 *    佢**根本冇 DB 行** ⇒ **喺同步頁完全睇唔到**。
 *
 * ⭐ 即係話：**個數會出、原因唔會出。** 同事見到一個永遠唔跌嘅數字，
 *    入去同步頁又乜都揾唔到 —— ⚠️ 呢個唔係「少咗個資訊」，
 *    係「個 app 睇落壞咗但唔肯講」，而人跟住就會唔再信佢。
 *
 * 呢個檔就係補返嗰一段：**同一個數，講得出每一張係點解卡住。**
 */

/**
 * 部機有、但雲端冇對應行嘅相。
 *
 * ⛔⛔ `rows === null` ＝ **問唔到 DB**（冇網、攞唔到）⇒ **一張都唔准報**。
 *    ⚠️ 「問唔到」同「查實一行都冇」係兩件事：問唔到就當「卡住」嘅話，
 *    飛航模式下成批相會突然全部變成「要人睇」，⛔ 嚇死人而且係假警報。
 *
 * ⭐ 已經上到（`status === 'uploaded'`）嗰啲一律唔計 —— 佢哋一定有行，
 *    ⚠️ 就算今次 `listAll()` 未反映到（DB 有幾秒延遲）都唔應該報。
 */
export function stuckLocal(items: PendingPhoto[], rows: QuotePhoto[] | null): PendingPhoto[] {
  if (rows === null) return []
  const known = new Set(rows.map((row) => row.operation_id))
  return items.filter((item) => item.status !== 'uploaded' && !known.has(item.operationId))
}

export type StuckAdvice = {
  /** 第二行：**你使唔使做嘢**。 */
  text: string
  /** 要人親自去搞嘅，出紅色。⛔ 唔會自己好返嗰啲。 */
  permanent: boolean
}

/**
 * 一張卡住嘅相，**你使唔使做嘢**。
 *
 * ⚠️ 做法跟返 `syncAdvice()`：⛔ 唔准淨係列一句錯誤原文。
 *    tree app 用血換返嚟嗰條教訓 —— 淨係出原文，同事唔會覺得
 *    「有一張相有事」，佢會覺得「個系統壞咗」。
 */
export function stuckAdvice(item: PendingPhoto): StuckAdvice {
  if (item.status === 'uploading') {
    return {
      permanent: false,
      text: '而家背景度自動上緊，⛔ 唔使撳。等佢傳完就得。',
    }
  }

  if (item.status === 'local') {
    return {
      permanent: false,
      text: '排緊隊。有網嘅時候會自己傳，唔使做嘢。',
    }
  }

  // status === 'error'
  //
  // ⭐⭐ 母單改唔到（RLS 拒絕）—— **Testing01 嗰 4 張相就係死喺呢度**。
  //
  // ⛔⛔ 對嘅係 `photos.ts` 出嗰個**常數**，⛔ 唔係一段自己抄落嚟嘅字串。
  //    ⚠️ 呢度冇得用 `instanceof`：張相嘅錯誤係存落 IndexedDB 嘅一個字串，
  //    過咗序列化型別就冇晒。用返同一個常數，改文案兩邊一齊改，
  //    ⭐ ⛔ 唔會出現「文案改咗、認唔返、靜靜咁降級做一句通用說話」。
  if (item.error.includes(PHOTO_NO_ROW_MESSAGE)) {
    return {
      permanent: true,
      text: '需要處理：所屬工程無法修改，所以這張相片無法寫入資料庫 —— 這個問題不會自行恢復。相片仍在本裝置，⛔ 不會丟失。請截圖，並用 WhatsApp 聯絡 Jason。',
    }
  }

  return {
    permanent: false,
    text: '無法上傳，系統會自動重試。相片仍在本裝置，⛔ 不會丟失。如果一直這樣，請截圖，並用 WhatsApp 聯絡 Jason。',
  }
}

/**
 * 錯誤原文（第三行）。⛔ 唔准截、⛔ 唔准改 —— 截咗就查唔到。
 *
 * ⚠️ 未試過上載嘅（`local`）根本冇原文，回空字串 ⇒ 畫面唔出嗰行。
 */
export function stuckRaw(item: PendingPhoto): string {
  return item.error.trim()
}

/**
 * 幾多張卡住。
 *
 * ⭐ 呢個數**應該同底 bar 嗰個「未上載 N 張」一樣** ——
 *    兩邊都係數「一份 DB 行都未有」嗰啲。
 * ⚠️ 唔一樣嘅話係一個訊號：⛔ 唔好夾佢，去查點解。
 */
export function stuckCount(items: PendingPhoto[], rows: QuotePhoto[] | null): number {
  return stuckLocal(items, rows).length
}
