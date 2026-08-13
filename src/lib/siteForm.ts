import type { SupabaseClient } from '@supabase/supabase-js'
import { translateDbError } from './records'
import {
  isBlankOrNonNegativeNumber,
  numberToInput,
  toNumberOrNull,
  type Errors,
} from './forms'
import { LIFT_OTHER } from './options'

/** quote_site_form：一單一張，record_id 做 primary key。 */
export type SiteForm = {
  record_id: string
  crew_total: number | null
  work_days: number | null
  climbers_per_day: number | null
  waste_options: string[]
  waste_t24_qty: number | null
  waste_t30_qty: number | null
  machine_options: string[]
  lift_other: string
  stump_options: string[]
  updated_by: string
  created_at: string
  updated_at: string
}

export type SiteFormInput = {
  crew_total: string
  work_days: string
  climbers_per_day: string
  waste_options: string[]
  waste_t24_qty: string
  waste_t30_qty: string
  machine_options: string[]
  lift_other: string
  stump_options: string[]
}

export const EMPTY_SITE_FORM_INPUT: SiteFormInput = {
  crew_total: '',
  work_days: '',
  climbers_per_day: '',
  waste_options: [],
  waste_t24_qty: '',
  waste_t30_qty: '',
  machine_options: [],
  lift_other: '',
  stump_options: [],
}

export type SiteFormErrors = Errors<SiteFormInput>

/**
 * 表單 → DB。
 * 文字欄送空字串（唔送 null）；數字欄留空就係 null（唔准變零）；陣列一律送陣列。
 * 冇揀嘅選項唔應該留低舊數字／舊文字，所以架數同 lift_other 會清返。
 */
export function siteFormToRow(input: SiteFormInput): Record<string, unknown> {
  const waste = input.waste_options
  const machines = input.machine_options

  return {
    crew_total: toNumberOrNull(input.crew_total),
    work_days: toNumberOrNull(input.work_days),
    climbers_per_day: toNumberOrNull(input.climbers_per_day),
    waste_options: waste,
    waste_t24_qty: waste.includes('t24') ? toNumberOrNull(input.waste_t24_qty) : null,
    waste_t30_qty: waste.includes('t30') ? toNumberOrNull(input.waste_t30_qty) : null,
    machine_options: machines,
    lift_other: machines.includes(LIFT_OTHER) ? input.lift_other.trim() : '',
    stump_options: input.stump_options,
  }
}

export function siteFormToInput(form: SiteForm | null): SiteFormInput {
  if (!form) return EMPTY_SITE_FORM_INPUT
  return {
    crew_total: numberToInput(form.crew_total),
    work_days: numberToInput(form.work_days),
    climbers_per_day: numberToInput(form.climbers_per_day),
    waste_options: form.waste_options ?? [],
    waste_t24_qty: numberToInput(form.waste_t24_qty),
    waste_t30_qty: numberToInput(form.waste_t30_qty),
    machine_options: form.machine_options ?? [],
    lift_other: form.lift_other ?? '',
    stump_options: form.stump_options ?? [],
  }
}

/**
 * 只有垃圾處理係必填（至少一個）。
 * 其餘全部任揀、任留空，而且**冇任何互斥**：揀咗「垃圾不用清走」一樣揀得夾車，
 * 揀咗「不用」一樣揀得吊雞同升降台。App 只如實記錄現場，唔做判斷。
 */
export function validateSiteForm(input: SiteFormInput): SiteFormErrors {
  const errors: SiteFormErrors = {}

  if (input.waste_options.length === 0) {
    errors.waste_options = '請至少揀一個垃圾處理方法'
  }
  if (!isBlankOrNonNegativeNumber(input.crew_total)) errors.crew_total = '請填數字，或者留空'
  if (!isBlankOrNonNegativeNumber(input.work_days)) errors.work_days = '請填數字，或者留空'
  if (!isBlankOrNonNegativeNumber(input.climbers_per_day)) {
    errors.climbers_per_day = '請填數字，或者留空'
  }
  if (!isBlankOrNonNegativeNumber(input.waste_t24_qty)) errors.waste_t24_qty = '架數要填數字'
  if (!isBlankOrNonNegativeNumber(input.waste_t30_qty)) errors.waste_t30_qty = '架數要填數字'

  return errors
}

export type SiteFormApi = {
  get: (recordId: string) => Promise<SiteForm | null>
  save: (recordId: string, input: SiteFormInput) => Promise<SiteForm>
}

function reportError(message: string): Error {
  console.error('[quote-app] DB error:', message)
  return new Error(translateDbError(message))
}

export function createSiteFormApi(client: SupabaseClient, userId: string): SiteFormApi {
  return {
    async get(recordId) {
      const { data, error } = await client
        .from('quote_site_form')
        .select('*')
        .eq('record_id', recordId)
        .maybeSingle()

      if (error) throw reportError(error.message)
      return (data as SiteForm | null) ?? null
    },

    async save(recordId, input) {
      // 一單一張，所以 upsert 落 record_id。寫完照樣 readback 先當成功。
      const { data, error } = await client
        .from('quote_site_form')
        .upsert(
          {
            ...siteFormToRow(input),
            record_id: recordId,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'record_id' },
        )
        .select()
        .maybeSingle()

      if (error) throw reportError(error.message)
      if (!data) throw new Error('存唔到現場資料表。可能母單已經鎖定，或者唔係你開嘅單。')
      return data as SiteForm
    },
  }
}
