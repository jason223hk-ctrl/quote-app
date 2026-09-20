import { useState } from 'react'
import type { QuoteRecord, QuoteStatus } from '../lib/records'
import { STATUS_LABELS } from '../lib/labels'
import { SELECTABLE_STATUSES, planStatusChange } from '../lib/status'

type Props = {
  record: QuoteRecord
  /** 「已中標」淨係辦公室撳得（`docs/交接-CO.md`：兩個角色，已中標需要辦公室權限）。 */
  canSetWon: boolean
  busy: boolean
  /** `snapshot` ＝ true 就要順手影低而家嗰份單價表。 */
  onChange: (to: QuoteStatus, snapshot: boolean) => void
}

/**
 * 轉工程狀態。
 *
 * ⛔⛔ 兩條規矩由 `docs/十條-拍板.md` 第 2 條嚟，⛔ 唔准自己改：
 *   · 待報價 ⇄ 已報價：撳一下即刻改，⛔ 唔加確認。
 *   · 轉「已中標」：彈一次確認，而句子要**寫明後果** ——
 *     ⛔ 唔可以只寫「確定嗎」。
 *
 * ⚠️ 個確認做喺卡入面，⛔ 唔用 `window.confirm`：
 *   1. 瀏覽器嗰個彈窗改唔到字體大細，戴住手套喺太陽底下讀唔到；
 *   2. 佢會 block 住成個 tab，⛔ 冇網嗰陣特別易撳完卡死。
 *
 * ⛔ 撳唔到嘅狀態**唔會變灰算數** —— 一定要出一句解釋。
 *    一粒灰咗嘅掣係一個冇答案嘅問題，人只會一路撳一路以為壞咗
 *    （同「再試一次」嗰次一模一樣，見 `PhotoSlot`）。
 */
export default function StatusCard({ record, canSetWon, busy, onChange }: Props) {
  /** 等緊確認嗰個目標狀態。null ＝ 冇嘢等緊。 */
  const [asking, setAsking] = useState<{ to: QuoteStatus; text: string } | null>(null)
  /** 點解撳唔到。⛔ 唔准淨係吞咗。 */
  const [blocked, setBlocked] = useState<string | null>(null)

  function tap(to: QuoteStatus) {
    setBlocked(null)
    setAsking(null)

    if (to === 'won' && !canSetWon) {
      setBlocked('「已中標」需要辦公室權限才能修改。請聯絡 Jason 或阿耀在公司修改。')
      return
    }

    const plan = planStatusChange(record, to)
    if (!plan.allowed) {
      setBlocked(plan.why)
      return
    }

    if (plan.confirm !== null) {
      setAsking({ to, text: plan.confirm })
      return
    }

    onChange(to, plan.snapshot)
  }

  function confirm() {
    if (asking === null) return
    const plan = planStatusChange(record, asking.to)
    setAsking(null)
    if (!plan.allowed) {
      setBlocked(plan.why)
      return
    }
    onChange(asking.to, plan.snapshot)
  }

  return (
    <section className="card" data-testid="status-card">
      <h2 className="card__title">
        狀態 <span className="card__title-note">（{STATUS_LABELS[record.status]}）</span>
      </h2>

      <div className="chips chips--in-card">
        {SELECTABLE_STATUSES.map((value) => (
          <button
            key={value}
            className={`chip2${record.status === value ? ' on' : ''}`}
            type="button"
            data-testid={`status-${value}`}
            disabled={busy}
            onClick={() => tap(value)}
          >
            {STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {busy && <p className="loading">修改中⋯</p>}

      {blocked !== null && (
        <p className="notice notice--warning" role="alert" data-testid="status-blocked">
          {blocked}
        </p>
      )}

      {asking !== null && (
        <div className="notice notice--warning" role="alert" data-testid="status-confirm">
          <p>{asking.text}</p>
          <div className="popover-actions">
            <button className="button button--small" type="button" onClick={confirm}>
              確認轉為已中標
            </button>
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={() => setAsking(null)}
            >
              暫不轉換
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
