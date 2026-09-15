import type { QuoteRecord } from './records'

export type RecordFilters = {
  /** 搜尋：工程名稱、客戶、地址、聯絡人、電話 */
  query: string
  /** 日期範圍，空字串 = 唔限 */
  dateFrom: string
  dateTo: string
}

/**
 * ⛔⛔ **⚠️ 呢度以前有個 `showArchived`，2026-09-15 拆走咗 —— ⛔ 唔准加返。**
 *
 * **Jason 2026-08-24 已經拍板「無左封存呢樣野」**（`docs/P3f-全app版面-實作計劃.md` §7 第 2 項）：
 * 徹底拆走，三個報價狀態已經做到同樣效果，⛔ `archived` 欄唔再有任何入口、
 * ⛔ 唔准再喺畫面提。但當時**得個講字，個勾同隱埋嘅規矩一直留咗喺度**。
 *
 * ⚠️⚠️ **拆嗰個勾嘅時候，⛔ 一定要連「隱埋」嗰條規矩一齊拆。**
 *    ⭐ 淨係拆個勾、留住 `if (record.archived) return false`，
 *    以前封存咗嗰啲單就**永遠喺清單消失，而且冇任何入口解返**。
 *    ⛔ 嗰個正正就係附錄 B 嗰條**「一條規矩啱、但冇出口」** ——
 *    **有入口冇出口，遲早變成一格唔識跌嘅數字。**
 *
 * ⇒ 所以而家 `archived` **完全唔參與篩選**：以前封存咗嘅單會**重新喺清單出返**。
 *    ⭐ 呢個係預期行為，⛔ 唔係 bug。
 *
 * ⛔ DB 嗰個 `archived` 欄**原封不動**（零真刪、⛔ 冇 migration）——
 *    P3f 明文：前端唔准讀寫就夠。
 */

export const EMPTY_FILTERS: RecordFilters = {
  query: '',
  dateFrom: '',
  dateTo: '',
}

const SEARCH_FIELDS = ['name', 'client', 'address', 'contact', 'phone'] as const

export function matchesQuery(record: QuoteRecord, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true

  return SEARCH_FIELDS.some((field) => {
    const value = record[field]
    return typeof value === 'string' && value.toLowerCase().includes(needle)
  })
}

/** 由新到舊：先睇 record_date，同一日就睇 created_at。 */
export function sortRecords(records: QuoteRecord[]): QuoteRecord[] {
  return [...records].sort((a, b) => {
    if (a.record_date !== b.record_date) return a.record_date < b.record_date ? 1 : -1
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
    return 0
  })
}

export function filterRecords(records: QuoteRecord[], filters: RecordFilters): QuoteRecord[] {
  const kept = records.filter((record) => {
    // 軟刪除永遠唔顯示，冇任何篩選開得返（要睇返就係 admin 喺 DB 側嘅事）。
    if (record.deleted_at !== null) return false
    // ⛔ 呢度以前有一行 `if (record.archived …) return false`。⛔ 唔准加返 —— 見上面。
    if (filters.dateFrom !== '' && record.record_date < filters.dateFrom) return false
    if (filters.dateTo !== '' && record.record_date > filters.dateTo) return false
    return matchesQuery(record, filters.query)
  })

  return sortRecords(kept)
}
