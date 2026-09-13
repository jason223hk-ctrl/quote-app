import { useRef, useState, type MouseEvent, type TouchEvent } from 'react'
import { clientAddressLine, regionLabel, shiftLabel, statusLabel } from '../lib/labels'
import type { QuoteRecord } from '../lib/records'
import { quotedAgeText } from '../lib/status'
import {
  ACTION_W,
  SWIPE_CLOSED,
  swipeReducer,
  swipeSuppressesClick,
  type SwipeState,
} from '../lib/swipeDelete'
import { Icon, ICONS } from '../ui/Icon'
import DeleteRecordDialog from './DeleteRecordDialog'

/**
 * 工程卡。版面照已批准嘅原型 stage57 `.pcard`：
 * 上面一行係「名稱 ＋ 狀態膠囊」，下面兩行係日期／地區／更同客戶／地址。
 *
 * ⚠️ 狀態膠囊一定要同名稱**同一行**（原型 `.pcard .top`）——
 * 分開兩個直行嘅話，卡高過內容嗰陣個膠囊會浮咗喺半空，對唔正個名。
 *
 * ⭐ 「報咗 N 日」只喺呢度出，⛔ 首頁唔動（`docs/交接-CO.md`）。
 *    佢淨係喺「已報價」嗰啲出 —— 一單報咗好耐冇音信，睇一眼就知要跟進。
 *
 * ⭐⭐ **向左推露出刪除**（Jason 2026-09-14 推過原型之後拍板，完全跟 tree app）：
 *   · ⛔ **冇軸鎖** —— 斜推嗰陣張卡同下拉刷新會一齊郁。
 *     ⚠️ **呢個係佢知道代價之後揀嘅**，⛔ 唔係漏咗。見 `src/lib/swipeDelete.ts` 檔頭。
 *   · ⛔ **唔傳 `onDelete` 就完全冇呢件事** —— 連 touch handler 都唔掛。
 *   · ⛔⛔ **唔准靠部機自己判斷邊個刪得**：唔係你開嘅單**照樣推得開、撳得落**，
 *     做唔到就由伺服器拒絕，然後出返三句原因入面啱嗰一句（PR #17）。
 *     ⚠️ tree app 嗰邊係 `enabled={canDelete}`（部機自己攔）—— ⛔ 呢樣**唔跟**：
 *     `quote_admins` 空咗一個月都冇人知，就係因為部機嘅假設會靜靜咁錯。
 */
