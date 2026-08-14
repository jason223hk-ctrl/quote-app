import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Props = {
  client: SupabaseClient
}

/** 登入卡。結構同 class 照 tree-app-v7 `LoginCard`（.card.form-card + 真 <form>）。 */
export default function LoginPage({ client }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !submitting && !!email && !!password

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    const { error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setSubmitting(false)
      return
    }
    // 成功之後由 App 嘅 onAuthStateChange 換畫面。
  }

  return (
    <form className="card form-card" onSubmit={handleSubmit} noValidate>
      <h2>登入</h2>

      <label className="field">
        <span className="field__label">電郵</span>
        <input
          className="field__input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          enterKeyHint="next"
          value={email}
          disabled={submitting}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">密碼</span>
        <input
          className="field__input"
          type="password"
          name="password"
          autoComplete="current-password"
          enterKeyHint="go"
          value={password}
          disabled={submitting}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error && (
        <p className="notice notice--error" role="alert">
          登入失敗：{error}
        </p>
      )}

      <button className="button" type="submit" disabled={!canSubmit}>
        {submitting ? '登入中…' : '登入'}
      </button>
    </form>
  )
}
