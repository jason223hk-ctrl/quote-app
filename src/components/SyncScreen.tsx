import { useCallback, useEffect, useState } from 'react'
import type { PhotosApi, QuotePhoto } from '../lib/photos'
import type { QuoteRecord } from '../lib/records'
import type { TreesApi } from '../lib/trees'
import { splitOrphanRows } from '../lib/orphanPhotos'
import { photoStore } from '../lib/photoStore'
import type { PendingPhoto } from '../lib/photoUpload'
import { stuckAdvice, stuckLocal, stuckRaw } from '../lib/stuckPhotos'
import {
  allDone,
  byRecord,
  lastSyncedAt,
  photoSyncState,
  photoWhere,
  syncAdvice,
  syncCounts,
  treeNoMap,
  type SyncCounts,
} from '../lib/sync'
import { BotanicalHeader, ScrollBody } from '../ui/shell'

type Props = {
  photos: PhotosApi
  trees: TreesApi
  records: QuoteRecord[]
  /**
   * 而家仲攞得返嘅工程 id。⛔ `null` ＝ 未載完／攞唔到 ⇒ **乜都唔隔走**。
   * 見 `src/lib/orphanPhotos.ts`。
   */
  liveRecordIds: Set<string> | null
  onOpenRecord: (recordId: string) => void
  /**
   * 向下拉嗰陣即刻再試傳一次相（Jason 2026-09-13 第 4 條：**佢最想要嘅就係呢個**）。
   * ⛔ 唔傳都照刷新得到，淨係少咗「即刻再試」嗰半。
   */
  onRetryUploads?: () => Promise<unknown>
  /**
   * 部機（IndexedDB）嗰批相。⛔ 唔傳就用返 `photoStore.listAll`。
   *
   * ⭐ 出咗做 prop 淨係為咗對數個殼同測試可以餵一批定死嘅資料入嚟，
   *    ⛔ 唔係俾人換一條第二嘅讀取路 —— 真 app 一定係 `photoStore`。
   */
  listLocal?: () => Promise<PendingPhoto[]>
}

/**
 * 同步頁。規格：`docs/P3f-全app版面-實作計劃.md` §3.10。
 *
 * ⛔⛔ **零粒掣、零個彈窗、零個 admin 限制**（跟 tree app）。
 *    冇重試掣、冇確認、冇 gate —— 呢一版淨係「睇」。
 *
 * ⛔⛔ 原型嗰版係樣板，三個數係假數，佢自己標住「未接後端」。
 *    呢度**全部接返真嘢**：數唔到就講明數唔到，⛔ 唔准出一個 0 扮冇事。
 *
 * ⚠️ 「待同步」同「同步失敗」⛔ 唔可以溝埋一齊：
 *    待同步 ＝ 系統會自己搞掂，人唔使做嘢；失敗 ＝ 要人睇。
 */
