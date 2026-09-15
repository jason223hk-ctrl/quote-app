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
import ErrorNotice from '../ui/ErrorNotice'
import { Icon, ICONS } from '../ui/Icon'

/**
 * 刪工程確認 —— **畫面中間嘅彈窗**，版面照 **Jason 2026-09-14 交嗰張截圖**
 * （佢喺原型 `public/proto-swipe-delete.html` 撳過之後回：「試咗無問題」）。
 *
 * 由上而下，⛔ 冇別嘅字：
 *   ① 垃圾桶圖示 ＋ 標題
 *   ② 工程名（大、粗）
 *   ③ 日期（大、粗、另一行）
 *   ④ 【P8 步 2 補】「連帶消失：N 棵樹、N 張相」
 *   ⑤ 「此操作無法還原。」／今日仲係「後台仲攞得返」—— 見 `deleteDialog.ts`
 *   ⑥ ⚠️ 只剩部機一份嗰行（⛔ 截圖冇，但呢行係另一個真相，⛔ 唔准拆）
 *   ⑦ 左紅底實心、右描邊，⭐ 一樣闊
 *
 * ⛔⛔ **底色跟返 quote app 其餘畫面（深色），⛔ 唔用截圖嗰個白底。**
 *    Jason 2026-09-14 明文：「排列、字、掣位仲然照佢张截圖，只係底色跟 app」。
 *
 * ⛔⛔ **`.sheet__body` 個高度係寫死嘅，⛔ 唔准改成 `auto`。**
 *    2026-08-11 tree app 嗰單真實誤刪，成因係**粒掣會郁**（內容變長 ⇒ 掣換咗位）。
 *    寫死高度 ⇒ 成個彈窗高度固定 ⇒ 兩粒掣座標固定，⛔ 同內容幾長完全無關。
 *    ⚠️ 代價：內容短嗰陣個框會有啲空 —— **特登嘅，⛔ 唔係執漏。**
 *    見 `src/lib/deleteDialog.ts` 檔頭嘅完整經過；`npm run ui:check` 每次都量返。
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

  // ⭐ 一開就 focus「取消」—— ⛔ 唔係 focus 危險嗰粒。
  //    ⚠️ 手機外接鍵盤／輔助操作撳一下 Enter 就唔會刪咗嘢。
  //    ⭐ 呢個係「危險嗰粒係實色紅、最搶眼」之後剩返嘅三度保險之一，⛔ 唔准拆。
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
  const truth = deleteDialogTruth()

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
      className="button sheet__go"
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
        aria-labelledby="del-title del-name"
        data-testid="delete-dialog"
      >
        <h2 className="sheet__head" id="del-title">
          <Icon name={ICONS.del} />
          {deleteDialogTitle()}
        </h2>

        {/* ⭐ 中間呢段先至捲，而且**高度寫死**。⛔ 佢入面幾長都好，
            下面兩粒掣一步都唔會郁。 */}
        <div className="sheet__body" data-testid="delete-dialog-body">
          {/* ⛔ 照截圖：工程名同日期兩行，兩行都係大、粗。
              ⛔ 冇 uuid（Jason 自己喺截圖度拍掉咗）、⛔ 冇客戶。 */}
          <div className="sheet__name" id="del-name">
            {record.name}
          </div>
          <div className="sheet__date">{record.record_date}</div>

          {/* ⚠️⚠️ 【P8 步 2】「連帶消失：N 棵樹、N 張相」擺喺呢度。
              ⛔ 而家未擺 —— 數數嗰個 `purgeCounts()` 仲喺另一個 PR（P8 步 1），
              ⛔ 而 CLAUDE.md 嗰邊唔准疊 PR。⭐ 個框高度已經留咗位俾佢，
              所以到時加落嚟**兩粒掣一 px 都唔會郁**。 */}

          <p className="sheet__truth">
            {truth.before}
            <b>{truth.strong}</b>
            {truth.after}
          </p>

          {/* ⛔⛔ 呢行**唔准因為要照截圖而拆掉**（截圖冇呢行，但呢行係另一個真相）。
              ⚠️ 未傳上雲端嗰啲相係**全世界只剩部機一份** —— 母單一冇咗，
              佢哋就永遠傳唔上去。⭐ P8 步 3 相真清咗之後，呢行只會更重要。 */}
          {warning !== null && (
            <p className="sheet__warn" data-testid="delete-unsynced-warning">
              {warning}
            </p>
          )}

          {/* ⛔⛔ **一定要用 `ErrorNotice`，⛔ 唔准就咁出一行 `<p>`。**
              ⚠️ 上面個框係**寫死高度嘅捲動框** —— 工程名長嗰陣，一行就咁擺落嚟
              會出咗喺框底之外，人撳完睇唔到，變返「撳咗冇反應」（PR #17 嗰單）。
              ⭐ `ErrorNotice` 會自己捲返入畫面（捲最近嗰個捲動祖先，即係呢個框）。 */}
          <ErrorNotice message={error} testId="delete-error" />
        </div>

        {/* ⛔⛔ `flex:none`。⚠️ 連埋上面寫死嘅高度，呢一行就係 2026-08-11 嗰單嘢嘅解藥
            —— 粒掣嘅座標⛔ 同上面幾多字完全無關。
            ⛔ 左＝刪除（紅底實心）、右＝取消（描邊），⭐ 一樣闊 —— 照 Jason 張截圖。 */}
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
