import { useEffect, useState } from 'react'
import { orphanNote, orphanPhotoCount } from '../lib/orphanPhotos'
import { photoStore, localStorageAvailable } from '../lib/photoStore'
import type { PhotosApi } from '../lib/photos'
import { configResult } from '../lib/supabase'
import { BotanicalHeader, ScrollBody, UserPill, type UserInfo } from '../ui/shell'
import { Icon, ICONS } from '../ui/Icon'
import { VERSION_LABEL } from '../ui/version'

type Props = {
  user: UserInfo
  userId: string
  recordCount: number
  photos: PhotosApi
  /** ⛔ `null` ＝ 未載完／攞唔到工程清單。見 `src/lib/orphanPhotos.ts`。 */
  liveRecordIds: Set<string> | null
  onOpenPrices: () => void
  onOpenClients: () => void
  onSignOut: () => Promise<unknown>
}

/**
 * 08 設定。照 tree-app-v7 `SettingsScreen` 嘅殼（ScrollBody，冇浮起嘅統計卡）。
 * 登出用畫面內兩段式確認，唔用瀏覽器彈窗（P1 定落嘅規矩）。
 */
export default function SettingsScreen({
  user,
  userId,
  recordCount,
  photos,
  liveRecordIds,
  onOpenPrices,
  onOpenClients,
  onSignOut,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  /**
   * 「另有 N 張相屬於已刪工程」個 N。
   *
   * ⛔⛔ 呢行**唔係警告**，係一行俾 Jason 查嘅細字（Jason 2026-09-12 講明）——
   *    ⛔ 唔紅、⛔ 冇「需要處理」、⛔ 冇得撳走、⛔ N 係零就成行唔出。
   *
   * ⭐ 佢存在嘅唯一理由：**甲類**孤兒相（母單刪咗＋已經有雲端副本）
   *    唔會再出喺同步頁 —— 如果連呢行都冇，佢哋就係**真係靜靜咁冇咗**。
   *
   * ⛔⛔ **乙類⛔ 唔會喺呢個數入面**（母單刪咗但一份雲端副本都冇）——
   *    佢哋仲喺「未上載 N 張」同同步頁度企硬，⭐ 數兩次反而會令人
   *    以為有兩批唔同嘅嘢。見 `src/lib/orphanPhotos.ts` 檔頭。
   *
   * ⚠️ 攞唔到就當零 —— ⛔ 唔准出一個估出嚟嘅數。
   */
  const [orphans, setOrphans] = useState(0)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const rows = await photos.listAll()
        const local = localStorageAvailable() ? await photoStore.listAll() : []
        if (live) setOrphans(orphanPhotoCount(rows, local, liveRecordIds))
      } catch (caught) {
        console.error('[quote-app] orphan photo count failed:', caught)
        if (live) setOrphans(0)
      }
    })()
    return () => {
      live = false
    }
  }, [photos, liveRecordIds])

  const orphanLine = orphanNote(orphans)

  const host = configResult.ok ? new URL(configResult.config.url).host : '（未設定）'

  async function handleSignOut() {
    setBusy(true)
    await onSignOut()
    setBusy(false)
  }

  return (
    <>
      <BotanicalHeader
        compact="big"
        left={<span className="page-title">設定</span>}
        right={<UserPill user={user} />}
      />

      <ScrollBody testid="settings-scroll" compact>
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

        <button className="hub-row" data-testid="settings-clients" onClick={onOpenClients}>
          <span className="hub-ic">
            <Icon name={ICONS.customerBook} />
          </span>
          <span className="hub-main">
            <span className="hub-title">客戶簿</span>
            <span className="hub-sub">全公司共用。喺「客戶資料」揀得返</span>
          </span>
          <span className="hub-chev">
            <Icon name={ICONS.chevron} />
          </span>
        </button>

        <button className="hub-row" data-testid="settings-prices" onClick={onOpenPrices}>
          <span className="hub-ic">
            <Icon name={ICONS.unitPrice} />
          </span>
          <span className="hub-main">
            <span className="hub-title">單價設定</span>
            <span className="hub-sub">報價時自動套用</span>
          </span>
          <span className="hub-chev">
            <Icon name={ICONS.chevron} />
          </span>
        </button>

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

          {/* ⛔ N 係零就成行唔出 —— 見上面 `orphans` 嗰段。 */}
          {orphanLine !== null && (
            <p className="muted soon" data-testid="orphan-note">
              {orphanLine}
            </p>
          )}
          <div className="acct-row">
            <span className="acct-label">已載入工程</span>
            <span className="acct-val">{recordCount}</span>
          </div>
        </section>
      </ScrollBody>
    </>
  )
}
