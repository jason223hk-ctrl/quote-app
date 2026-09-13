/**
 * 工程卡「向左推露出刪除」—— 純邏輯。**⛔ 唔掂 React、⛔ 唔掂 DOM。**
 *
 * ⭐⭐⭐ **⛔⛔ 冇軸鎖係故意嘅，⛔ 唔係漏咗 —— 三個月後嘅人請讀完呢段先改**
 *
 * **2026-09-14 Jason 喺手機推過原型（`public/proto-swipe-delete.html`）之後拍板：
 * 完全跟 tree app，⛔ 唔要軸鎖。**
 *
 * ⚠️ **佢係知道代價先揀嘅**，代價當時明文擺咗喺原型度俾佢試：
 *
 *   · 喺清單**最頂斜斜咁向左下推**，⛔ **張卡會滑開，同時下拉刷新個轉圈會出。**
 *     （原型嗰檔「⛔ 冇軸鎖」實測：卡 `-40px`、轉圈 `50px`，**同一下手指**。）
 *   · 佢仲有第三個選擇（張卡照跟手，但壓住下拉刷新）——⭐ **佢一樣冇揀。**
 *
 * ⇒ 所以下面 `swipeReducer` **只讀橫向位移**，同 tree app
 *   `src/ui/screens.tsx` `SwipeToDelete` 一模一樣。
 *
 * ⛔⛔ **想加軸鎖之前，先返去問 Jason** —— ⚠️ 呢個係一個拍咗板嘅取捨，
 *    ⛔ 唔係一個未做完嘅 TODO。見到斜推兩樣一齊郁，**嗰個係預期行為**。
 *
 * 三個數全部由 tree app 實測抄過嚟，⛔ 冇一個係自己定：
 */

/** 露出幾闊。tree app `ACTION_W`。 */
export const ACTION_W = 76
/** 放手嗰陣推過幾多先停住。tree app 用 `ACTION_W / 2`。 */
export const OPEN_AT = ACTION_W / 2
/**
 * 手指郁過幾多先當「真係推過」（用嚟壓住尾隨嗰下 click）。
 * ⚠️ 冇呢個，推完放手會順手當撳咗張卡，跳咗入工程詳情。
 */
export const MOVED_AT = 8

export type SwipeState = {
  /** 而家推咗幾多（⛔ 永遠係負數或者 0）。 */
  dx: number
  /** 停咗喺露出狀態。 */
  open: boolean
  /** 今次手指真係推過（⇒ 尾隨嗰下 click 要壓住）。 */
  moved: boolean
}

export const SWIPE_CLOSED: SwipeState = { dx: 0, open: false, moved: false }

export type SwipeEvent =
  | { type: 'start' }
  | { type: 'move'; dx: number }
  | { type: 'end' }
  /** 撳咗張卡（開住嗰陣）／撳咗第二度 ⇒ 收返。 */
  | { type: 'close' }

/**
 * ⛔ **只收橫向位移** —— 見檔頭：冇軸鎖係拍咗板嘅決定。
 *
 * ⚠️ `move` 個 `dx` 係「由手指落嗰點計起」嘅位移，⛔ 唔係逐格增量 ——
 *    逐格加落去會累積浮點誤差，而且中途 re-render 就會對唔返。
 */
export function swipeReducer(state: SwipeState, event: SwipeEvent): SwipeState {
  switch (event.type) {
    case 'start':
      // ⭐ 開住嗰陣再推，由而家個位置開始計（tree app `startDx`）。
      return { ...state, moved: false }

    case 'move': {
      const base = state.open ? -ACTION_W : 0
      return {
        dx: Math.max(-ACTION_W, Math.min(0, base + event.dx)),
        open: state.open,
        moved: state.moved || Math.abs(event.dx) > MOVED_AT,
      }
    }

    case 'end': {
      const open = state.dx < -OPEN_AT
      return { dx: open ? -ACTION_W : 0, open, moved: state.moved }
    }

    case 'close':
      return SWIPE_CLOSED
  }
}

/**
 * 尾隨嗰下 click 使唔使壓住。
 *
 * ⭐ 兩種都要壓：
 *   · 開住 ⇒ 撳張卡係「收返」，⛔ 唔係「開工程」
 *   · 啱啱推過 ⇒ 手指離開之後瀏覽器會補一下 click，⛔ 唔可以當成撳咗張卡
 */
export function swipeSuppressesClick(state: SwipeState): boolean {
  return state.open || state.moved
}
