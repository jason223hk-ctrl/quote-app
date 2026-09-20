import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PhotosApi } from '../lib/photos'
import type { QuoteRecord } from '../lib/records'
import type { QuoteTree, TreesApi } from '../lib/trees'
import {
  activePill,
  applyPill,
  buildShots,
  exportedTrees,
  selectedShots,
  toggleShot,
  toggleTree,
  treeCountText,
  type ExportShot,
  type PillKind,
  type Selection,
} from '../lib/pdfModel'
import { fetchPhotoBytes } from '../lib/photoTransport'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'
import { Icon, ICONS } from '../ui/Icon'

type Props = {
  trees: TreesApi
  photos: PhotosApi
  accessToken: string
  record: QuoteRecord
  onBack: () => void
}

const PILLS: [PillKind, string][] = [
  ['client', '客戶'],
  ['crew', '同事'],
  ['clear', '全部清除'],
]

/**
 * 匯出 PDF（Jason 2026-08-25 定稿四，取代咗「揀相」嗰一版）。
 *
 * ⛔⛔ **冇預覽頁**。撳「匯出 PDF」直接出份嘢。
 * ⛔⛔ 匯出之後**唔會問**「轉為已報價」（十條-拍板第 3 條）——
 *    舊寫法會將一單「已中標」降返「已報價」。狀態一律喺工程頁自己改。
 * ⛔⛔ 三格資料改咗**只影響今次 PDF**，⛔ 唔會寫返工程本身。
 * ⛔⛔ 環境相唔入 PDF；成本同收客價永遠唔上 PDF。
 */
