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
}

/**
 * 多揀清單。撳一下只係 on/off 自己，**唔會熄其他選項、冇任何互斥**——
 * 現場可以同時揀「垃圾不用清走」同「24噸夾車」，App 唔做判斷。
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
}: Props) {
  return (
    <fieldset className="group">
      <legend className="group__legend">{legend}</legend>
      {hint && <p className="group__hint">{hint}</p>}

      <div className="group__options">
        {options.map((option) => {
          const checked = values.includes(option.value)
          return (
            <div key={option.value}>
              <label className="option">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(option.value)}
                />
                <span>{option.label}</span>
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
