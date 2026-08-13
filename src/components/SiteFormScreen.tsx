import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toggleValue } from '../lib/forms'
import {
  CRANE_OPTIONS,
  LIFT_OPTIONS,
  LIFT_OTHER,
  MACHINE_NONE_OPTIONS,
  WASTE_OPTIONS,
  STUMP_OPTIONS,
} from '../lib/options'
import {
  EMPTY_SITE_FORM_INPUT,
  siteFormToInput,
  validateSiteForm,
  type SiteFormApi,
  type SiteFormErrors,
  type SiteFormInput,
} from '../lib/siteForm'
import type { QuoteRecord } from '../lib/records'
import OptionGroup from './OptionGroup'

type Props = {
  api: SiteFormApi
  record: QuoteRecord
  onBack: () => void
}

export default function SiteFormScreen({ api, record, onBack }: Props) {
  const [input, setInput] = useState<SiteFormInput>(EMPTY_SITE_FORM_INPUT)
  const [fieldErrors, setFieldErrors] = useState<SiteFormErrors>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInput(siteFormToInput(await api.get(record.id)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [api, record.id])

  useEffect(() => {
    void load()
  }, [load])

  function patch(values: Partial<SiteFormInput>) {
    setInput((current) => ({ ...current, ...values }))
    setSaved(false)
    setFieldErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(values) as (keyof SiteFormInput)[]) delete next[key]
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const errors = validateSiteForm(input)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('有欄位未填好，請檢查返下面紅色嗰幾行。')
      return
    }

    setFieldErrors({})
    setSaving(true)
    setError(null)
    try {
      // 用 server 回傳嘅 row 做準，唔係本機扮成功。
      setInput(siteFormToInput(await api.save(record.id, input)))
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  function numberField(key: 'crew_total' | 'work_days' | 'climbers_per_day', label: string) {
    return (
      <label className="field">
        <span className="field__label">{label}</span>
        <input
          className="field__input"
          type="text"
          inputMode="numeric"
          value={input[key]}
          disabled={saving}
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
          disabled={saving}
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
    <section className="card">
      <div className="page-head">
        <button className="link-button" type="button" onClick={onBack} disabled={saving}>
          ← 返基本資料
        </button>
        <h2 className="card__title">現場資料表</h2>
        <p className="page-head__sub">{record.name}</p>
      </div>

      {loading ? (
        <p className="loading">載入中…</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
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
            disabled={saving}
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
            disabled={saving}
            onToggle={(value) =>
              patch({ machine_options: toggleValue(input.machine_options, value) })
            }
          />

          <OptionGroup
            legend="機械 — 升降台"
            hint="選填。可以同時揀幾個高度。"
            options={LIFT_OPTIONS}
            values={input.machine_options}
            disabled={saving}
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
                  disabled={saving}
                  onChange={(event) => patch({ lift_other: event.target.value })}
                />
              ) : null
            }
          />

          <OptionGroup
            legend="機械 — 不用"
            options={MACHINE_NONE_OPTIONS}
            values={input.machine_options}
            disabled={saving}
            onToggle={(value) =>
              patch({ machine_options: toggleValue(input.machine_options, value) })
            }
          />

          <OptionGroup
            legend="起樹頭"
            hint="選填。三個都可以獨立揀。"
            options={STUMP_OPTIONS}
            values={input.stump_options}
            disabled={saving}
            onToggle={(value) => patch({ stump_options: toggleValue(input.stump_options, value) })}
          />

          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}

          {saved && !error && (
            <p className="notice notice--ok" role="status">
              已經存好。
            </p>
          )}

          <button className="button" type="submit" disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </form>
      )}
    </section>
  )
}