export default function ExportPdfScreen({ trees, photos, accessToken, record, onBack }: Props) {
  const [shots, setShots] = useState<ExportShot[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>({
    treeIds: new Set(),
    photoIds: new Set(),
  })
  const [treeRows, setTreeRows] = useState<QuoteTree[]>([])
  const [open, setOpen] = useState<Set<string>>(new Set())

  const [name, setName] = useState(record.name)
  const [date, setDate] = useState(record.record_date ?? '')
  const [count, setCount] = useState('')
  /** ⛔ 你自己改過個數量格之後，就唔准再幫你覆寫 —— 嗰格本來就係畀你改嘅。 */
  const [countTouched, setCountTouched] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [treeList, photoList] = await Promise.all([
        trees.list(record.id),
        photos.listByRecord(record.id),
      ])
      const built = buildShots(treeList, photoList)
      setTreeRows(treeList)
      setShots(built)
      // 開版預設「客戶」：全景相已經算揀咗，工序相要自己揀（Jason 2026-08-25）。
      setSelection(applyPill('client', built))
    } catch (caught) {
      setShots(null)
      setLoadError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [trees, photos, record.id])

  useEffect(() => {
    void load()
  }, [load])

  const picked = useMemo(
    () => (shots === null ? [] : selectedShots(shots, selection)),
    [shots, selection],
  )

  const exported = useMemo(
    () => (shots === null ? [] : exportedTrees(treeRows, shots, selection)),
    [treeRows, shots, selection],
  )

  /**
   * 抬頭第三行預設值。揀樹／揀相一改就即刻跟住郁。
   * ⛔ 但你自己改過個格之後就唔准再覆寫（`countTouched`）—— 嗰格本來就係畀你改嘅。
   */
  const autoCount = useMemo(() => treeCountText(exported), [exported])

  const pill = shots === null ? null : activePill(selection, shots)

  function pick(kind: PillKind) {
    if (shots === null) return
    setSelection(applyPill(kind, shots))
  }

  async function doExport() {
    if (shots === null || picked.length === 0) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      // ⛔ 攞唔到嘅相唔准靜靜跳過 —— 數返出嚟，喺畫面講。
      const bytes = new Map<string, ArrayBuffer>()
      const failed: string[] = []
      for (const shot of picked) {
        try {
          bytes.set(shot.photoId, await fetchPhotoBytes(accessToken, shot.photoId))
        } catch {
          failed.push(shot.file)
        }
      }
      if (failed.length === picked.length) {
        throw new Error('一張相都攞唔到，冇嘢可以匯出。請確認有網絡，再試一次。')
      }

      // ⛔ pdf-lib ＋ fontkit 成 1.1MB，⛔ 唔可以每次開 app 都載 ——
      //    99% 嘅使用（影相、填資料）由頭到尾都唔會撳呢粒掣。⇒ 撳咗先攞。
      const { buildPdf } = await import('../lib/pdfReport')
      const blob = await buildPdf(picked, bytes, { name, date, count: countTouched ? count : autoCount })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(name || record.name || '報價').replace(/[\\/:*?"<>|]/g, '_')}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      setDone(
        failed.length === 0
          ? `匯出咗 ${picked.length} 張相。`
          : `已匯出 ${picked.length - failed.length} 張相片。⚠️ 以下 ${failed.length} 張獲取失敗：${failed.join('、')}。請截圖並聯絡 Jason。`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <BotanicalHeader
        compact
        left={<HeaderTitle back={<BackChip onClick={onBack} />} name="匯出 PDF" sub={record.name} />}
      />

      <ScrollBody testid="export-scroll" compact>
        <p className="note-box">
          此資料只顯示於本次 PDF 的頁首右上角，不會更改工程本身。留空的項目不會顯示。環境相不會加入
          PDF。
        </p>

        {loadError !== null && (
          <p className="notice notice--error" role="alert">
            攞唔到相片清單：{loadError}{' '}
            <button className="link-button" type="button" onClick={() => void load()}>
              再試
            </button>
          </p>
        )}

        <section className="card">
          <label className="field">
            <span className="field__label">工程名稱</span>
            <input
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">日期</span>
            <input
              className="field__input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">樹木數目</span>
            <input
              className="field__input"
              value={countTouched ? count : autoCount}
              onChange={(event) => {
                setCountTouched(true)
                setCount(event.target.value)
              }}
            />
          </label>
        </section>

        <section className="card">
          <h2 className="card__title">
            選擇樹木{' '}
            <span className="card__title-note">
              （{exported.length}/{treeRows.length} 棵、{picked.length} 張相）
            </span>
          </h2>

          <div className="chips chips--in-card">
            {PILLS.map(([kind, label]) => (
              <button
                key={kind}
                className={`chip2${pill === kind ? ' on' : ''}`}
                type="button"
                onClick={() => pick(kind)}
              >
                {label}
              </button>
            ))}
          </div>

          {shots !== null &&
            treeRows.map((row) => {
              const mine = shots.filter((shot) => shot.treeId === row.id)
              const empty = mine.length === 0
              const on = selection.treeIds.has(row.id)
              const isOpen = open.has(row.id)
              const n = mine.filter((shot) => selection.photoIds.has(shot.photoId)).length
              return (
                <div key={row.id}>
                  <div
                    className={`ex-row${on ? ' ex-row--on' : ''}${empty ? ' ex-row--empty' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setOpen((current) => {
                        const next = new Set(current)
                        if (next.has(row.id)) next.delete(row.id)
                        else next.add(row.id)
                        return next
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click()
                    }}
                  >
                    <button
                      className={`ex-box${on ? ' ex-box--on' : ''}`}
                      type="button"
                      aria-label={on ? '唔要呢棵樹' : '要呢棵樹'}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelection((current) => toggleTree(current, row.id, shots))
                      }}
                    >
                      {on ? '✓' : ''}
                    </button>
                    <span className="ex-name">{row.tree_no || '—'}</span>
                    {/* ⛔ 一張相都冇嘅樹剔唔到 —— 剔到嘅話 PDF 出嚟根本冇嗰棵樹。 */}
                    <span className="ex-count">{empty ? '未有相片' : `${n} 張`}</span>
                  </div>
                  {isOpen && (
                    <div className="ex-shots">
                      {empty ? (
                        <span className="muted">此樹尚未拍攝相片</span>
                      ) : (
                        mine.map((shot) => (
                          <button
                            key={shot.photoId}
                            className={`ex-cell${selection.photoIds.has(shot.photoId) ? ' ex-cell--on' : ''}`}
                            type="button"
                            onClick={() =>
                              setSelection((current) => toggleShot(current, shot, shots))
                            }
                          >
                            <span className="ex-tick">
                              {selection.photoIds.has(shot.photoId) ? '✓' : ''}
                            </span>
                            <span className="ex-cap">
                              {shot.file.slice(String(row.tree_no).length + 1)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}

          {shots !== null && treeRows.length === 0 && <div className="muted empty">尚未加樹</div>}
        </section>

        {error !== null && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {done !== null && (
          <p className="notice notice--warning" role="status">
            {done}
          </p>
        )}

        {/* 留位畀最底兩粒掣，⛔ 否則最後一棵樹會俾佢遮住。 */}
        <div className="export-scroll-pad" aria-hidden="true" />
      </ScrollBody>

      <div className="export-bar">
        <button className="button button--secondary" type="button" onClick={onBack}>
          取消
        </button>
        <button
          className="button"
          type="button"
          disabled={busy || picked.length === 0}
          onClick={() => void doExport()}
        >
          <Icon name={ICONS.exportPdf} />
          {busy ? '砌緊…' : '匯出 PDF'}
        </button>
      </div>
    </>
  )
}
