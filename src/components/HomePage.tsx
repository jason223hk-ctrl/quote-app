import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { listHalfPurged } from '../lib/halfPurged'
import { photoStore } from '../lib/photoStore'
import { photoWorkerBase } from '../lib/photoTransport'
import { callPurgeOnce, purgeRecordFully, type PurgeApi } from '../lib/purgeRecord'
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
  /** P8 步 4／5：清走已刪工程嘅雲端相（Worker `/purge`）。見 `src/lib/purgeRecord.ts`。 */
  purge: PurgeApi
}

/**
 * ⭐ 每次叫 `/purge` 之前**即時**問 Supabase 攞 token（佢過期會自己 refresh）——
 *   ⛔ 唔用 render 嗰陣個 `session.access_token`：清幾十張相要幾分鐘，中途過期就 401。
 */
function createPurgeApi(client: SupabaseClient): PurgeApi {
  return {
    run: (recordId) =>
      purgeRecordFully(recordId, {
        callOnce: async (id) => {
          const { data } = await client.auth.getSession()
          return callPurgeOnce(id, {
            base: photoWorkerBase(),
            token: data.session?.access_token ?? null,
            fetch: (url, init) => fetch(url, init),
          })
        },
        listLocal: photoStore.listByRecord,
        removeLocal: photoStore.removeMany,
      }),
    listHalfPurged: () => listHalfPurged(client),
  }
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
      purge: createPurgeApi(client),
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
  /**
   * 由清單度推開張卡刪除。
   *
   * ⭐ 同「工程基本資料」入面嗰粒刪除**行同一條路** —— 同一個 `softDelete`、
   *    同一個 `withRefusalReason`、同一句原因。⛔ 唔係兩套。
   * ⛔ 失敗要 throw：個彈窗接住之後會出返嗰句，⛔ 唔准食咗佢變「撳咗冇反應」。
   * ⛔ 成功之後⛔ 唔轉頁 —— 人仲喺清單度，張卡走咗就係咁多。
   */
  /**
   * ⭐ P8 步 4：軟刪完之後**即刻**叫 `/purge` 清走雲端兩份相，全部清完先刪部機嗰份。
   *
   * ⛔⛔ 清唔晒（冇網、清咗一半、`not_yours`⋯）⇒ **throw**，個彈窗會出返嗰句，
   *    ⛔ 唔准講成功。嗰陣單嘢**已經軟刪咗**，所以記低喺 `softDeleted`：
   *    再撳一次「永久刪除」⇒ ⛔ 唔會再寫 `deleted_at`（已刪嘅單寫唔到，會俾人拒），
   *    淨係由頭再叫 `/purge`（已經清咗嘅會 skip）＝ 繼續清。
   *    ⭐ 走咗都唔怕：設定頁「診斷資料」會出「刪了一半」嗰行（步 5）。
   */
  const softDeleted = useRef(new Set<string>())
  const deleteRecord = useCallback(
    async (record: QuoteRecord) => {
      if (!softDeleted.current.has(record.id)) {
        await withRefusalReason(api.records.softDelete(record.id), () =>
          refusalReason(record, userId),
        )
        softDeleted.current.add(record.id)
      }
      const result = await api.purge.run(record.id)
      if (!result.ok) {
        throw new Error(
          `${result.message}（在這個視窗再點擊「永久刪除」就會繼續清；關閉後亦可以到「設定 → 診斷資料」點擊「繼續清」。）`,
        )
      }
      softDeleted.current.delete(record.id)
      await reload()
    },
    [api, userId, reload],
  )

  /**
   * 彈窗撳「取消」之後。⭐ 如果單嘢其實已經軟刪咗（清相清到一半），
   * 重新攞清單，回 `true`（工程詳情頁就要離開）。
   */
  const dismissDelete = useCallback(
    (record: QuoteRecord) => {
      if (!softDeleted.current.has(record.id)) return false
      softDeleted.current.delete(record.id)
      void reload()
      return true
    },
    [reload],
  )

  /**
   * 向左推刪除嗰一組嘢。**⛔ 三樣綁埋一齊傳落去。**
   *
   * ⭐ `apis` 淨係俾彈窗數「連帶消失：N 棵樹、N 張相」用 ——
   *    ⛔ 唔會拎嚟做刪除，刪除仍然係上面 `deleteRecord` 嗰一條路。
   * ⚠️ 兩個 list 失敗一定要 throw（`createTreesApi` / `createPhotosApi` 本身就係咁）——
   *    ⛔ 回 `[]` 就會變成「冇嘢會消失」，而嗰句可能係假嘅。
   */
  const swipeDelete = useMemo(
    () => ({
      run: deleteRecord,
      dismissed: dismissDelete,
      apis: { listTrees: api.trees.list, listRows: api.photos.listByRecord },
    }),
    [deleteRecord, dismissDelete, api],
  )

  async function afterWrite(write: () => Promise<QuoteRecord>, next: (saved: QuoteRecord) => Route) {
    const saved = await write()
    await reload()
    setRoute(next(saved))
  }

  return (
    <div className="app app--float">
      {/* ⛔⛔ **排第一個係故意嘅** —— 條 bar 而家係成版最頂嗰條
          （Jason 2026-09-16「細條啲既 bar 放最頂」，⛔ 推翻咗 09-06 嗰個底部位置）。
          ⚠️ DOM 次序 ＝ 畫面次序 ＝ 讀屏次序，⛔ 唔准靠 CSS `order` 掉返轉。
          ⛔ 唔跟畫面走 —— 換咩版都仲喺度。 */}
      <PendingBar onOpenSync={() => nav.go({ name: 'sync' })} />
      {renderRoute()}
      <BottomNav active={activeTab(route)} nav={nav} />
    </div>
  )

  function missingRecord() {
    return (
      <div className="content">
        <p className="notice notice--warning">
          檢索不到此單。{' '}
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
        return (
          <HomeScreen
            records={records}
            loading={loading}
            nav={nav}
            onRefresh={reload}
            swipeDelete={swipeDelete}
          />
        )

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
            swipeDelete={swipeDelete}
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
            // ⭐ 同工程清單推開張卡**同一個 object** —— 同一套確認、同一個數。
            swipeDelete={swipeDelete}
            onStatusChange={async (to, snapshot) => {
              // ⛔⛔ 要影快照而攞唔到單價表 ⇒ **唔准照轉**。
              //    照轉嘅話 `price_snapshot_at` 永遠係 null：
              //    「已報 N 日」計唔到，而個價會一路跟現價浮 ——
              //    即係公司之後加價，客張舊單跟住升。
              let snap: unknown = null
              if (snapshot) {
                snap = await api.prices.list()
              }
              /*
               * ⛔⛔ 行返同一個 `withRefusalReason` —— ⭐ 同刪除、同加成**同一條路**。
               * ⚠️ 2026-09-19 真機報「狀態撳唔到」：`setStatus` 0 行就 throw
               *    `NoRowError`，而嗰句係一句通用嘢。`refusalReason()` 嗰三句
               *    （鎖定／唔係你開／權限設定）**由頭到尾冇人叫過佢** ——
               *    ⇒ 三句寫得幾好都好，**冇人見到就等於冇寫**。
               */
              await withRefusalReason(api.records.setStatus(record.id, to, snap), () =>
                refusalReason(record, userId),
              )
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
            purge={api.purge}
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
