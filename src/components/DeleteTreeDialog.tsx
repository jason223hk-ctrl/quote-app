import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  TREE_DELETE_BUSY,
  TREE_DELETE_CANCEL,
  TREE_DELETE_CANCEL_ON_RIGHT,
  TREE_DELETE_CONFIRM,
  TREE_DELETE_NOTE,
  TREE_DELETE_TITLE,
  treeDeleteName,
} from '../lib/deleteTreeDialog'
import ErrorNotice from '../ui/ErrorNotice'
import { Icon, ICONS } from '../ui/Icon'

/**
 * 刪樹確認 —— 樹木頁右上角粒 `×` 用。點解要有，見 `src/lib/deleteTreeDialog.ts` 檔頭。
 *
 * ⭐ **骨架、CSS 全部用返刪工程彈窗（`DeleteRecordDialog`）嗰套 `.sheet`**，
 *    ⛔ 冇新 class、⛔ 冇新 CSS ⇒ 兩粒掣座標固定（`.sheet__body` 寫死高度）、
 *    一開 focus「取消」、撳背景唔會關、Escape 關、portal 去 `document.body`
 *    —— 嗰邊每一條教訓呢度自動有齊。
 *
 * ⚠️ **AI 代揀，待 Jason 確認**：用彈窗而唔係「粒掣變『再點擊一次確認刪除』」。
 *    理由：粒 `×` 喺頂部細細粒，旁邊冇位擺「取消」；而彈窗嗰套係 Jason
 *    2026-09-14 已經喺刪工程度撳過、批咗嘅。
 */
export default function DeleteTreeDialog({
  treeNo,
  recordName,
  onCancel,
  onConfirm,
}: {
  treeNo: string
  recordName: string
  onCancel: () => void
  /** ⛔ 失敗要 throw —— 個訊息會原封不動出喺彈窗入面。 */
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  // ⭐ 一開就 focus「取消」—— ⛔ 唔係 focus 危險嗰粒。
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (caught) {
      // ⛔⛔ 一定要出聲 —— 呢個彈窗存在嘅一半理由就係舊嗰粒 `×` 刪唔到都冇聲。
      console.error('[quote-app] delete tree failed:', caught)
      setError(caught instanceof Error ? caught.message : String(caught))
      setBusy(false)
    }
  }

  const cancel = (
    <button
      ref={cancelRef}
      className="button sheet__keep"
      type="button"
      data-testid="tree-delete-cancel"
      disabled={busy}
      onClick={onCancel}
    >
      {TREE_DELETE_CANCEL}
    </button>
  )
  // ⛔ 唔用 `void run()`：`run()` 自己 catch 晒，但呢度照樣接多一層，
  //    ⛔ 唔靠「我保證佢唔會 reject」（開發紀錄 附錄 D3）。
  const confirm = (
    <button
      className="button sheet__go"
      type="button"
      data-testid="tree-delete-confirm"
      disabled={busy}
      onClick={() => {
        run().catch((caught: unknown) => {
          console.error('[quote-app] delete tree: unexpected', caught)
        })
      }}
    >
      {busy ? TREE_DELETE_BUSY : TREE_DELETE_CONFIRM}
    </button>
  )

  const sheet = (
    <div className="sheet-scrim" data-testid="tree-delete-scrim">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-del-title tree-del-name"
        data-testid="tree-delete-dialog"
      >
        <h2 className="sheet__head" id="tree-del-title">
          <Icon name={ICONS.del} />
          {TREE_DELETE_TITLE}
        </h2>

        <div className="sheet__body" data-testid="tree-delete-body">
          <div className="sheet__name" id="tree-del-name">
            {treeDeleteName(treeNo)}
          </div>
          <div className="sheet__date">{recordName}</div>
          <p className="sheet__truth">{TREE_DELETE_NOTE}</p>
          {/* ⛔ 一定要 `ErrorNotice`：上面個框係寫死高度嘅捲動框，
              一行 `<p>` 會出咗喺框底之外睇唔到（PR #17 嗰單）。 */}
          <ErrorNotice message={error} testId="tree-delete-error" />
        </div>

        <div className="sheet__acts">
          {TREE_DELETE_CANCEL_ON_RIGHT ? (
            <>
              {confirm}
              {cancel}
            </>
          ) : (
            <>
              {cancel}
              {confirm}
            </>
          )}
        </div>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body)
}
