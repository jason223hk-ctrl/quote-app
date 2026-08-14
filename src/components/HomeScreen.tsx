import { useMemo } from 'react'
import { EMPTY_FILTERS, filterRecords } from '../lib/filters'
import type { QuoteRecord } from '../lib/records'
import type { Nav } from '../ui/routes'
import { BotanicalHeader, BrandBlock, FloatBody, SectionHead, StatCard, UserPill, type UserInfo } from '../ui/shell'
import RecordCard from './RecordCard'

type Props = {
  records: QuoteRecord[]
  loading: boolean
  user: UserInfo
  nav: Nav
}

/** 01 首頁。照 tree-app-v7 `HomeScreen`：三張統計卡浮喺波浪頂 + 最近幾單。 */
export default function HomeScreen({ records, loading, user, nav }: Props) {
  const live = useMemo(() => filterRecords(records, EMPTY_FILTERS), [records])

  const counts = useMemo(
    () => ({
      site: live.filter((r) => r.status === 'site').length,
      pending: live.filter((r) => r.status === 'pending').length,
      quoted: live.filter((r) => r.status === 'quoted').length,
    }),
    [live],
  )

  const recent = live.slice(0, 5)

  return (
    <>
      <BotanicalHeader left={<BrandBlock />} right={<UserPill user={user} />} />
      <FloatBody
        testid="home-scroll"
        pills={
          <div className="stat-row">
            <StatCard value={counts.site} label="現場中" onClick={() => nav.go({ name: 'records' })} />
            <StatCard value={counts.pending} label="待報價" tone="amber" onClick={() => nav.go({ name: 'records' })} />
            <StatCard value={counts.quoted} label="已報價" onClick={() => nav.go({ name: 'records' })} />
          </div>
        }
      >
        <SectionHead
          title="最近工程"
          action={
            <button className="link" onClick={() => nav.go({ name: 'records' })}>
              查看全部 ›
            </button>
          }
        />

        {loading && <div className="muted empty">載入中…</div>}

        <ul className="list" data-testid="home-list">
          {recent.map((record) => (
            <li key={record.id}>
              <RecordCard
                record={record}
                onOpen={() => nav.go({ name: 'record', recordId: record.id })}
              />
            </li>
          ))}
        </ul>

        {!loading && recent.length === 0 && <div className="muted empty">未有工程</div>}
      </FloatBody>
    </>
  )
}
