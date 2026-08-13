import { useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

type Props = {
  client: SupabaseClient
  session: Session
}

export default function HomePage({ client, session }: Props) {
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setSigningOut(true)
    setError(null)

    const { error: signOutError } = await client.auth.signOut()

    if (signOutError) {
      setError(signOutError.message)
      setSigningOut(false)
    }
    // 成功就由 App 嘅 onAuthStateChange 換返去登入頁。
  }

  return (
    <section className="card">
      <h2 className="card__title">主頁</h2>

      <div className="home__row">
        <span className="home__label">登入帳號</span>
        <span className="home__value">{session.user.email ?? '（冇電郵）'}</span>
      </div>

      <p className="home__empty">報價功能未開始做（P1 先做）。</p>

      {error && (
        <p className="notice notice--error" role="alert">
          登出失敗：{error}
        </p>
      )}

      <button
        className="button button--secondary"
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? '登出中…' : '登出'}
      </button>
    </section>
  )
}
