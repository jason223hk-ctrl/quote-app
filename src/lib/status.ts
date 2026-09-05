import type { QuoteRecord, QuoteStatus } from './records'
import { STATUS_LABELS } from './labels'

/**
 * 轉工程狀態。
 *
 * 規格來源（⛔ 全部係 Jason 拍咗板嘅，唔准自己改）：
 *  · `docs/十條-拍板.md` 第 2 條 —— 待報價 ⇄ 已報價 撳一下即改，⛔ 唔加確認；
 *    轉「已中標」彈一次確認，而句子要**寫明後果**，⛔ 唔可以只寫「確定嗎」。
 *  · `docs/十條-拍板.md` 第 3 條 —— 匯出 PDF 之後 ⛔ 唔問轉狀態。
 *  · `docs/交接-CO.md` —— 「已中標」之後 ⛔ 唔可以轉返「待報價」或「已報價」，
 *    而且 ⛔ **唔設撤回**：轉咗就係轉咗，靠確認框攔。
 *  · `docs/P7-客戶簿-人名.md` §2 —— 轉「已報價」要順手影低價錢快照，
 *    ⛔ 個價已經俾咗客戶，公司之後加價唔可以追溯改人哋張單。
 */

/**
 * 畫面揀得嘅三個。
 *
 * ⚠️ `QuoteStatus` 本身有六個（`site` / `sent` / `lost` 三個係舊資料同將來用）。
 * ⛔ 呢度**特登唔列晒六個** —— `docs/repo-對數清單.md` 寫明「三個狀態：
 * 待報價 → 已報價 → 已中標」，原型嘅 chip 亦係三個（`RecordListPage` `QTABS`）。
 * ⛔ 多開一個揀得嘅狀態係業務決定，唔係 code 決定。
 */
export const SELECTABLE_STATUSES: QuoteStatus[] = ['pending', 'quoted', 'won']

export type StatusChange =
  /** 轉唔得。`why` 一定要講到明點解，⛔ 唔准淨係將粒掣變灰。 */
  | { allowed: false; why: string }
  /**
   * 轉得。
   * · `confirm` ＝ null 就即刻轉；有字就要彈一次，字入面寫住後果。
   * · `snapshot` ＝ 要唔要順手影低而家嗰份單價表。
   */
  | { allowed: true; confirm: string | null; snapshot: boolean }

/**
 * 由 `record` 而家嘅狀態轉去 `to`，得唔得？要唔要確認？要唔要影快照？
 *
 * ⛔ 呢個 function ⛔ 唔准掂 DB、⛔ 唔准 `window.confirm` ——
 *    佢淨係答「應該點」，做嘢係上面嗰層嘅事。咁先驗得到。
 */
export function planStatusChange(record: QuoteRecord, to: QuoteStatus): StatusChange {
  if (record.status === to) {
    return { allowed: false, why: `已經係「${STATUS_LABELS[to]}」。` }
  }

  // ⛔⛔ 中標係單程路。`docs/交接-CO.md`：唔設撤回，轉咗就係轉咗。
  if (record.status === 'won') {
    return {
      allowed: false,
      why: '「已中標」之後改唔到 —— 相片資料夾已經搬咗入 Tree App。要改就搵 Jason。',
    }
  }

  if (to === 'won') {
    return {
      allowed: true,
      // ⛔ 呢句係規格原文（`十條-拍板` 第 2 條），⛔ 唔准改成「確定嗎」。
      confirm:
        `將「${record.name}」轉為已中標？` +
        `相片資料夾會搬入 Tree App Photos，同事即刻見到。` +
        `⛔ 轉咗之後改唔返。`,
      snapshot: needsSnapshot(record),
    }
  }

  return { allowed: true, confirm: null, snapshot: needsSnapshot(record) }
}

/**
 * 要唔要影一份新快照。
 *
 * ⭐ 只影一次：影過就唔准再影。
 * ⛔ 每次轉狀態都重影，等於「公司加咗價 → 客張舊單跟住升」，
 *    正正就係快照要擋嗰件事。
 */
export function needsSnapshot(record: QuoteRecord): boolean {
  return record.price_snapshot_at === null
}

/**
 * 「報咗 N 日」。
 *
 * ⛔ 只喺工程列表出，⛔ 首頁唔動（`docs/交接-CO.md`）。
 * ⛔ 冇快照時間 ＝ 冇嘢可以計，出 `null`，⛔ 唔准出 0（0 會讀成「今日先報」）。
 *
 * ⚠️ 用**本地日曆日**相減，⛔ 唔用 `toISOString()` ——
 *    香港朝早開單會爭返轉頭一日（`開發紀錄.md` 附錄B 已知陷阱）。
 */
export function daysSinceQuoted(record: QuoteRecord, now: Date): number | null {
  if (record.price_snapshot_at === null) return null
  const then = new Date(record.price_snapshot_at)
  if (Number.isNaN(then.getTime())) return null

  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.floor((b - a) / 86_400_000)
  return days < 0 ? 0 : days
}

/** 卡上面出嗰行。⛔ 未報價就 `null` —— 冇嘢講好過講一句空話。 */
export function quotedAgeText(record: QuoteRecord, now: Date): string | null {
  if (record.status !== 'quoted') return null
  const days = daysSinceQuoted(record, now)
  if (days === null) return null
  return days === 0 ? '今日報' : `報咗 ${days} 日`
}
