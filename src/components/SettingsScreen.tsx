import { useEffect, useState } from 'react'
import { clearStranded } from '../lib/clearStranded'
import {
  orphanNote,
  orphanPhotoCount,
  strandedConfirm,
  strandedCount,
  strandedNote,
} from '../lib/orphanPhotos'
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
  /** 向下拉刷新：重新攞工程清單。⛔ 唔傳就冇下拉。 */
  onRefresh?: () => Promise<unknown>
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
  onRefresh,
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
  /**
   * 「傳唔到、而且母單已經刪咗」嗰批（**乙類·卡死**）幾多張。
   *
   * ⭐⭐ 呢批同上面 `orphans`（甲類）⛔ **完全冇重疊**：
   *    甲類 ＝ 母單刪咗**但有雲端副本** ⇒ 安全，收埋，得一行細字。
   *    乙類 ＝ 母單刪咗**而且一份副本都冇** ⇒ ⛔ 永遠傳唔到，冇出路。
   *
   * ⚠️ 呢個數淨係用嚟決定「行出唔出、句嘢寫幾多」。
   *    ⛔ **真刪嗰陣唔會用佢** —— 撳落去嗰刻由頭再計一次
   *    （見 `src/lib/clearStranded.ts` 檔頭）。
   */
  const [stranded, setStranded] = useState(0)
  const [clearing, setClearing] = useState<'idle' | 'confirm' | 'busy'>('idle')
  const [clearError, setClearError] = useState<string | null>(null)
  /** 向下拉之後迫個孤兒數重數一次。⛔ 淨靠 `liveRecordIds` 唔夠 —— 佢冇變就唔會重跑。 */
  const [recount, setRecount] = useState(0)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const rows = await photos.listAll()
        const local = localStorageAvailable() ? await photoStore.listAll() : []
        if (!live) return
        setOrphans(orphanPhotoCount(rows, local, liveRecordIds))
        setStranded(strandedCount(local, rows, liveRecordIds))
      } catch (caught) {
        console.error('[quote-app] orphan photo count failed:', caught)
        // ⛔ 攞唔到就當零 ⇒ 成行唔出。⚠️ 保守方向：寧願冇得清，
        //    都唔好喺一個「我哋其實唔知」嘅狀態下擺粒真刪掣出嚟。
        if (live) {
          setOrphans(0)
          setStranded(0)
        }
      }
    })()
    return () => {
      live = false
    }
  }, [photos, liveRecordIds, recount])

  const orphanLine = orphanNote(orphans)
  const strandedLine = strandedNote(stranded)

  /**
   * 真刪。⛔ 撳落去嗰刻先由頭讀、由頭計 —— ⛔ 唔用畫面上面個數。
   * ⚠️ 由 render 到撳落去中間，背景重傳隨時傳成功咗一張。
   */
  async function handleClearStranded() {
    setClearing('busy')
    setClearError(null)
    const result = await clearStranded({
      listLocal: photoStore.listAll,
      listRows: photos.listAll,
      live: liveRecordIds,
      remove: photoStore.removeMany,
    })
    setClearError(result.blocked)
    setClearing('idle')
    // ⭐ 清完一定要重數 —— ⛔ 唔准喺本機自己減個數扮清咗
    //    （CLAUDE.md §2.6 同一條原則：以讀返嚟嗰份為準）。
    setRecount((n) => n + 1)
  }

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

      <ScrollBody
        testid="settings-scroll"
        compact
        onRefresh={async () => {
          await onRefresh?.()
          setRecount((n) => n + 1)
        }}
      >
        <section className="card">
          <h2 className="card__title">帳戶</h2>
          <div className="acct-row">
            <span className="acct-label">登入帳號</span>
            <span className="acct-val">{user.email || '（沒有電郵）'}</span>
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
                  {busy ? '登出中…' : '再點擊一次確認登出'}
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
            <span className="hub-sub">全公司共用。可在「客戶資料」重新選擇</span>
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
          <p className="muted soon">P4 才會做。這裡將來會放夾車、吊雞、升降台和人手的單價。</p>
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

          {/*
            ⭐⭐ 「清除無法上傳的相片」。**擺喺呢度係特登嘅**（Jason 2026-09-14 第 3 條）：
              · ⛔ 唔准擺喺底 bar 上面 —— 阿耀喺現場順手撞到就死
              · ⛔ 唔准擺喺同步頁 —— 同上
              · ⭐ 擺喺設定頁最底「診斷資料」，同上面甲類嗰行做一對：
                「已刪工程、有副本」（安全）／「已刪工程、冇副本」（可清）

            ⛔⛔ N 係零就**成段唔出**（連粒掣都冇）—— ⚠️ 唔係 disable。
                一粒平時就企喺度嘅真刪掣，遲早有人得閒撳。
          */}
          {strandedLine !== null && (
            <div className="danger-zone" data-testid="stranded-zone">
              <p className="note-box note-box--warn" data-testid="stranded-note">
                {/* ⚠️ 真機量出嚟改咗：本來寫「…工程已經刪咗。佢哋嘅工程冇咗，所以…」
                    —— 同一句嘢講咗兩次。⭐ 後半淨係加後果，⛔ 唔重複前提。 */}
                {strandedLine}，所以永遠都無法上傳。
              </p>

              {clearing === 'confirm' || clearing === 'busy' ? (
                <>
                  {/* ⛔⛔ 唔准縮成「確定嗎」—— 句嘢要寫出實數同後果。 */}
                  <p className="note-box note-box--warn" data-testid="stranded-confirm-text">
                    {strandedConfirm(stranded)}
                  </p>
                  <button
                    className="button button--danger"
                    type="button"
                    data-testid="stranded-confirm"
                    disabled={clearing === 'busy'}
                    onClick={() => void handleClearStranded()}
                  >
                    {clearing === 'busy' ? '清除中⋯' : `再點擊一次確認清除這 ${stranded} 張`}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={clearing === 'busy'}
                    onClick={() => setClearing('idle')}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  className="button button--secondary"
                  type="button"
                  data-testid="stranded-clear"
                  onClick={() => {
                    setClearError(null)
                    setClearing('confirm')
                  }}
                >
                  清除無法上傳的相片
                </button>
              )}

              {clearError !== null && (
                <p className="notice notice--error" role="alert" data-testid="stranded-error">
                  {clearError}
                </p>
              )}
            </div>
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
