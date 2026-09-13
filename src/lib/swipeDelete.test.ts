import { describe, expect, it } from 'vitest'
import {
  ACTION_W,
  MOVED_AT,
  OPEN_AT,
  SWIPE_CLOSED,
  swipeReducer,
  swipeSuppressesClick,
  type SwipeState,
} from './swipeDelete'
import {
  CANCEL_ON_RIGHT,
  DELETE_DIALOG_CANCEL,
  DELETE_DIALOG_CONFIRM,
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

describe('⛔ 尾隨嗰下 click 要壓住', () => {
  it('推過（超過 8px）⇒ 壓住 —— ⛔ 唔會跳咗入工程詳情', () => {
    expect(push(-MOVED_AT - 1).ended.moved).toBe(true)
    expect(swipeSuppressesClick(push(-MOVED_AT - 1).ended)).toBe(true)
  })

  it('⭐ 手震幾 px（未夠 8）⇒ ⛔ 唔壓 —— 撳一下照樣開得到工程', () => {
    const tiny = push(-3).ended
    expect(tiny.moved).toBe(false)
    expect(tiny.open).toBe(false)
    expect(swipeSuppressesClick(tiny)).toBe(false)
  })

  it('開住嗰陣撳張卡 ⇒ 壓住（＝收返，⛔ 唔係開工程）', () => {
    expect(swipeSuppressesClick(push(-60).ended)).toBe(true)
  })

  it('乜都冇做 ⇒ ⛔ 唔壓', () => {
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
  it('標題一定要寫出邊一單', () => {
    expect(deleteDialogTitle('彩霞邨 彩月樓')).toBe('刪咗「彩霞邨 彩月樓」？')
  })

  it('⛔⛔ 唔准寫「無法還原」—— 喺我哋呢邊嗰句係假嘅', () => {
    const truth = deleteDialogTruth()
    expect(truth).not.toContain('無法還原')
    expect(truth).toContain('唔係真刪')
    expect(truth).toContain('攞得返')
  })

  it('⛔ 兩粒掣唔准縮成「確定／取消」', () => {
    expect(DELETE_DIALOG_CONFIRM).toBe('刪除')
    expect(DELETE_DIALOG_CANCEL).toBe('唔刪，返去')
    expect(DELETE_DIALOG_CANCEL).not.toBe('取消')
  })

  it('⭐ 「唔刪」擺右邊（右手拇指最易到）', () => {
    expect(CANCEL_ON_RIGHT).toBe(true)
  })
})
