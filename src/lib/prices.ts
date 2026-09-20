import type { SupabaseClient } from '@supabase/supabase-js'
import { translateDbError } from './records'

/**
 * quote_prices —— 單價表（全公司共用一張）。
 *
 * ⛔ 呢度啲數係**成本**，唔係收客價（Jason 2026-08-25）。收客價 = 成本 × (1 + 加成%)。
 * ⛔ 成本同收客價永遠唔會上 PDF。
 *
 * ⭐⭐ 成張表最緊要嘅規矩：**價錢 null ≠ 0**。
 *    null ＝「逐次報價／未填」→ 成本表要出返一行「逐次報價，未計入」。
 *    原型實測過：當咗 0 嘅話，一部車嘅成本會靜靜哋由 $2,200 變 $0，
 *    而個成本表睇落完全正常 —— 冇人會發現。⛔ 所以任何時候都唔准 `?? 0`。
 */

export type PriceCategory = 'manpower' | 'fixed' | 'waste' | 'crane' | 'lift' | 'stump'

/**
 * 點計。⛔ 呢五個模式係由 Jason 2026-08-26 逐條拍板嚟嘅，唔係我砌出嚟：
 *
 * - `per_person_day`  人數 × 日數 × 價（攀樹師、地面工人）
 * - `auto_per_day`    日數 × 價。⭐ 自動計入，⛔ 唔使人手剔（Overhead）
 * - `per_day`         部數 × 日數 × 價（吊雞、升降台）
 * - `per_unit`        架數 × 價。⛔ **唔乘日數** —— 做兩日三日都係同一個數
 * - `once`            剔咗就計一次（9 噸碎、起樹頭）
 */
export type CalcMode = 'per_person_day' | 'auto_per_day' | 'per_day' | 'per_unit' | 'once'

export type PriceRow = {
  key: string
  category: PriceCategory
  label: string
  calc_mode: CalcMode
  has_qty: boolean
  /** ⛔ null ＝ 逐次報價／未填，⛔ 唔係 $0 */
  price_nt: number | null
  price_kl: number | null
  price_hk: number | null
  /** ⛔ null ＝ 冇夜價，照用日頭價。⛔ 唔准自己加成 —— 冇就係冇。 */
  price_night: number | null
  sort_order: number
  /** ⛔ 零真刪：唔要就 archive。DB 冇 DELETE policy，刪唔到。 */
  archived_at: string | null
  updated_by: string | null
  updated_at: string
  created_at: string
}

export type PriceTable = PriceRow[]

/** 存落 quote_records.price_snapshot 嗰份。就係整張表照抄。 */
export type PriceSnapshot = PriceTable

export type PriceApi = {
  /** 未 archive 嗰啲，照 sort_order 排。 */
  list: () => Promise<PriceTable>
  /** 改一個項目。⛔ 只有 quote_admins 改得到（RLS 把關，唔靠前端）。 */
  update: (key: string, patch: PricePatch) => Promise<PriceRow>
}

export type PricePatch = Partial<
  Pick<PriceRow, 'label' | 'price_nt' | 'price_kl' | 'price_hk' | 'price_night' | 'archived_at'>
>

function reportError(message: string): Error {
  console.error('[quote-app] DB error:', message)
  return new Error(translateDbError(message))
}

export function createPriceApi(client: SupabaseClient, userId: string): PriceApi {
  return {
    async list() {
      const { data, error } = await client
        .from('quote_prices')
        .select('*')
        .is('archived_at', null)
        .order('sort_order', { ascending: true })

      if (error) throw reportError(error.message)
      return (data as PriceTable | null) ?? []
    },

    async update(key, patch) {
      // 寫完照樣 readback 先當成功 —— 同 siteForm 一套做法。
      const { data, error } = await client
        .from('quote_prices')
        .update({ ...patch, updated_by: userId, updated_at: new Date().toISOString() })
        .eq('key', key)
        .select()
        .maybeSingle()

      if (error) throw reportError(error.message)
      if (!data) {
        throw new Error('無法修改單價。單價設定只有辦公室可以修改，你的帳號可能未有權限。')
      }
      return data as PriceRow
    },
  }
}
