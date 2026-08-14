import { useMemo, useState } from 'react'
import { EMPTY_FILTERS, filterRecords, type RecordFilters } from '../lib/filters'
import { clientAddressLine, statusLabel } from '../lib/labels'
import type { QuoteRecord } from '../lib/records'

type Props = {
  records: QuoteRecord[]
  loading: boolean
  error: string | null
  onOpen: (record: QuoteRecord) => void
  onCreate: () => void
  onRetry: () => void
}

export default function RecordListPage({
  records,
  loading,
  error,
  onOpen,
  onCreate,
  onRetry,
}: Props) {
  const [filters, setFilters] = useState<RecordFilters>(EMPTY_FILTERS)

  const visible = useMemo(() => filterRecords(records, filters), [records, filters])

  function patchFilters(patch: Partial<RecordFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  const filtersTouched =
    filters.query !== '' || filters.dateFrom !== '' || filters.dateTo !== '' || filters.showArchived

  return (
    <section className="list">
      <div className="filters">
        <input
          className="field__input"
          type="search"
          placeholder="搜尋工程名稱、客戶、地址、聯絡人、電話"
          aria-label="搜尋工程名稱、客戶、地址、聯絡人、電話"
          value={filters.query}
          onChange={(event) => patchFilters({ query: event.target.value })}
        />

        <div className="filters__dates">
          <label className="filters__date">
            <span className="field__label">由</span>
            <input
              className="field__input"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => patchFilters({ dateFrom: event.target.value })}
            />
          </label>
          <label className="filters__date">
            <span className="field__label">至</span>
            <input
              className="field__input"
              type="date"
              value={filters.dateTo}
              onChange={(event) => patchFilters({ dateTo: event.target.value })}
            />
          </label>
        </div>

        <div className="filters__row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.showArchived}
              onChange={(event) => patchFilters({ showArchived: event.target.checked })}
            />
            <span>顯示封存</span>
          </label>

          {filtersTouched && (
            <button
              className="link-button"
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              清除篩選
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="notice notice--error" role="alert">
          攞唔到清單：{error}{' '}
          <button className="link-button" type="button" onClick={onRetry}>
            再試
          </button>
        </p>
      )}

      {loading && <p className="loading">載入中…</p>}

      {!loading && !error && visible.length === 0 && (
        <p className="home__empty">
          {records.length === 0 ? '仲未有工程。撳右下角「＋ 新增工程」開始。' : '冇單符合而家嘅篩選。'}
        </p>
      )}

      <ul className="cards">
        {visible.map((record) => (
          <li key={record.id}>
            <button className="card card--tappable" type="button" onClick={() => onOpen(record)}>
              <span className="card__top">
                <span className="card__date">{record.record_date}</span>
                <span className={`status status--${record.status}`}>
                  <span className="status__dot" aria-hidden="true" />
                  {statusLabel(record.status)}
                </span>
              </span>

              <span className="card__name">{record.name}</span>

              {clientAddressLine(record.client, record.address) !== '' && (
                <span className="card__meta">
                  {clientAddressLine(record.client, record.address)}
                </span>
              )}

              {record.archived && <span className="tag">已封存</span>}
            </button>
          </li>
        ))}
      </ul>

      <button className="fab" type="button" onClick={onCreate}>
        ＋ 新增工程
      </button>
    </section>
  )
}
