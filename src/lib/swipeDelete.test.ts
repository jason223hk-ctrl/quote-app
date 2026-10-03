import { describe, expect, it } from 'vitest'
import {
  ACTION_W,
  MOVED_AT,
  OPEN_AT,
  SWIPE_CLOSED,
  swipeClickAction,
  swipeReducer,
  swipeSuppressesClick,
  type SwipeState,
} from './swipeDelete'
import {
  CANCEL_ON_RIGHT,
  DELETE_DIALOG_CANCEL,
  DELETE_DIALOG_CONFIRM,
  PHOTOS_REALLY_PURGED,
  deleteDialogTitle,
  deleteDialogTruth,
} from './deleteDialog'

/** 由 `from` 開始，推 `dx`，然後放手。回傳每一步。 */
function push(dx: number, from: SwipeState = SWIPE_CLOSED) {
  const started = swipeReducer(from, { type: 'start' })
  const moved = swipeReducer(started, { type: 'move', dx })
  const ended = swipeReducer(moved, { type: 'end' })
  return { started, moved, ended }
}

describe('數字全部由 tree app 實測抄過嚟', () => {
  it('露出 76px、門檻 38px', () => {
    expect(ACTION_W).toBe(76)
    expect(OPEN_AT).toBe(38)
  })
})

describe('推同放手', () => {
  it('一比一跟手指，⛔ 冇阻力', () => {
    expect(push(-30).moved.dx).toBe(-30)
    expect(push(-50).moved.dx).toBe(-50)
  })

  it('⛔ 推極都夾死喺 76px —— 冇「推到盡頭就刪」呢回事', () => {
    expect(push(-9999).moved.dx).toBe(-ACTION_W)
    expect(push(-9999).ended.open).toBe(true)
  })

  it('⛔ 向右推唔郁（正數 ⇒ 0）', () => {
    expect(push(200).moved.dx).toBe(0)
    expect(push(200).ended.open).toBe(false)
  })

  it('放手・過咗門檻 ⇒ 停住喺啱啱好 76px', () => {
    const { ended } = push(-50)
    expect(ended.open).toBe(true)
    expect(ended.dx).toBe(-ACTION_W)
  })

  it('放手・唔夠門檻 ⇒ 彈返 0，⛔ 乜都冇發生', () => {
    const { ended } = push(-20)
    expect(ended.open).toBe(false)
    expect(ended.dx).toBe(0)
  })

  it('啱啱好夠門檻（38px）⇒ ⛔ 唔算（要「多過」）', () => {
    expect(push(-OPEN_AT).ended.open).toBe(false)
    expect(push(-OPEN_AT - 1).ended.open).toBe(true)
  })

  it('⭐ 開住嗰陣再推，由而家個位置計起（tree app `startDx`）', () => {
    const open = push(-60).ended
    expect(open.dx).toBe(-ACTION_W)
    // 由開住嗰個位向右拉返 40px ⇒ -76 + 40 = -36
    const back = swipeReducer(swipeReducer(open, { type: 'start' }), { type: 'move', dx: 40 })
    expect(back.dx).toBe(-36)
    expect(swipeReducer(back, { type: 'end' }).open).toBe(false)
  })

  it('close ⇒ 完全收返', () => {
    expect(swipeReducer(push(-60).ended, { type: 'close' })).toEqual(SWIPE_CLOSED)
  })
})

