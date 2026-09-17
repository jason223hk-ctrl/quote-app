import { ASKING_CANNOT, askingState } from '../lib/markup'
import type { Quote } from '../lib/pricing'

type Props = {
  quote: Quote
  /**
   * 人**打咗乜**（原文）。⛔ 個格顯示呢個，⛔ 唔准倒返轉由一個數字砌返個字串。
   *
   * ⭐⭐ **2026-09-17 起，呢個係加成嘅唯一來源。**
   * ⚠️ 本來仲有個 `markupPct` prop（同一個 `markupInput` 算出嚟）——
   *    ⛔ 拆咗佢。**兩個來源講同一件事，就一定有一日佢哋唔同意**，
   *    ⭐ 而「分唔開兩種 null」正正就係今次要修嗰個病。
   *
   * ⚠️⚠️ 2026-09-16 實測到嘅死循環：舊寫法個格出 `String(Number(typed))`，
   *    打 `abc` ⇒ 格變 `NaN` ⇒ 跟住打乜都接落 `"NaN"` 後面 ⇒ **永遠打唔返出嚟**，
   *    而**報價價錢同時變 `$NaN`**。⭐ 個格出返原文就冇咗呢件事。
   */
  typedMarkup: string
  /** 計價用嗰個數。⛔ 永遠唔會係 `NaN`（見 `src/lib/markup.ts`）。 */
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
  typedMarkup,
  canEditMarkup,
  onMarkupChange,
  loading,
}: Props) {
  const { lines, ask, total } = quote
  /*
   * ⭐⭐ **三個狀態，⛔ 唔係兩個** —— 見 `src/lib/markup.ts` 個 `askingState()`。
   *   · 有加成            ⇒ 出價
   *   · **空格**          ⇒ ⭐ 照出成本價（合法狀態，CLAUDE.md §2.3 `null ≠ 0`）
   *   · **讀唔到**（`abc`）⇒ ⛔ **唔出價**（Jason 2026-09-16 拍板）
   *
   * ⛔⛔ **⛔ 唔准由 `markupPct` 推返「係咪讀唔到」** —— 佢兩種情況都係 `null`，
   *    ⚠️ 而「分唔開」正正就係今次要修嗰個病。⇒ 一定要睇返人**打咗乜**。
   */
  const state = askingState(typedMarkup)
  const pct = state.kind === 'ok' ? state.pct : 0
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
                  value={typedMarkup}
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
              {state.kind === 'cannot' ? (
                /* ⛔ ⛔ 唔准寫 `$0`、⛔ 唔准寫 `—`、⛔ 唔准留空 ——
                   三樣都會俾人當成「個價係零／未計」，而真相係
                   **「我哋計唔到，而你打咗啲嘢喺度」**。 */
                <div className="cost-asking cost-asking--cannot" data-testid="asking-price">
                  {ASKING_CANNOT}
                </div>
              ) : (
                <div className="cost-asking" data-testid="asking-price">
                  {money(asking)}
                </div>
              )}
              {state.kind === 'cannot' ? (
                <div className="cost-how cost-how--warn" role="alert" data-testid="asking-why">
                  {state.why}
                </div>
              ) : (
                state.kind === 'cost' && <div className="cost-how">未設加成，等於成本價</div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
