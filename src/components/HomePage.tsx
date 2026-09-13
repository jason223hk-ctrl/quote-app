import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  createRecordsApi,
  refusalReason,
  withRefusalReason,
  type QuoteRecord,
  type RecordsApi,
} from '../lib/records'
import { createClientsApi, type ClientsApi } from '../lib/clients'
import { createTreesApi, type TreesApi } from '../lib/trees'
import { createSiteFormApi, type SiteFormApi } from '../lib/siteForm'
import { createPhotosApi, type PhotosApi } from '../lib/photos'
import { createPriceApi, type PriceApi } from '../lib/prices'
import { isOffice } from '../lib/office'
import { liveRecordIds } from '../lib/orphanPhotos'
import { useAutoResume } from '../lib/useAutoResume'
import { activeTab, type Nav, type Route } from '../ui/routes'
import { BottomNav, userInfoFrom, type UserInfo } from '../ui/shell'
import HomeScreen from './HomeScreen'
import PendingBar from './PendingBar'
import RecordListPage from './RecordListPage'
import RecordHubScreen from './RecordHubScreen'
import RecordFormPage from './RecordFormPage'
import TreesScreen from './TreesScreen'
import ClientFormScreen from './ClientFormScreen'
import ClientBookScreen from './ClientBookScreen'
import EnvPhotosScreen from './EnvPhotosScreen'
import SyncScreen from './SyncScreen'
import ExportPdfScreen from './ExportPdfScreen'
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
  clients: ClientsApi
}

export default function HomePage({ client, session }: Props) {
  const api: QuoteApi = useMemo(
    () => ({
      records: createRecordsApi(client, session.user.id),
      trees: createTreesApi(client, session.user.id),
      siteForm: createSiteFormApi(client, session.user.id),
      photos: createPhotosApi(client, session.user.id),
      prices: createPriceApi(client, session.user.id),
      clients: createClientsApi(client, session.user.id),
    }),
    [client, session.user.id],
  )

  /**
   * 自動重傳未上到嘅相。⛔ **成個 app 就掛喺呢一個位**（`useAutoResume` 開頭有解釋）。
   *
   * ⚠️ 呢度冇任何畫面 —— 佢係背景做嘢。`docs/上線清單.md` 第 1 條第 3 項
   * 要求嘅係「收到網就自動再傳，⛔ 唔使人手撳」，冇要求畫面出數字。
   */
  // ⭐ 回一個「即刻行一輪」，同步頁向下拉會用到（Jason 2026-09-13 第 4 條）。
  const retryUploads = useAutoResume(session.access_token, api.photos)

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
      onRetryUploads={retryUploads}
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
  /** 同步頁向下拉嗰陣即刻再試傳一次相。 */
  onRetryUploads: () => Promise<void>
  onSignOut: () => Promise<unknown>
}

/**
 * 登入之後嘅根。照 tree-app-v7 `SignedInApp`：一個 route state、一個共用外殼、
 * 底部導航永遠釘住。只認 QuoteApi 唔認 Supabase client，所以本機可以餵假 api 行真流程。
 *
 * 資料流冇變（P1 定落）：每次寫入之後由 server 重新攞清單，DB 係唯一 source of truth。
 */
