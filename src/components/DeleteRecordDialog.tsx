import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CANCEL_ON_RIGHT,
  DELETE_DIALOG_BUSY,
  DELETE_DIALOG_CANCEL,
  DELETE_DIALOG_CONFIRM,
  deleteDialogTitle,
  deleteDialogTruth,
} from '../lib/deleteDialog'
import { deleteUnsyncedWarning, unsyncedInRecord } from '../lib/orphanPhotos'
import { localStorageAvailable, photoStore } from '../lib/photoStore'
import type { PendingPhoto } from '../lib/photoUpload'
import type { QuoteRecord } from '../lib/records'

/**
 * 刪工程確認 —— **貼住畫面底嘅彈窗**（Jason 2026-09-14 推過原型之後拍板用彈窗）。
 *
 * ⭐⭐ **點解係「貼住畫面底」而唔係「畫面中間」**：
 *    2026-08-11 tree app 嗰單真實誤刪，成因係**粒掣會郁**（內容變長 ⇒ 超出範圍 ⇒
 *    掣換咗位）。貼住底嘅話，**兩粒掣嘅座標由畫面底決定，⛔ 同內容幾長完全無關**。
 *    見 `src/lib/deleteDialog.ts` 檔頭嘅完整經過。
 *
 * ⛔⛔ **唔用 `<dialog>` element**：⚠️ 佢自己帶住一套 UA 樣式（置中、
 *    `max-height: calc(100% - 6px - 2em)`），要逐條拆返，而拆漏一條就正正係
 *    「粒掣郁咗」嗰類 bug。⭐ 呢度全部 CSS 自己寫死，⛔ 冇任何一條靠瀏覽器預設。
 *
 * ⛔ 亦都唔用 `window.confirm`（CLAUDE.md §2.5）。
 */
export default function DeleteRecordDialog({
  record,
  onCancel,
  onConfirm,
  listLocal = photoStore.listByRecord,
}: {
  record: QuoteRecord
  onCancel: () => void
  /** ⛔ 失敗要 throw —— 個訊息會原封不動出喺彈窗入面。 */
  onConfirm: () => Promise<void>
  /**
   * 部機嗰批相。⛔ 唔傳就用 `photoStore.listByRecord`。
   * ⭐ 出咗做 prop 淨係為咗對數個殼餵一批定死嘅資料入嚟，
   *    ⛔ 唔係俾人換一條第二嘅讀取路 —— 真 app 一定係 `photoStore`。
   */
  listLocal?: (recordId: string) => Promise<PendingPhoto[]>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unsynced, setUnsynced] = useState(0)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  /**
   * 呢一單仲有幾多張相未傳上雲端。
   * ⭐ 換咗個入口（由「工程基本資料」變成推開張卡）**⛔ 唔准少咗呢句**。
   * ⛔ 讀唔到就當零 ⇒ 唔出，⚠️ 唔准出一個估出嚟嘅數嚇人。
   */
  useEffect(() => {
    if (!localStorageAvailable()) return
    let live = true
    void listLocal(record.id)
      .then((items) => {
        if (live) setUnsynced(unsyncedInRecord(items, record.id))
      })
      .catch((caught: unknown) => {
        console.error('[quote-app] unsynced photo count failed:', caught)
        if (live) setUnsynced(0)
      })
    return () => {
      live = false
    }
  }, [record.id, listLocal])

  // ⭐ 一開就 focus「唔刪」—— ⛔ 唔係 focus「刪除」。
  //    ⚠️ 手機外接鍵盤／輔助操作撳一下 Enter 就唔會刪咗嘢。
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
      // ⛔ 一定要出聲（PR #17 嗰條規矩）—— ⛔ 唔准又一次「撳咗冇反應」。
      //    ⭐ 呢句已經係「三句原因」入面啱嗰一句，由 `refusalReason()` 揀好。
      setError(caught instanceof Error ? caught.message : String(caught))
      setBusy(false)
    }
  }

  const warning = deleteUnsyncedWarning(unsynced)

  const cancel = (
    <button
      ref={cancelRef}
      className="button sheet__keep"
      type="button"
      data-testid="delete-cancel"
      disabled={busy}
      onClick={onCancel}
    >
      {DELETE_DIALOG_CANCEL}
    </button>
  )
  const confirm = (
    <button
      className="button button--danger sheet__go"
      type="button"
      data-testid="delete-confirm"
      disabled={busy}
      onClick={() => void run()}
    >
      {busy ? DELETE_DIALOG_BUSY : DELETE_DIALOG_CONFIRM}
    </button>
  )

  /**
   * ⛔⛔ **一定要 portal 去 `document.body`。**
   *
   * ⚠️ 2026-09-14 真機測試中過：張卡個彈窗本來就咁 render 喺 `.swipe-wrap` 入面，
   *    而 `.swipe-wrap` 喺 `.float-cards-scroll`（`z-index: 2`）裏面 ——
   *    **成個彈窗嘅堆疊上限就俾嗰個 2 封咗頂**，於是 `z-index: 50` 都仲係
   *    **企喺底 nav（`z-index: 5`）下面**。實測：撳「刪除」撳到嘅係 `nav-home`。
   *
   * ⭐ 即係話個彈窗**睇落完全正常，但粒掣係死嘅** —— 同 2026-09-14 首頁
   *    嗰個「位置啱但撳唔到」一模一樣嘅病。⛔ 靠調高 `z-index` 醫唔到，
   *    因為問題唔喺數字大細，係佢困咗喺一個祖先嘅堆疊脈絡入面。
   */
  const sheet = (
    <div className="sheet-scrim" data-testid="delete-dialog-scrim">
      {/* ⛔ 撳背景⛔ 唔會關 —— 一個危險動作嘅彈窗唔應該撳錯背景就消失，
          ⚠️ 亦都唔應該撳錯背景就留低；要人明確揀一邊。 */}
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="del-title"
        data-testid="delete-dialog"
      >
        {/* ⭐ 中間呢段先至捲。⛔ 佢幾長都好，下面兩粒掣一步都唔會郁。 */}
        <div className="sheet__body" data-testid="delete-dialog-body">
          <h2 className="sheet__title" id="del-title">
            {deleteDialogTitle(record.name)}
          </h2>

          {warning !== null && (
            <p className="note-box note-box--warn" data-testid="delete-unsynced-warning">
              {warning}
            </p>
          )}

          {/* ⛔⛔ 唔准寫「無法還原」—— 喺我哋呢邊嗰句係假嘅。 */}
          <p className="sheet__truth">{deleteDialogTruth()}</p>

          {error !== null && (
            <p className="notice notice--error" role="alert" data-testid="delete-error">
              {error}
            </p>
          )}
        </div>

        {/* ⛔⛔ `flex:none`，釘死喺最底。⚠️ 呢一行就係 2026-08-11 嗰單嘢嘅解藥 ——
            粒掣嘅座標由畫面底決定，⛔ 同上面幾多字完全無關。 */}
        <div className="sheet__acts">
          {CANCEL_ON_RIGHT ? (
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