export default function SyncScreen({
  photos,
  trees,
  records,
  liveRecordIds,
  onOpenRecord,
  onRetryUploads,
  listLocal = photoStore.listAll,
}: Props) {
  const [rows, setRows] = useState<QuotePhoto[] | null>(null)
  /** 部機嗰批。⛔ 讀唔到就當空 —— ⚠️ 讀唔到唔應該令成版嘢死。 */
  const [local, setLocal] = useState<PendingPhoto[]>([])
  const [error, setError] = useState<string | null>(null)
  /** ⛔ null ＝ 攞唔到樹木清單。⛔ 唔准當佢係「冇樹」—— 咁會靜靜咁出「（未填樹牌）」。 */
  const [treeNos, setTreeNos] = useState<Record<string, string> | null>(null)

  const load = useCallback(async () => {
    setError(null)
    // ⭐ 兩邊分開接：雲端死咗**唔准連部機嗰批都唔出** ——
    //    ⚠️ 2026-09-05 就係咁中過一次（`photoRefresh.ts` 有記低）。
    try {
      setLocal(await listLocal())
    } catch (caught) {
      console.error('[quote-app] sync: cannot read local photos:', caught)
      setLocal([])
    }
    try {
      setRows(await photos.listAll())
    } catch (caught) {
      setRows(null)
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [photos, listLocal])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 向下拉 ＝ **刷新 ＋ 即刻再試傳一次**。
   *
   * ⭐ 次序係特登嘅：**先試傳，後刷新** —— 咁樣傳到嗰張即刻反映喺個數度，
   * ⛔ 唔會出現「傳完但畫面仲寫住失敗」。
   * ⛔ 試傳死咗都要照刷新（`catch`），⚠️ 唔係嘅話拉極個畫面都唔會更新。
   */
  const refresh = useCallback(async () => {
    if (onRetryUploads) {
      try {
        await onRetryUploads()
      } catch (caught) {
        console.error('[quote-app] sync pull retry failed:', caught)
      }
    }
    await load()
  }, [load, onRetryUploads])

  // 樹牌號淨係為咗喺失敗清單度講清楚係邊棵樹。⛔ 攞唔到都唔准當成個頁面壞咗。
  useEffect(() => {
    let active = true
    void trees
      .listAll()
      .then((list) => {
        if (active) setTreeNos(treeNoMap(list))
      })
      .catch(() => {
        if (active) setTreeNos(null)
      })
    return () => {
      active = false
    }
  }, [trees])

  /**
   * ⭐ 母單已經刪咗嗰啲相，⛔ 唔入三個數、⛔ 唔入失敗清單、⛔ 唔出喺逐單嗰度
   * （Jason 2026-09-12 拍板）。
   *
   * ⛔⛔ 佢哋**唔係就咁消失** —— 設定頁最底有一行「另有 N 張相屬於已刪工程」，
   *    ⭐ 嗰行就係「唔重試」同「靜靜咁冇咗」之間嘅分別。
   */
  const visible = rows === null ? null : splitOrphanRows(rows, liveRecordIds).kept

  const counts: SyncCounts = visible ? syncCounts(visible) : { synced: 0, pending: 0, failed: 0 }
  const failed = visible ? visible.filter((row) => photoSyncState(row) === 'failed') : []
  const last = visible ? lastSyncedAt(visible) : null
  const nameOf = (id: string) => records.find((r) => r.id === id)?.name ?? '（檢索不到工程）'

  /**
   * ⭐⭐ 部機有、但**資料庫一行都冇**嗰啲。呢啲相以前喺呢版**完全睇唔到** ——
   *    底 bar 數住佢哋（「未上載 N 張」），而呢版淨係讀 DB 行 ⇒ 一張都揾唔到。
   *    ⚠️ Jason 2026-09-14 原話：「一直存在、唔識消失」。
   *
   * ⛔ `rows === null`（問唔到 DB）嗰陣 `stuckLocal` 回空 —— ⛔ 唔准報假警。
   * ⛔ 亦都唔准入上面三個數：嗰三個數係講 **Google Drive** 同步，
   *    ⚠️ 「未入到資料庫」係另一件事，溝埋一齊就兩樣都講唔清。
   */
  const stuck = stuckLocal(local, rows)

  return (
    <>
      <BotanicalHeader compact="big" left={<span className="page-title">同步</span>} />

      <ScrollBody testid="sync-scroll" compact onRefresh={refresh}>
        {/* Hero：冇卡邊。⛔ 未攞到資料之前唔准講「已自動同步」。 */}
        <div className="sync-hero">
          {rows === null ? (
            <div className="sync-hero__title">{error === null ? '載入中…' : '同步狀態獲取失敗'}</div>
          ) : (
            <>
              <div className="sync-hero__title">
                {allDone(counts) ? '已自動同步' : '尚未完成同步'}
              </div>
              {/* ⚠️ 副題只喺「已自動同步」先出（§3.10）。 */}
              {allDone(counts) && last !== null && (
                <div className="sync-hero__sub">最後同步時間：{last.slice(0, 16).replace('T', ' ')}</div>
              )}
            </>
          )}
        </div>

        {error !== null && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}

        <section className="card card--bare sync-overview">
          <h2 className="card__title">Google Drive 同步總覽</h2>
          <div className="sync-three">
            <div className="sync-three__cell">
              <span className="sync-three__n">{counts.synced}</span>
              <span className="sync-three__k">已同步</span>
            </div>
            <div className="sync-three__cell">
              <span className="sync-three__n sync-three__n--wait">{counts.pending}</span>
              <span className="sync-three__k">待同步</span>
            </div>
            <div className="sync-three__cell">
              <span className="sync-three__n sync-three__n--fail">{counts.failed}</span>
              <span className="sync-three__k">同步失敗</span>
            </div>
          </div>

          {counts.pending > 0 && (
            <p className="note-box">
              「待同步」無需處理 —— 相片已安全存入雲端，系統會自動複製到 Google
              Drive（最多需時 10 分鐘）。
            </p>
          )}

          {counts.failed > 0 && (
            <p className="note-box note-box--warn">
              有 {counts.failed} 張未能複製到 Google Drive。原因列於下方 —— 無需前往其他頁面查看。
            </p>
          )}

          {failed.map((row) => {
            const advice = syncAdvice(row)
            return (
              <div className="sync-fail" key={row.id}>
                <div className="sync-fail__where">
                  ⚠️ {nameOf(row.record_id)}・
                  {photoWhere(row, row.tree_id === null ? null : (treeNos?.[row.tree_id] ?? null))}
                </div>
                {/* ⭐ 第二行答「你使唔使做嘢」。永久性錯誤出紅色。 */}
                <div
                  className={`sync-fail__advice${advice.permanent ? ' sync-fail__advice--bad' : ''}`}
                >
                  {advice.text}
                </div>
                {/* ⛔ 錯誤原文全文照出、換行、⛔ 唔准截 —— 截咗就查唔到。 */}
                <div className="sync-fail__raw">
                  錯誤原文：{row.drive_error.trim() !== '' ? row.drive_error : row.r2_error}
                </div>
              </div>
            )
          })}
        </section>

        {stuck.length > 0 && (
          <>
            <div className="sync-sect">仍在本裝置，未寫入資料庫</div>
            <section className="card card--bare">
              <p className="note-box note-box--warn">
                這 {stuck.length} 張相片仍在本裝置，⛔ 不會丟失，但未能寫入資料庫，
                所以上面三個數字不會計算它們。逐張的原因列在下面。
              </p>
              {stuck.map((item) => {
                const advice = stuckAdvice(item)
                const raw = stuckRaw(item)
                return (
                  <div className="sync-fail" key={item.operationId}>
                    <div className="sync-fail__where">
                      ⚠️ {nameOf(item.recordId)}・
                      {photoWhere(
                        { tree_id: item.treeId, mitigation: item.mitigation },
                        item.treeId === null ? null : (treeNos?.[item.treeId] ?? null),
                      )}
                    </div>
                    <div
                      className={`sync-fail__advice${advice.permanent ? ' sync-fail__advice--bad' : ''}`}
                    >
                      {advice.text}
                    </div>
                    {/* ⛔ 原文全文照出、⛔ 唔准截。冇原文（仲未試過傳）就唔出呢行。 */}
                    {raw !== '' && <div className="sync-fail__raw">錯誤原文：{raw}</div>}
                  </div>
                )
              })}
            </section>
          </>
        )}

        <div className="sync-sect">專案同步狀態</div>

        {visible !== null && byRecord(visible).length === 0 && (
          <div className="muted empty">未有專案</div>
        )}

        {visible !== null &&
          byRecord(visible).map((item) => (
            <button
              className="hub-row sync-row"
              key={item.recordId}
              onClick={() => onOpenRecord(item.recordId)}
            >
              <span className="hub-main">
                <span className="hub-title sync-name">{nameOf(item.recordId)}</span>
              </span>
              <span
                className={`sync-stamp${
                  item.counts.failed > 0
                    ? ' sync-stamp--fail'
                    : item.counts.pending > 0
                      ? ' sync-stamp--wait'
                      : ''
                }`}
              >
                {item.counts.failed > 0
                  ? `⚠️ ${item.counts.failed} 張失敗`
                  : item.counts.pending > 0
                    ? `${item.counts.pending} 張待同步`
                    : '✓ 已同步'}
              </span>
            </button>
          ))}
      </ScrollBody>
    </>
  )
}
