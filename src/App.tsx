import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configResult, supabase } from './lib/supabase'
import ConfigMissing from './components/ConfigMissing'
import LoginPage from './components/LoginPage'
import HomePage from './components/HomePage'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setCheckingSession(false)
      return
    }

    let active = true

    void client.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setCheckingSession(false)
    })

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setCheckingSession(false)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return (
    <div className="app">
      <main className="app__main">{renderBody()}</main>
      <footer className="build-id">Build ID：v0.1 · {__BUILD_ID__}</footer>
    </div>
  )

  function renderBody() {
    // 登入之後 HomePage 有自己嘅頂欄，唔再重複個大 brand header。
    if (configResult.ok && supabase && session) {
      return <HomePage client={supabase} session={session} />
    }

    return (
      <>
        <header className="brand">
          <div className="brand__mark" aria-hidden="true" />
          <h1 className="brand__title">森伝現場報價記錄</h1>
          <p className="brand__subtitle">Sylvan quotation site-record</p>
        </header>

        {/* 冇環境變數：一定要見到清楚訊息，唔可以白畫面。 */}
        {!configResult.ok || !supabase ? (
          <ConfigMissing missing={configResult.ok ? [] : configResult.missing} />
        ) : checkingSession ? (
          <p className="loading">載入中…</p>
        ) : (
          <LoginPage client={supabase} />
        )}
      </>
    )
  }
}
