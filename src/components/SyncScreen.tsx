import { useCallback, useEffect, useState } from 'react'
import type { PhotosApi, QuotePhoto } from '../lib/photos'
import type { QuoteRecord } from '../lib/records'
import type { TreesApi } from '../lib/trees'
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
  onOpenRecord: (recordId: string) => void
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
export default function SyncScreen({ photos, trees, records, onOpenRecord }: Props) {
  const [rows, setRows] = useState<QuotePhoto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** ⛔ null ＝ 攞唔到樹木清單。⛔ 唔准當佢係「冇樹」—— 咁會靜靜咁出「（未填樹牌）」。 */
  const [treeNos, setTreeNos] = useState<Record<string, string> | null>(null)

  const load = useCallback(() => {
    setError(null)
    void photos
      .listAll()
      .then(setRows)
      .catch((caught: Error) => {
        setRows(null)
        setError(caught.message)
      })
  }, [photos])

  useEffect(load, [load])

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

  const counts: SyncCounts = rows ? syncCounts(rows) : { synced: 0, pending: 0, failed: 0 }
  const failed = rows ? rows.filter((row) => photoSyncState(row) === 'failed') : []
  const last = rows ? lastSyncedAt(rows) : null
  const nameOf = (id: string) => records.find((r) => r.id === id)?.name ?? '（搵唔到工程）'

  return (
    <>
      <BotanicalHeader compact="big" left={<span className="page-title">同步</span>} />

      <ScrollBody testid="sync-scroll" compact>
        {/* Hero：冇卡邊。⛔ 未攞到資料之前唔准講「已自動同步」。 */}
        <div className="sync-hero">
          {rows === null ? (
            <div className="sync-hero__title">{error === null ? '載入中…' : '攞唔到同步狀態'}</div>
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

        <div className="sync-sect">專案同步狀態</div>

        {rows !== null && byRecord(rows).length === 0 && (
          <div className="muted empty">未有專案</div>
        )}

        {rows !== null &&
          byRecord(rows).map((item) => (
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
