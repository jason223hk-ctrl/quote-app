import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createRecordsApi, type QuoteRecord, type RecordsApi } from '../lib/records'
import { createTreesApi, type TreesApi } from '../lib/trees'
import { createSiteFormApi, type SiteFormApi } from '../lib/siteForm'
import { createPhotosApi, type PhotosApi } from '../lib/photos'
import { createPriceApi, type PriceApi } from '../lib/prices'
import { isOffice } from '../lib/office'
import { activeTab, type Nav, type Route } from '../ui/routes'
import { BottomNav, userInfoFrom, type UserInfo } from '../ui/shell'
import HomeScreen from './HomeScreen'
import RecordListPage from './RecordListPage'
import RecordHubScreen from './RecordHubScreen'
import RecordFormPage from './RecordFormPage'
import TreesScreen from './TreesScreen'
import SiteFormScreen from './SiteFormScreen'
import SettingsScreen from './SettingsScreen'
import PriceScreen from './PriceScreen'

type Props = {
  client: SupabaseClient
  session: Session
}

export type QuoteApi = {
  records: RecordsApi
  trees: TreesApi
  siteForm: SiteFormApi
  photos: PhotosApi
  prices: PriceApi
}

export default function HomePage({ client, session }: Props) {
  const api: QuoteApi = useMemo(
    () => ({
      records: createRecordsApi(client, session.user.id),
      trees: createTreesApi(client, session.user.id),
      siteForm: createSiteFormApi(client, session.user.id),
      photos: createPhotosApi(client, session.user.id),
      prices: createPriceApi(client, session.user.id),
    }),
    [client, session.user.id],
  )

  // 加成％ 淨係辦公室改得。⛔ 查唔到一律當唔係 —— 寧願見到但改唔到。
  const [office, setOffice] = useState(false)
  useEffect(() => {
    let active = true
    void isOffice(client, session.user.id).then((yes) => {
      if (active) setOffice(yes)
    })
    return () => {
      active = false
    }
  }, [client, session.user.id])

  return (
    <RecordsScreen
      api={api}
      office={office}
      user={userInfoFrom(session.user.email ?? '')}
      userId={session.user.id}
      accessToken={session.access_token}
      onSignOut={() => client.auth.signOut()}
    />
  )
}

type ScreenProps = {
  api: QuoteApi
  /** 係咪辦公室（quote_admins）。而家淨係用嚟決定加成％ 改唔改得。 */
  office: boolean
  user: UserInfo
  userId: string
  /** 攞 R2 簽名網址嗰陣要用嚟證明身分。⛔ 唔會存落任何地方。 */
  accessToken: string
  onSignOut: () => Promise<unknown>
}

/**
 * 登入之後嘅根。照 tree-app-v7 `SignedInApp`：一個 route state、一個共用外殼、
 * 底部導航永遠釘住。只認 QuoteApi 唔認 Supabase client，所以本機可以餵假 api 行真流程。
 *
 * 資料流冇變（P1 定落）：每次寫入之後由 server 重新攞清單，DB 係唯一 source of truth。
 */
export function RecordsScreen({ api, office, user, userId, accessToken, onSignOut }: ScreenProps) {
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<Route>({ name: 'home' })

  const nav: Nav = { go: setRoute }

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRecords(await api.records.list())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  function findRecord(id: string): QuoteRecord | null {
    return records.find((record) => record.id === id) ?? null
  }

  /** 寫入 → 用 server 回傳嘅 row 做準 → 重新攞清單 → 去指定嘅版。 */
  async function afterWrite(write: () => Promise<QuoteRecord>, next: (saved: QuoteRecord) => Route) {
    const saved = await write()
    await reload()
    setRoute(next(saved))
  }

  return (
    <div className="app app--float">
      {renderRoute()}
      <BottomNav active={activeTab(route)} nav={nav} />
    </div>
  )

  function missingRecord() {
    return (
      <div className="content">
        <p className="notice notice--warning">
          搵唔到呢一單。{' '}
          <button className="link-button" type="button" onClick={() => nav.go({ name: 'records' })}>
            返工程清單
          </button>
        </p>
      </div>
    )
  }

  function renderRoute() {
    switch (route.name) {
      case 'home':
        return <HomeScreen records={records} loading={loading} nav={nav} />

      case 'records':
        return (
          <RecordListPage
            records={records}
            loading={loading}
            error={error}
            user={user}
            onOpen={(record) => nav.go({ name: 'record', recordId: record.id })}
            onCreate={() => nav.go({ name: 'record-form', recordId: null })}
            onRetry={() => void reload()}
          />
        )

      case 'record': {
        const record = findRecord(route.recordId)
        if (!record) return loading ? <div className="content"><p className="loading">載入中…</p></div> : missingRecord()
        return (
          <RecordHubScreen
            api={api.trees}
            siteFormApi={api.siteForm}
            priceApi={api.prices}
            record={record}
            canEditMarkup={office}
            onMarkupSave={async (pct) => {
              await api.records.setMarkup(record.id, pct)
              await reload()
            }}
            nav={nav}
          />
        )
      }

      case 'record-form': {
        const record = route.recordId === null ? null : findRecord(route.recordId)
        if (route.recordId !== null && !record) {
          return loading ? <div className="content"><p className="loading">載入中…</p></div> : missingRecord()
        }
        return (
          <RecordFormPage
            record={record}
            onSave={(input) =>
              afterWrite(
                () => (record ? api.records.update(record.id, input) : api.records.create(input)),
                (saved) => ({ name: 'record', recordId: saved.id }),
              )
            }
            onArchiveToggle={() =>
              afterWrite(
                () => {
                  if (!record) throw new Error('搵唔到呢一單，請返清單再試。')
                  return api.records.setArchived(record.id, !record.archived)
                },
                () => ({ name: 'records' }),
              )
            }
            onDelete={() =>
              afterWrite(
                () => {
                  if (!record) throw new Error('搵唔到呢一單，請返清單再試。')
                  return api.records.softDelete(record.id)
                },
                () => ({ name: 'records' }),
              )
            }
            onBack={() =>
              nav.go(record ? { name: 'record', recordId: record.id } : { name: 'records' })
            }
          />
        )
      }

      case 'trees': {
        const record = findRecord(route.recordId)
        if (!record) return loading ? <div className="content"><p className="loading">載入中…</p></div> : missingRecord()
        return (
          <TreesScreen
            api={api.trees}
            photos={api.photos}
            accessToken={accessToken}
            record={record}
            onBack={() => nav.go({ name: 'record', recordId: record.id })}
          />
        )
      }

      case 'site-form': {
        const record = findRecord(route.recordId)
        if (!record) return loading ? <div className="content"><p className="loading">載入中…</p></div> : missingRecord()
        return (
          <SiteFormScreen
            api={api.siteForm}
            record={record}
            onBack={() => nav.go({ name: 'record', recordId: record.id })}
          />
        )
      }

      case 'settings':
        return (
          <SettingsScreen
            user={user}
            userId={userId}
            recordCount={records.length}
            onOpenPrices={() => nav.go({ name: 'prices' })}
            onSignOut={onSignOut}
          />
        )

      case 'prices':
        return (
          <PriceScreen
            api={api.prices}
            canEdit={office}
            onBack={() => nav.go({ name: 'settings' })}
          />
        )
    }
  }
}
