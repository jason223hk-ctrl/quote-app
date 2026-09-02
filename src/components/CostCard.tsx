import type { Quote } from '../lib/pricing'

type Props = {
  quote: Quote
  markupPct: number | null
  /** 淨係辦公室改得（Jason 2026-08-30）。⛔ 唔准收埋 —— 要見到但改唔到。 */
  canEditMarkup: boolean
  onMarkupChange: (value: string) => void
  loading: boolean
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

/**
 * 成本 ／ 加成 ／ 報價價錢。
 *
 * ⛔ 呢度啲數係**成本**，唔係收客價（Jason 2026-08-25）。
 * ⛔ 成本同收客價永遠唔會上 PDF。
 *
 * ⭐「逐次報價，未計入」嗰啲行一定要出返，⛔ 唔准慳 ——
 *    唔出嘅話個總數睇落好靚，實際漏咗成部吊雞。
 *
 * ⚠️ 2026-09-02 Jason 拎走咗三樣：報價價錢唔再變橙、「（未包 N 項逐次報價）」、
 *    同埋「成本 × 1.5（加成 50%）」嗰句。
 *    ⛔ 最後嗰句本來係擋住「加成五成」被理解成「賺一半」（$72,000 對 $96,000，
 *    一單爭 $24,000），推翻咗 2026-09-01 嘅拍板 —— 個風險而家冇咗畫面提示。
 */
export default function CostCard({
  quote,
  markupPct,
  canEditMarkup,
  onMarkupChange,
  loading,
}: Props) {
  const { lines, ask, total } = quote
  const pct = markupPct ?? 0
  const asking = Math.round(total * (1 + pct / 100))

  return (
    <section className="cost-card" data-testid="cost-card">
      <h2 className="cost-title">成本</h2>
      <p className="cost-note">只供內部參考</p>

      {loading ? (
        <div className="muted empty">載入中…</div>
      ) : (
        <>
          {lines.length === 0 && ask.length === 0 ? (
            <div className="muted empty">尚未選取任何項目</div>
          ) : (
            <div className="cost-rows">
              {lines.map((line) => (
                <div className="cost-row" key={line.label}>
                  <span className="cost-label">{line.label}</span>
                  <span className="cost-value">{money(line.amount)}</span>
                </div>
              ))}
              {/* ⛔ 冇固定單價嘅唔可以當零 —— 一定要出返，否則總數騙人。 */}
              {ask.map((label) => (
                <div className="cost-row cost-row--ask" key={label}>
                  <span className="cost-label">{label}</span>
                  <span className="cost-value">逐次報價，未計入</span>
                </div>
              ))}
            </div>
          )}

          <div className="cost-row cost-row--total">
            <span className="cost-label">總成本</span>
            <span className="cost-value">{money(total)}</span>
          </div>

          <div className="cost-foot">
            <label className="cost-field">
              <span className="cost-field-label">
                加成{canEditMarkup ? '' : '（需辦公室權限）'}
              </span>
              {/* ％ 喺格入面，⛔ 唔喺標籤度 —— 跟 stage57 .pv2 ＋ .dollar。 */}
              <span className={`cost-input${canEditMarkup ? '' : ' locked'}`}>
                <input
                  type="text"
                  inputMode="numeric"
                  data-testid="markup-input"
                  value={markupPct === null ? '' : String(markupPct)}
                  readOnly={!canEditMarkup}
                  onChange={(e) => onMarkupChange(e.target.value)}
                />
                <span className="cost-unit" aria-hidden="true">
                  %
                </span>
              </span>
            </label>

            <div className="cost-field">
              <span className="cost-field-label">報價價錢</span>
              <div className="cost-asking" data-testid="asking-price">
                {money(asking)}
              </div>
              {pct <= 0 && <div className="cost-how">未設加成，等於成本價</div>}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
