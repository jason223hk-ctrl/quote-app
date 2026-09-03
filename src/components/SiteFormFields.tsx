import { toggleValue } from '../lib/forms'
import {
  CRANE_OPTIONS,
  LIFT_OPTIONS,
  LIFT_OTHER,
  MACHINE_NONE_OPTIONS,
  WASTE_OPTIONS,
  STUMP_OPTIONS,
} from '../lib/options'
import type { SiteFormErrors, SiteFormInput } from '../lib/siteForm'
import OptionGroup from './OptionGroup'

type Props = {
  input: SiteFormInput
  fieldErrors: SiteFormErrors
  disabled: boolean
  patch: (values: Partial<SiteFormInput>) => void
}

/**
 * 現場嗰堆格（人手／垃圾／機械／起樹頭）。
 *
 * ⭐ 抽咗出嚟係因為原型將佢哋同工程基本資料擺埋同一版「工程資料」。
 * 呢個檔**只負責顯示**，⛔ 唔識得儲存、唔識得 DB —— 邊個用佢邊個負責寫。
 */
export default function SiteFormFields({ input, fieldErrors, disabled, patch }: Props) {
  function numberField(key: 'crew_total' | 'work_days' | 'climbers_per_day', label: string) {
    return (
      <label className="field">
        <span className="field__label">{label}</span>
        <input
          className="field__input"
          type="text"
          inputMode="numeric"
          value={input[key]}
          disabled={disabled}
          onChange={(event) => patch({ [key]: event.target.value } as Partial<SiteFormInput>)}
        />
        {fieldErrors[key] && (
          <span className="field__error" role="alert">
            {fieldErrors[key]}
          </span>
        )}
      </label>
    )
  }

  function qtyField(key: 'waste_t24_qty' | 'waste_t30_qty', label: string) {
    return (
      <label className="option__extra-field">
        <span className="field__label">{label}</span>
        <input
          className="field__input"
          type="text"
          inputMode="numeric"
          value={input[key]}
          disabled={disabled}
          onChange={(event) => patch({ [key]: event.target.value } as Partial<SiteFormInput>)}
        />
        {fieldErrors[key] && (
          <span className="field__error" role="alert">
            {fieldErrors[key]}
          </span>
        )}
      </label>
    )
  }

  return (
    <>
          <fieldset className="group">
            <legend className="group__legend">人手</legend>
            <p className="group__hint">唔知就留空。留空係「未填」，唔會當咗零。</p>
            {numberField('crew_total', '總共幾多人')}
            {numberField('work_days', '做幾多天')}
            {numberField('climbers_per_day', '預計一日幾多個攀樹師')}
          </fieldset>

          <OptionGroup
            legend="垃圾處理"
            hint="必填，至少揀一個。可以同時揀多過一個。"
            options={WASTE_OPTIONS}
            values={input.waste_options}
            disabled={disabled}
            error={fieldErrors.waste_options}
            onToggle={(value) => patch({ waste_options: toggleValue(input.waste_options, value) })}
            renderExtra={(value) => {
              if (value === 't24') return qtyField('waste_t24_qty', '24噸夾車架數')
              if (value === 't30') return qtyField('waste_t30_qty', '30噸夾車架數')
              return null
            }}
          />

          <OptionGroup
            legend="機械 — 吊雞"
            hint="選填。可以同時揀幾部。"
            options={CRANE_OPTIONS}
            values={input.machine_options}
            disabled={disabled}
            onToggle={(value) =>
              patch({ machine_options: toggleValue(input.machine_options, value) })
            }
          />

          <OptionGroup
            legend="機械 — 升降台"
            hint="選填。可以同時揀幾個高度。"
            options={LIFT_OPTIONS}
            values={input.machine_options}
            disabled={disabled}
            onToggle={(value) =>
              patch({ machine_options: toggleValue(input.machine_options, value) })
            }
            renderExtra={(value) =>
              value === LIFT_OTHER ? (
                <input
                  className="field__input option__extra"
                  type="text"
                  placeholder="其他升降台"
                  aria-label="其他升降台"
                  value={input.lift_other}
                  disabled={disabled}
                  onChange={(event) => patch({ lift_other: event.target.value })}
                />
              ) : null
            }
          />

          <OptionGroup
            legend="機械 — 不用"
            options={MACHINE_NONE_OPTIONS}
            values={input.machine_options}
            disabled={disabled}
            onToggle={(value) =>
              patch({ machine_options: toggleValue(input.machine_options, value) })
            }
          />

          <OptionGroup
            legend="起樹頭"
            hint="選填。三個都可以獨立揀。"
            options={STUMP_OPTIONS}
            values={input.stump_options}
            disabled={disabled}
            onToggle={(value) => patch({ stump_options: toggleValue(input.stump_options, value) })}
          />

    </>
  )
}