export function RecordsScreen({
  api,
  office,
  user,
  userId,
  accessToken,
  onRetryUploads,
  onSignOut,
}: ScreenProps) {
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<Route>({ name: 'home' })

  const nav: Nav = { go: setRoute }

  /**
   * 而家仲攞得返嘅工程 id。⛔ **未載完、或者攞唔到，一律 `null`（＝唔知）**。
   *
   * ⚠️ 呢個 `null` 唔係求其寫：`records` 喺載入中同攞唔到嗰陣都係 `[]`，
   *    當咗佢係「一單都冇」，就會將**成部機所有相**當成孤兒 ——
   *    ⛔ 全部停止重試、⛔ 全部喺畫面消失，而且冇聲出。
   */
  const liveIds = loading || error !== null ? null : liveRecordIds(records)

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
      {/* ⛔ 釘喺底部導航上面，⛔ 唔跟畫面走 —— 換咩版都仲喺度（Jason 2026-09-06）。 */}
      <PendingBar onOpenSync={() => nav.go({ name: 'sync' })} />
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
        return <HomeScreen records={records} loading={loading} nav={nav} onRefresh={reload} />

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
            photosApi={api.photos}
            siteFormApi={api.siteForm}
            priceApi={api.prices}
            record={record}
            canEditMarkup={office}
            onMarkupSave={async (pct) => {
              await api.records.setMarkup(record.id, pct)
              await reload()
            }}
            canSetWon={office}
            onStatusChange={async (to, snapshot) => {
              // ⛔⛔ 要影快照而攞唔到單價表 ⇒ **唔准照轉**。
              //    照轉嘅話 `price_snapshot_at` 永遠係 null：
              //    「已報 N 日」計唔到，而個價會一路跟現價浮 ——
              //    即係公司之後加價，客張舊單跟住升。
              let snap: unknown = null
              if (snapshot) {
                snap = await api.prices.list()
              }
              await api.records.setStatus(record.id, to, snap)
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
            siteFormApi={api.siteForm}
            onSave={(input) =>
              afterWrite(
                () => (record ? api.records.update(record.id, input) : api.records.create(input)),
                (saved) => ({ name: 'record', recordId: saved.id }),
              )
            }
            /**
             * ⭐ 封存同刪除都經 `withRefusalReason`：伺服器回「0 行」嗰陣，
             *    用部機本身已經有嘅 `locked` / `created_by` 講返**邊個原因**，
             *    ⛔ 唔再推一句「可能 A，或者 B」俾現場同事自己估。
             *
             * ⛔⛔ 呢度**淨係解釋，⛔ 唔係判斷**：粒掣照撳得、請求照發出去。
             *    ⚠️ admin 改得到人哋嘅單，而部機根本唔知邊個係 admin ——
             *    部機自己攔 ⇒ 會鎖死一個本來做得到嘅動作。話事嘅永遠係 server。
             */
            onArchiveToggle={() =>
              afterWrite(
                () => {
                  if (!record) throw new Error('搵唔到呢一單，請返清單再試。')
                  return withRefusalReason(
                    api.records.setArchived(record.id, !record.archived),
                    () => refusalReason(record, userId),
                  )
                },
                () => ({ name: 'records' }),
              )
            }
            onDelete={() =>
              afterWrite(
                () => {
                  if (!record) throw new Error('搵唔到呢一單，請返清單再試。')
                  return withRefusalReason(
                    api.records.softDelete(record.id),
                    () => refusalReason(record, userId),
                  )
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

      case 'client-form': {
        const record = findRecord(route.recordId)
        if (!record) return loading ? <div className="content"><p className="loading">載入中…</p></div> : missingRecord()
        return (
          <ClientFormScreen
            record={record}
            clientsApi={api.clients}
            onOpenBook={() => nav.go({ name: 'clients' })}
            onSave={(input) =>
              afterWrite(
                () => api.records.update(record.id, input),
                () => ({ name: 'client-form', recordId: record.id }),
              )
            }
            onBack={() => nav.go({ name: 'record', recordId: record.id })}
          />
        )
      }

      case 'env-photos': {
        const record = findRecord(route.recordId)
        if (!record) return loading ? <div className="content"><p className="loading">載入中…</p></div> : missingRecord()
        return (
          <EnvPhotosScreen
            api={api.photos}
            accessToken={accessToken}
            record={record}
            onBack={() => nav.go({ name: 'record', recordId: record.id })}
          />
        )
      }

      case 'export-pdf': {
        const record = findRecord(route.recordId)
        if (!record) return loading ? <div className="content"><p className="loading">載入中…</p></div> : missingRecord()
        return (
          <ExportPdfScreen
            trees={api.trees}
            photos={api.photos}
            accessToken={accessToken}
            record={record}
            onBack={() => nav.go({ name: 'record', recordId: record.id })}
          />
        )
      }

      case 'sync':
        return (
          <SyncScreen
            photos={api.photos}
            trees={api.trees}
            records={records}
            liveRecordIds={liveIds}
            onRetryUploads={onRetryUploads}
            onOpenRecord={(recordId) => nav.go({ name: 'record', recordId })}
          />
        )

      case 'settings':
        return (
          <SettingsScreen
            user={user}
            userId={userId}
            recordCount={records.length}
            photos={api.photos}
            liveRecordIds={liveIds}
            onRefresh={reload}
            onOpenPrices={() => nav.go({ name: 'prices' })}
            onOpenClients={() => nav.go({ name: 'clients' })}
            onSignOut={onSignOut}
          />
        )

      case 'clients':
        return <ClientBookScreen api={api.clients} onBack={() => nav.go({ name: 'settings' })} />

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
