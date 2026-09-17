import type { ReactNode } from 'react'
import type { Option } from '../lib/options'

type Props = {
  legend: string
  hint?: string
  options: Option[]
  values: string[]
  disabled?: boolean
  error?: string
  onToggle: (value: string) => void
  /** 揀咗某個選項先彈出嚟嘅額外欄（例如夾車架數、Other 打字欄）。 */
  renderExtra?: (value: string) => ReactNode
  /**
   * ⛔ **可選。唔傳 ＝ 冇任何互斥**（見下面檔頭 —— 呢個係預設，⛔ 唔准改）。
   *
   * 回一句中文 ＝ 呢個選項而家剔唔到，而**嗰句就係點解**。
   * 回 `null` ＝ 剔得。
   *
   * ⛔⛔ **回咗一句字，就一定要出到畫面。**
   * ⚠️ 「淨係變灰」係唔夠嘅 —— **一粒灰咗嘅掣係一個冇答案嘅問題**，
   *    人會一路撳一路以為個 app 壞咗（`StatusCard` 同 `PhotoSlot` 都中過）。
   */
  blockedReason?: (value: string) => string | null
}

/**
 * 多揀清單。撳一下只係 on/off 自己，**唔會熄其他選項、冇任何互斥**——
 * 現場可以同時揀「垃圾不用清走」同「24噸夾車」，App 唔做判斷。
 *
 * ⛔⛔ **上面呢句仍然係預設，⛔ 唔准改。** 現場資料表（`SiteFormFields`）
 *    由頭到尾**一個互斥都冇**（Jason 2026-08：「全部任揀、冇互斥」）。
 *
 * ⚠️ 2026-09-17 加咗一個**可選**嘅 `blockedReason` 窿，⭐ **只有一個地方用緊**：
 *    樹木嘅工序（`TreeFormPage`）——「移除」同「修剪／拉索加固」互斥。
 *    ⛔ 嗰條唔係「靚唔靚」，係**一棵已經冇咗嘅樹會照計埋修剪錢**
 *    （見 `src/lib/removalExclusive.ts` 檔頭）。
 * ⇒ ⛔ **唔准喺呢度寫死任何一條互斥規矩** —— 規矩永遠喺 caller 嗰邊。
 */
export default function OptionGroup({
  legend,
  hint,
  options,
  values,
  disabled,
  error,
  onToggle,
  renderExtra,
  blockedReason,
}: Props) {
  return (
    <fieldset className="group">
      <legend className="group__legend">{legend}</legend>
      {hint && <p className="group__hint">{hint}</p>}

      <div className="group__options">
        {options.map((option) => {
          const checked = values.includes(option.value)
          const blocked = blockedReason?.(option.value) ?? null
          return (
            <div key={option.value}>
              <label className={`option${blocked ? ' option--blocked' : ''}`}>
                <input
                  type="checkbox"
                  data-testid={`pick-${option.value}`}
                  checked={checked}
                  disabled={disabled || blocked !== null}
                  onChange={() => onToggle(option.value)}
                />
                <span>{option.label}</span>
                {/* ⛔ 灰咗就一定要講點解 —— 見 `blockedReason` 個註解。 */}
                {blocked && (
                  <span className="option__blocked" data-testid={`blocked-${option.value}`}>
                    {blocked}
                  </span>
                )}
              </label>
              {checked && renderExtra?.(option.value)}
            </div>
          )
        })}
      </div>

      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  )
}
