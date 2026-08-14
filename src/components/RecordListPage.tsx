import { useMemo, useState } from 'react'
import { EMPTY_FILTERS, filterRecords, type RecordFilters } from '../lib/filters'
import type { QuoteRecord } from '../lib/records'
import {
  BotanicalHeader,
  ChipButton,
  FloatBody,
  StatCard,
  UserPill,
  type UserInfo,
} from '../ui/shell'
import RecordCard from './RecordCard'

type Props = {
  records: QuoteRecord[]
  loading: boolean
  error: string | null
  user: UserInfo
  onOpen: (record: QuoteRecord) => void
  onCreate: () => void
  onRetry: () => void
}

/**
 * 02 工程清單。照 tree-app-v7 `ProjectListScreen`：
 * 統計卡浮喺波浪頂、搜尋收埋做 popover（唔再長期佔住畫面）、右下角 FAB。
 */
export default function RecordListPage({
  records,
  loading,
  error,
  user,
  onOpen,
  onCreate,
  onRetry,
}: Props) {
  const [filters, setFilters] = useState<RecordFilters>(EMPTY_FILTERS)
  const [popover, setPopover] = useState(false)

  const visible = useMemo(() => filterRecords(records, filters), [records, filters])
  const live = useMemo(() => filterRecords(records, EMPTY_FILTERS), [records])

  function patchFilters(patch: Partial<RecordFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  const filtersTouched =
    filters.query !== '' || filters.dateFrom !== '' || filters.dateTo !== '' || filters.showArchived

  return (
    <>
      <BotanicalHeader
        left={
          <>
            <span className="page-title">工程</span>
            <ChipButton
              glyph="⌕"
              label="搜尋"
              testid="search-toggle"
              small
              onClick={() => setPopover((v) => !v)}
            />
            {filtersTouched && <span className="badge amber">篩選中</span>}
          </>
        }
        right={<UserPill user={user} />}
      />

      <FloatBody
        testid="record-scroll"
        pills={
          <div className="stat-row">
            <StatCard value={live.length} label="工程" />
            <StatCard value={live.filter((r) => r.status === 'site').length} label="現場中" />
            <StatCard
              value={live.filter((r) => r.status === 'pending').length}
              label="待報價"
              tone="amber"
            />
          </div>
        }
      >
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
          <div className="muted empty">
            {records.length === 0 ? '仲未有工程。撳右下角「＋ 新增工程」開始。' : '冇工程符合而家嘅篩選。'}
          </div>
        )}

        <ul className="list" data-testid="record-list">
          {visible.map((record) => (
            <li key={record.id}>
              <RecordCard record={record} onOpen={() => onOpen(record)} />
            </li>
          ))}
        </ul>
      </FloatBody>

      <button className="fab" data-testid="fab-new-record" onClick={onCreate}>
        ＋ 新增工程
      </button>

      {popover && (
        <div className="search-overlay" data-testid="search-overlay" onClick={() => setPopover(false)}>
          <div className="popover" data-testid="search-popover" onClick={(e) => e.stopPropagation()}>
            <label htmlFor="q-search">搜尋</label>
            <input
              id="q-search"
              className="field__input"
              type="search"
              data-testid="record-search"
              placeholder="搜尋工程名稱、客戶、地址、聯絡人、電話"
              aria-label="搜尋工程名稱、客戶、地址、聯絡人、電話"
              value={filters.query}
              onChange={(event) => patchFilters({ query: event.target.value })}
            />

            <label>日期</label>
            <div className="date-range">
              <input
                className="field__input"
                type="date"
                data-testid="date-from"
                aria-label="由"
                value={filters.dateFrom}
                onChange={(event) => patchFilters({ dateFrom: event.target.value })}
              />
              <span className="range-sep">至</span>
              <input
                className="field__input"
                type="date"
                data-testid="date-to"
                aria-label="至"
                value={filters.dateTo}
                onChange={(event) => patchFilters({ dateTo: event.target.value })}
              />
            </div>

            <label>封存</label>
            <label className="checkbox">
              <input
                type="checkbox"
                data-testid="show-archived"
                checked={filters.showArchived}
                onChange={(event) => patchFilters({ showArchived: event.target.checked })}
              />
              <span>顯示封存</span>
            </label>

            <div className="popover-actions">
              <button className="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                重設
              </button>
              <button className="primary" onClick={() => setPopover(false)}>
                搜尋
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
