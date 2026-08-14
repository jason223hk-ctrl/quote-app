import { useState } from 'react'
import { configResult } from '../lib/supabase'
import { BotanicalHeader, ScrollBody, UserPill, type UserInfo } from '../ui/shell'
import { VERSION_LABEL } from '../ui/version'

type Props = {
  user: UserInfo
  userId: string
  recordCount: number
  onSignOut: () => Promise<unknown>
}

/**
 * 08 設定。照 tree-app-v7 `SettingsScreen` 嘅殼（ScrollBody，冇浮起嘅統計卡）。
 * 登出用畫面內兩段式確認，唔用瀏覽器彈窗（P1 定落嘅規矩）。
 */
export default function SettingsScreen({ user, userId, recordCount, onSignOut }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const host = configResult.ok ? new URL(configResult.config.url).host : '（未設定）'

  async function handleSignOut() {
    setBusy(true)
    await onSignOut()
    setBusy(false)
  }

  return (
    <>
      <BotanicalHeader
        left={<span className="page-title">設定</span>}
        right={<UserPill user={user} />}
      />

      <ScrollBody testid="settings-scroll">
        <section className="card">
          <h2 className="card__title">帳戶</h2>
          <div className="acct-row">
            <span className="acct-label">登入帳號</span>
            <span className="acct-val">{user.email || '（冇電郵）'}</span>
          </div>
          <div className="acct-row">
            <span className="acct-label">User ID</span>
            <span className="acct-val mono">{userId}</span>
          </div>

          <div className="danger-zone">
            {/* 兩段式確認，唔用 window.confirm */}
            {confirming ? (
              <>
                <button
                  className="button button--danger"
                  type="button"
                  data-testid="signout-confirm"
                  disabled={busy}
                  onClick={handleSignOut}
                >
                  {busy ? '登出中…' : '再撳一次確認登出'}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                className="button button--secondary"
                type="button"
                data-testid="signout"
                onClick={() => setConfirming(true)}
              >
                登出
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <h2 className="card__title">單價設定</h2>
          <p className="muted soon">P4 先做。呢度將來會放夾車、吊雞、升降台同人手嘅單價。</p>
        </section>

        <section className="card">
          <h2 className="card__title">診斷資料</h2>
          <div className="acct-row">
            <span className="acct-label">版本</span>
            <span className="acct-val mono" data-testid="settings-version">
              {VERSION_LABEL}
            </span>
          </div>
          <div className="acct-row">
            <span className="acct-label">Supabase</span>
            <span className="acct-val mono">{host}</span>
          </div>
          <div className="acct-row">
            <span className="acct-label">環境變數</span>
            <span className="acct-val">{configResult.ok ? '已設定' : '未設定'}</span>
          </div>
          <div className="acct-row">
            <span className="acct-label">已載入工程</span>
            <span className="acct-val">{recordCount}</span>
          </div>
        </section>
      </ScrollBody>
    </>
  )
}