export default function RecordCard({
  record,
  onOpen,
  onDelete,
}: {
  record: QuoteRecord
  onOpen: () => void
  /** ⛔ 唔傳就冇滑動刪除（桌面、對數個殼）。失敗要 throw，訊息會出喺彈窗。 */
  onDelete?: (record: QuoteRecord) => Promise<void>
}) {
  const line = clientAddressLine(record.client, record.address)
  // ⛔ 用部機當日。⚠️ 唔喺上面 memo：一日淨係變一次，慳嗰下唔值得多一層。
  const age = quotedAgeText(record, new Date())

  const [swipe, setSwipe] = useState<SwipeState>(SWIPE_CLOSED)
  const [asking, setAsking] = useState(false)
  const [dragging, setDragging] = useState(false)
  /**
   * 手指㩒落去嗰點嘅 X。
   *
   * ⛔⛔ **一定要用 `ref`，⛔ 唔准用 `useState`。**
   * ⚠️ 2026-09-14 真機測試中過：本來用 `useState`，而 `setState` 係非同步 ——
   *    同一個 tick 入面跟住嚟嗰啲 `touchmove` 讀返嘅仲係 `null`，
   *    **於是每一下推都俾人當「未開始」丟咗**，張卡一 px 都唔郁。
   *    ⭐ 單元測試捉唔到（reducer 本身係啱嘅），⚠️ 要真瀏覽器發真 TouchEvent 先見到。
   */
  const startX = useRef<number | null>(null)
  const swipeable = typeof onDelete === 'function'

  const card = (
    <button
      className="proj-card"
      data-testid="record-row"
      onClick={onOpen}
      {...(swipeable
        ? {
            style: {
              transform: `translateX(${swipe.dx}px)`,
              transition: dragging ? 'none' : 'transform .2s ease',
            },
            onTouchStart(event: TouchEvent<HTMLButtonElement>) {
              if (event.touches.length !== 1) return
              startX.current = event.touches[0].clientX
              setDragging(true)
              setSwipe((s) => swipeReducer(s, { type: 'start' }))
            },
            onTouchMove(event: TouchEvent<HTMLButtonElement>) {
              if (startX.current === null || event.touches.length !== 1) return
              // ⛔ 只讀橫向 —— 見 `swipeDelete.ts`：冇軸鎖係拍咗板嘅。
              const dx = event.touches[0].clientX - startX.current
              setSwipe((s) => swipeReducer(s, { type: 'move', dx }))
            },
            onTouchEnd() {
              startX.current = null
              setDragging(false)
              setSwipe((s) => swipeReducer(s, { type: 'end' }))
            },
            onTouchCancel() {
              startX.current = null
              setDragging(false)
              setSwipe((s) => swipeReducer(s, { type: 'end' }))
            },
            onClickCapture(event: MouseEvent<HTMLButtonElement>) {
              // ⭐ 推完放手，瀏覽器會補一下 click —— ⛔ 唔壓住就會跳咗入工程詳情。
              //    開住嗰陣撳張卡 ＝ 收返，⛔ 亦都唔係「開工程」。
              if (!swipeSuppressesClick(swipe)) return
              event.preventDefault()
              event.stopPropagation()
              setSwipe((s) => swipeReducer(s, { type: 'close' }))
            },
          }
        : {})}
    >
      <div className="proj-top">
        <div className="proj-title">{record.name}</div>

        <div className="proj-side">
          <span className={`status status--${record.status}`}>
            <span className="status__dot" aria-hidden="true" />
            {statusLabel(record.status)}
          </span>
          {record.archived && <span className="badge grey">已封存</span>}
        </div>
      </div>

      <div className="proj-meta">
        <span className="meta-item">{record.record_date}</span>
        <span className="meta-divider" />
        <span className="meta-item">{regionLabel(record.region)}</span>
        <span className="meta-divider" />
        <span className="meta-item">{shiftLabel(record.shift)}</span>
        {age !== null && (
          <>
            <span className="meta-divider" />
            <span className="meta-item" data-testid="quoted-age">
              {age}
            </span>
          </>
        )}
      </div>

      {line !== '' && (
        <div className="proj-meta">
          <span className="meta-item wrap">{line}</span>
        </div>
      )}
    </button>
  )

  // ⛔ 冇 `onDelete` ⇒ 原封不動出返張卡，⛔ 連個 wrapper 都唔加。
  if (!swipeable) return card

  return (
    <div className="swipe-wrap" style={{ '--swipe-w': `${ACTION_W}px` } as React.CSSProperties}>
      {/* 鋪滿成行嘅紅色喺後面，張卡喺上面滑過去 —— ⭐ 一整條紅色露出嚟，
          ⛔ 唔係一粒浮起嘅藥丸（跟 tree app 個做法）。 */}
      <div className="swipe-bg" aria-hidden="true">
        <button
          className="swipe-bin"
          type="button"
          aria-label={`刪除 ${record.name}`}
          data-testid="record-swipe-delete"
          tabIndex={swipe.open ? 0 : -1}
          onClick={() => {
            setAsking(true)
            setSwipe(SWIPE_CLOSED)
          }}
        >
          <Icon name={ICONS.del} />
        </button>
      </div>

      {card}

      {asking && (
        <DeleteRecordDialog
          record={record}
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            await onDelete(record)
            setAsking(false)
          }}
        />
      )}
    </div>
  )
}
