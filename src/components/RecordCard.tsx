import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { clientAddressLine, regionLabel, shiftLabel, statusLabel } from '../lib/labels'
import type { PurgeCountApis } from '../lib/purgeCounts'
import type { QuoteRecord } from '../lib/records'
import { quotedAgeText } from '../lib/status'
import {
  ACTION_W,
  SWIPE_CLOSED,
  swipeClickAction,
  swipeReducer,
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
 *   · ⛔ **唔傳 `swipeDelete` 就完全冇呢件事** —— 連一個 handler 都唔掛。
 *   · ⛔⛔ **唔准靠部機自己判斷邊個刪得**：唔係你開嘅單**照樣推得開、撳得落**，
 *     做唔到就由伺服器拒絕，然後出返三句原因入面啱嗰一句（PR #17）。
 *     ⚠️ tree app 嗰邊係 `enabled={canDelete}`（部機自己攔）—— ⛔ 呢樣**唔跟**：
 *     `quote_admins` 空咗一個月都冇人知，就係因為部機嘅假設會靜靜咁錯。
 *
 * ⛔⛔⛔ **下面用 Pointer Events，⛔ 唔准改返 touch 事件。**
 *    ⚠️ 2026-09-14 第一版淨係掛 touch，**電腦度完全冇反應、Android 又俾瀏覽器
 *    搶咗個手勢走**。連埋 CSS 嗰句 `touch-action: pan-y`（`app.css`
 *    `.swipe-wrap > .proj-card`）先至係完整嘅修法 —— **⛔ 兩邊缺一不可**。
 *    完整經過同「點樣先算驗過」喺 `src/lib/swipeDelete.ts` 檔頭。
 */
/**
 * 向左推刪除嗰一組嘢。**⛔ 要就三樣一齊要，⛔ 唔要就一樣都冇。**
 *
 * ⭐⭐ **點解綁埋做一個 prop，⛔ 唔係三個 optional**
 *    ⚠️ 拆開就有得「推得開、但數唔到」—— 而嗰個樣係**粒「刪除」永遠撳唔落**，
 *    畫面淨係寫「請check返個網絡」。⭐ 冇人會諗到係 props 漏咗駁。
 *    ⛔ 綁埋一齊，TypeScript 就令呢個半拉子狀態**根本寫唔出嚟**。
 */
export type SwipeDeleteProps = {
  /** ⛔ 失敗要 throw，訊息會原封不動出喺彈窗。 */
  run: (record: QuoteRecord) => Promise<void>
  /** 數「連帶消失：N 棵樹、N 張相」用。見 `src/lib/purgeCounts.ts`。 */
  apis: PurgeCountApis
}

export default function RecordCard({
  record,
  onOpen,
  swipeDelete,
}: {
  record: QuoteRecord
  onOpen: () => void
  /** ⛔ 唔傳就完全冇滑動刪除（桌面、對數個殼）—— 連 handler 都唔掛。 */
  swipeDelete?: SwipeDeleteProps
}) {
  const line = clientAddressLine(record.client, record.address)
  // ⛔ 用部機當日。⚠️ 唔喺上面 memo：一日淨係變一次，慳嗰下唔值得多一層。
  const age = quotedAgeText(record, new Date())

  const [swipe, setSwipe] = useState<SwipeState>(SWIPE_CLOSED)
  const [asking, setAsking] = useState(false)
  const [dragging, setDragging] = useState(false)
  /**
   * 而家嗰下手指／滑鼠：㩒落去嗰點嘅 X ＋ 佢個 `pointerId`。
   *
   * ⛔⛔ **一定要用 `ref`，⛔ 唔准用 `useState`。**
   * ⚠️ 2026-09-14 中過：本來用 `useState`，而 `setState` 係非同步 ——
   *    同一個 tick 入面跟住嚟嗰啲 move 讀返嘅仲係 `null`，
   *    **於是每一下推都俾人當「未開始」丟咗**，張卡一 px 都唔郁。
   *    ⭐ 單元測試捉唔到（reducer 本身係啱嘅），⚠️ 要真瀏覽器真滑鼠拖先見到。
   *
   * ⭐ 記住 `pointerId` 係為咗**第二隻手指落嚟嗰陣唔好撈亂** —— 只認第一隻。
   */
  const drag = useRef<{ x0: number; id: number } | null>(null)
  const swipeable = swipeDelete !== undefined

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
            onPointerDown(event: PointerEvent<HTMLButtonElement>) {
              // ⛔ 只認第一隻手指（`isPrimary`）—— 兩隻手指嗰陣係捏放大，唔關我事。
              if (!event.isPrimary) return
              drag.current = { x0: event.clientX, id: event.pointerId }
              setDragging(true)
              setSwipe((s) => swipeReducer(s, { type: 'start' }))
              // ⭐ 手指行出咗張卡都仲收到 move／up。⚠️ 舊瀏覽器冇呢個 API，
              //    冇就算 —— 冇咗只係「拖出界會斷」，⛔ 唔會壞晒。
              try {
                event.currentTarget.setPointerCapture(event.pointerId)
              } catch {
                /* 舊瀏覽器 */
              }
            },
            onPointerMove(event: PointerEvent<HTMLButtonElement>) {
              const d = drag.current
              if (d === null || event.pointerId !== d.id) return
              // ⛔ 只讀橫向 —— 見 `swipeDelete.ts`：冇軸鎖係拍咗板嘅。
              setSwipe((s) => swipeReducer(s, { type: 'move', dx: event.clientX - d.x0 }))
            },
            onPointerUp(event: PointerEvent<HTMLButtonElement>) {
              if (drag.current === null || event.pointerId !== drag.current.id) return
              drag.current = null
              setDragging(false)
              setSwipe((s) => swipeReducer(s, { type: 'end' }))
            },
            onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
              if (drag.current === null || event.pointerId !== drag.current.id) return
              drag.current = null
              setDragging(false)
              setSwipe((s) => swipeReducer(s, { type: 'end' }))
            },
            onClickCapture(event: MouseEvent<HTMLButtonElement>) {
              // ⭐⭐ 三種情況，⛔ 唔可以撈埋做兩種 —— 見 `swipeClickAction()`。
              const action = swipeClickAction(swipe)
              if (action === 'open') return
              event.preventDefault()
              event.stopPropagation()
              // ⛔⛔ 啱啱推完嗰下淨係食咗佢，**⛔ 唔准順手收返張卡**：
              //    唔係嘅話推開到 -76px 一放手就彈返 0，個刪除掣望都望唔到。
              setSwipe((s) => swipeReducer(s, { type: action === 'eat' ? 'clickEaten' : 'close' }))
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

  // ⛔ 冇 `swipeDelete` ⇒ 原封不動出返張卡，⛔ 連個 wrapper 都唔加。
  if (swipeDelete === undefined) return card

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
          apis={swipeDelete.apis}
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            await swipeDelete.run(record)
            setAsking(false)
          }}
        />
      )}
    </div>
  )
}
