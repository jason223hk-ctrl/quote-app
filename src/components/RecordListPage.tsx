import { useMemo, useState } from 'react'
import type { QuoteStatus } from '../lib/records'
import { EMPTY_FILTERS, filterRecords, type RecordFilters } from '../lib/filters'
import type { QuoteRecord } from '../lib/records'
import { BotanicalHeader, ChipButton, ScrollBody, UserPill, type UserInfo } from '../ui/shell'
import { Icon, ICONS } from '../ui/Icon'
import RecordCard, { type SwipeDeleteProps } from './RecordCard'

/** 四個狀態 chip。⭐ 同原型 `QTABS` 一模一樣，⛔ 唔加唔減。 */
const QTABS: [QuoteStatus | 'all', string][] = [
  ['all', '全部'],
  ['pending', '待報價'],
  ['quoted', '已報價'],
  ['won', '已中標'],
]

type Props = {
  records: QuoteRecord[]
  loading: boolean
  error: string | null
  user: UserInfo
  onOpen: (record: QuoteRecord) => void
  onCreate: () => void
  onRetry: () => void
  /** 向左推刪除。⛔ 唔傳就冇推；⛔ 要就 `run` 同 `apis` 一齊（見 `RecordCard`）。 */
  swipeDelete?: SwipeDeleteProps
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
  swipeDelete,
}: Props) {
  const [filters, setFilters] = useState<RecordFilters>(EMPTY_FILTERS)
  const [popover, setPopover] = useState(false)
  /** 狀態 chip。⭐ 同搜尋係疊埋一齊用，⛔ 唔係二揀一（原型 2026-08-25）。 */
  const [tab, setTab] = useState<QuoteStatus | 'all'>('all')

  const visible = useMemo(() => {
    const rows = filterRecords(records, filters)
    return tab === 'all' ? rows : rows.filter((r) => r.status === tab)
  }, [records, filters, tab])

  function patchFilters(patch: Partial<RecordFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  const filtersTouched =
    filters.query !== '' || filters.dateFrom !== '' || filters.dateTo !== ''

  return (
    <>
      <BotanicalHeader
        compact="list"
        left={
          <>
            <span className="page-title">工程</span>
            <ChipButton
              icon={ICONS.search}
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

      {/* ⛔ 原型呢版冇統計卡，係四個狀態 chip。 */}
      <div className="chips" data-testid="status-chips">
        {QTABS.map(([key, label]) => (
          <button
            key={key}
            className={`chip2${tab === key ? ' on' : ''}`}
            data-testid={`chip-${key}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <ScrollBody
        testid="record-scroll"
        compact
        className="records-scroll"
        // ⭐ 同「重試」粒掣叫同一個 function —— ⛔ 唔會有兩套刷新邏輯。
        onRefresh={async () => onRetry()}
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
              <RecordCard
                record={record}
                onOpen={() => onOpen(record)}
                swipeDelete={swipeDelete}
              />
            </li>
          ))}
        </ul>
      </ScrollBody>

      {/* 圓形 FAB，同首頁同一個 —— 原型全 app 只有一款加掣。
          ⛔ 之前係一個長條「＋ 新增工程」，位同形狀都同原型對唔上。 */}
      <button
        className="fab fab--round"
        data-testid="fab-new-record"
        aria-label="新增工程"
        onClick={onCreate}
      >
        <Icon name={ICONS.add} />
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

            {/* ⛔ 呢度以前有個「顯示封存」勾。2026-09-15 拆走，⛔ 唔准加返 ——
                見 `src/lib/filters.ts` 檔頭（Jason 2026-08-24 已拍板拆走封存）。 */}

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
