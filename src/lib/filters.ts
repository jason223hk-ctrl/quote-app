import type { QuoteRecord } from './records'

export type RecordFilters = {
  /** 搜尋：個名、大判、地點、客戶 */
  query: string
  /** 日期範圍，空字串 = 唔限 */
  dateFrom: string
  dateTo: string
  /** 預設 false：封存嘅單唔顯示 */
  showArchived: boolean
}

export const EMPTY_FILTERS: RecordFilters = {
  query: '',
  dateFrom: '',
  dateTo: '',
  showArchived: false,
}

const SEARCH_FIELDS = ['name', 'main_con', 'site', 'client'] as const

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
    if (record.archived && !filters.showArchived) return false
    if (filters.dateFrom !== '' && record.record_date < filters.dateFrom) return false
    if (filters.dateTo !== '' && record.record_date > filters.dateTo) return false
    return matchesQuery(record, filters.query)
  })

  return sortRecords(kept)
}
