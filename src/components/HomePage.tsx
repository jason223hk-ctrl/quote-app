import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createRecordsApi, type QuoteRecord, type RecordsApi } from '../lib/records'
import { createTreesApi, type TreesApi } from '../lib/trees'
import { createSiteFormApi, type SiteFormApi } from '../lib/siteForm'
import RecordListPage from './RecordListPage'
import RecordFormPage from './RecordFormPage'
import TreesScreen from './TreesScreen'
import SiteFormScreen from './SiteFormScreen'

type Props = {
  client: SupabaseClient
  session: Session
}

export type QuoteApi = {
  records: RecordsApi
  trees: TreesApi
  siteForm: SiteFormApi
}

type View =
  | { kind: 'list' }
  | { kind: 'form'; id: string | null }
  | { kind: 'trees'; id: string }
  | { kind: 'site-form'; id: string }

export default function HomePage({ client, session }: Props) {
  const api: QuoteApi = useMemo(
    () => ({
      records: createRecordsApi(client, session.user.id),
      trees: createTreesApi(client, session.user.id),
      siteForm: createSiteFormApi(client, session.user.id),
    }),
    [client, session.user.id],
  )

  return <RecordsScreen api={api} email={session.user.email ?? ''} onSignOut={() => client.auth.signOut()} />
}

type ScreenProps = {
  api: QuoteApi
  email: string
  onSignOut: () => Promise<unknown>
}

/**
 * 只認 QuoteApi，唔認 Supabase client——本機可以餵一個 in-memory 假 api 行真流程。
 * 每次寫入之後都由 server 重新攞一次清單：DB 係唯一 source of truth，
 * 唔會本機砌一份 state 扮已經寫咗入去。
 */
export function RecordsScreen({ api, email, onSignOut }: ScreenProps) {
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [signingOut, setSigningOut] = useState(false)

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

  const editing =
    view.kind === 'form' && view.id !== null
      ? (records.find((record) => record.id === view.id) ?? null)
      : null

  /** 樹木清單同現場資料表都掛喺一張已存在嘅單度。 */
  const openedRecord =
    view.kind === 'trees' || view.kind === 'site-form'
      ? (records.find((record) => record.id === view.id) ?? null)
      : null

  /** 寫入 → 用 server 回傳嘅 row 做準 → 重新攞清單 → 返清單頁。 */
  async function afterWrite(write: () => Promise<QuoteRecord>) {
    await write()
    await reload()
    setView({ kind: 'list' })
  }

  async function handleSignOut() {
    setSigningOut(true)
    await onSignOut()
    setSigningOut(false)
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="topbar__title">森伝現場報價記錄</h1>
          <p className="topbar__email">{email || '（冇電郵）'}</p>
        </div>
        <button
          className="link-button"
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? '登出中…' : '登出'}
        </button>
      </header>

      {renderView()}
    </>
  )

  function renderView() {
    if (view.kind === 'trees' || view.kind === 'site-form') {
      // 母單載入緊、或者已經唔喺清單（例如俾人封存咗又篩走咗）就唔好白畫面。
      if (!openedRecord) {
        return loading ? (
          <p className="loading">載入中…</p>
        ) : (
          <p className="notice notice--warning">
            搵唔到呢一單。{' '}
            <button className="link-button" type="button" onClick={() => setView({ kind: 'list' })}>
              返清單
            </button>
          </p>
        )
      }

      return view.kind === 'trees' ? (
        <TreesScreen
          api={api.trees}
          record={openedRecord}
          onBack={() => setView({ kind: 'form', id: openedRecord.id })}
        />
      ) : (
        <SiteFormScreen
          api={api.siteForm}
          record={openedRecord}
          onBack={() => setView({ kind: 'form', id: openedRecord.id })}
        />
      )
    }

    if (view.kind === 'list') {
      return (
        <RecordListPage
          records={records}
          loading={loading}
          error={error}
          onOpen={(record) => setView({ kind: 'form', id: record.id })}
          onCreate={() => setView({ kind: 'form', id: null })}
          onRetry={() => void reload()}
        />
      )
    }

    return (
      <RecordFormPage
        record={editing}
        onSave={(input) =>
          afterWrite(() =>
            editing ? api.records.update(editing.id, input) : api.records.create(input),
          )
        }
        onArchiveToggle={() =>
          afterWrite(() => {
            if (!editing) throw new Error('搵唔到呢一單，請返清單再試。')
            return api.records.setArchived(editing.id, !editing.archived)
          })
        }
        onDelete={() =>
          afterWrite(() => {
            if (!editing) throw new Error('搵唔到呢一單，請返清單再試。')
            return api.records.softDelete(editing.id)
          })
        }
        onOpenTrees={editing ? () => setView({ kind: 'trees', id: editing.id }) : undefined}
        onOpenSiteForm={editing ? () => setView({ kind: 'site-form', id: editing.id }) : undefined}
        onBack={() => setView({ kind: 'list' })}
      />
    )
  }
}
