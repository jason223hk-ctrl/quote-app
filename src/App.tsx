import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configResult, supabase } from './lib/supabase'
import { LoginHeader } from './ui/shell'
import ConfigMissing from './components/ConfigMissing'
import LoginPage from './components/LoginPage'
import HomePage from './components/HomePage'
import './styles/app.css'

/**
 * 外殼結構照 tree-app-v7 `src/App.tsx`：
 * 冇環境變數 → 波浪頭 + 一句警告；未登入 → 波浪頭 + 登入卡；
 * 登入之後成個 app 交俾 HomePage（route + 底部導航）。
 */
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

  // 冇環境變數：一定要見到清楚訊息，唔可以白畫面。
  if (!configResult.ok || !supabase) {
    return (
      <div className="app">
        <LoginHeader />
        <div className="content">
          <ConfigMissing missing={configResult.ok ? [] : configResult.missing} />
        </div>
      </div>
    )
  }

  // 未 probe 完唔好 render 登入卡，否則 refresh 一下就好似要重新登入。
  if (checkingSession) {
    return (
      <div className="app">
        <LoginHeader />
        <div className="content">
          <div className="muted empty">載入中…</div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app">
        <LoginHeader />
        <div className="content">
          <LoginPage client={supabase} />
        </div>
      </div>
    )
  }

  return <HomePage client={supabase} session={session} />
}