describe('⛔ 尾隨嗰下 click：三種，⛔ 唔可以撈埋做兩種', () => {
  it('推過（超過 8px）⇒ 食咗佢 —— ⛔ 唔會跳咗入工程詳情', () => {
    expect(push(-MOVED_AT - 1).ended.moved).toBe(true)
    expect(swipeClickAction(push(-MOVED_AT - 1).ended)).toBe('eat')
    expect(swipeSuppressesClick(push(-MOVED_AT - 1).ended)).toBe(true)
  })

  it('⭐⭐ 食咗嗰下之後，張卡⛔ 唔准彈返 0 —— 開住就要繼續開住', () => {
    // ⚠️ 2026-09-14 實測中過嘅壞法：真滑鼠拖到 -76px，一放手就彈返 0，
    //    因為舊版見到 `moved || open` 就一律去 `close`。個刪除掣望都望唔到。
    const opened = push(-60).ended
    expect(opened.dx).toBe(-ACTION_W)
    const after = swipeReducer(opened, { type: 'clickEaten' })
    expect(after.dx).toBe(-ACTION_W)
    expect(after.open).toBe(true)
    expect(after.moved).toBe(false)
  })

  it('⭐ 開住、而家先至撳落去 ⇒ 收返（⛔ 唔係開工程）', () => {
    const settled = swipeReducer(push(-60).ended, { type: 'clickEaten' })
    expect(swipeClickAction(settled)).toBe('close')
    expect(swipeReducer(settled, { type: 'close' })).toEqual(SWIPE_CLOSED)
  })

  it('⭐ 手震幾 px（未夠 8）⇒ ⛔ 唔壓 —— 撳一下照樣開得到工程', () => {
    const tiny = push(-3).ended
    expect(tiny.moved).toBe(false)
    expect(tiny.open).toBe(false)
    expect(swipeClickAction(tiny)).toBe('open')
    expect(swipeSuppressesClick(tiny)).toBe(false)
  })

  it('乜都冇做 ⇒ ⛔ 唔壓', () => {
    expect(swipeClickAction(SWIPE_CLOSED)).toBe('open')
    expect(swipeSuppressesClick(SWIPE_CLOSED)).toBe(false)
  })
})

describe('⛔⛔ 冇軸鎖係故意嘅（Jason 2026-09-14 拍板）', () => {
  it('⭐ reducer 收唔到任何直向資料 —— 即係型別上就做唔到軸鎖', () => {
    // ⚠️ 呢條測試守住嘅唔係「行為」，係「呢個係一個決定」。
    //    有人日後加軸鎖，一定要改埋呢度，⇒ 佢就會睇到檔頭嗰段解釋。
    const moved = swipeReducer(SWIPE_CLOSED, { type: 'move', dx: -50 })
    expect(moved.dx).toBe(-50)
    expect(Object.keys({ type: 'move', dx: -50 })).toEqual(['type', 'dx'])
  })
})

describe('確認彈窗嘅文字', () => {
  it('⭐ 標題唔帶工程名 —— 工程名喺下面另一行（大、粗），照 Jason 張截圖', () => {
    expect(deleteDialogTitle()).not.toContain('「')
    expect(deleteDialogTitle()).toContain('？')
  })

  /* ⭐⭐ 兩套字都要有測試 —— P8 步 3 改嗰個 boolean 嗰陣，
     ⛔ 唔應該要順手改測試先過到。 */
  it('⛔⛔ P8 步 4 接咗 `/purge` ⇒ 一定要係「無法還原」嗰套', () => {
    // ⚠️ 呢條唔係量文案，係量「個 code 有冇講大話」。
    //    2026-10-03 起刪工程 ＝ 軟刪 ＋ Worker `/purge`（R2 ＋ Drive）＋ 最後刪部機
    //    （`src/lib/purgeRecord.ts`，測試喺 `purgeRecord.test.ts`）。
    expect(PHOTOS_REALLY_PURGED).toBe(true)
    const truth = deleteDialogTruth()
    expect(truth.strong).toBe('無法還原')
    expect(truth.before + truth.strong + truth.after).not.toContain('仍可取回')
    expect(deleteDialogTitle()).toBe('永久刪除？')
    expect(DELETE_DIALOG_CONFIRM).toBe('永久刪除')
  })

  it('⭐ 兩套字都寫齊咗 —— P8 步 3 淨係改一個 boolean', () => {
    // ⚠️ 呢條守住嘅係「⛔ 唔准到時再諗文案」。
    //    2026-10-03 改咗 `PHOTOS_REALLY_PURGED` 做 `true`，上面嗰條跟住一齊改咗。
    const src = deleteDialogTruth()
    expect(typeof src.before).toBe('string')
    expect(src.strong.length).toBeGreaterThan(0)
  })

  it('⛔ 危險嗰粒唔准縮成「確定」', () => {
    expect(DELETE_DIALOG_CONFIRM).not.toContain('確定')
    expect(DELETE_DIALOG_CONFIRM).toContain('刪除')
  })

  it('⭐ 「取消」擺右邊（Jason 2026-09-14 用截圖拍板，照 tree app）', () => {
    expect(CANCEL_ON_RIGHT).toBe(true)
    expect(DELETE_DIALOG_CANCEL).toBe('取消')
  })
})
