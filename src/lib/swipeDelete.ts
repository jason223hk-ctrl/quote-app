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
 * ⭐⭐⭐ **⛔⛔ 一定要 Pointer Events ＋ CSS `touch-action: pan-y`**
 *
 * ⚠️⚠️ 2026-09-14 呢個檔第一版**淨係掛 `touchstart/touchmove/touchend`**，
 * Jason 開條原型 link 真機推 —— **張卡一 px 都唔郁**。查落去係**兩個原因，
 * 兩個都係真嘅**，⛔ 唔係「揀一個嚟改」：
 *
 *   ① **電腦度根本冇 touch 事件。** 實測：真滑鼠拖 90px，張卡 `translateX(0px)`。
 *   ② **張卡冇 `touch-action`**，Android Chrome 就會把橫向手勢當成佢自己嘅
 *      （捲動／邊緣返回），發一個 `touchcancel` 抵制咗我哋個 handler。
 *
 * ⇒ 做法：**Pointer Events**（滑鼠／手指／筆一次過收）＋ `setPointerCapture`
 *   （手指行出咗張卡都仲跟住）＋ CSS `touch-action: pan-y`
 *   （＝同瀏覽器講「上下你攞去，左右我自己嚟」）。
 *
 * ⛔⛔⛔ **驗證方法本身有規矩**（2026-09-14 用血換返嚟）：
 *   **自己 `dispatchEvent` 整一個 `TouchEvent` 出嚟 ⇒ ⛔ 以後都唔算證據。**
 *   ⚠️ 佢繞過晒瀏覽器嘅手勢仲裁，所以壞咗嘅 code 一樣會綠。
 *   ⭐ 分得出真假嘅得兩樣：**真滑鼠拖**（Playwright `mouse.down/move/up`）、
 *      **真手指**（Jason 部機）。⚠️ 連 CDP `Input.dispatchTouchEvent` 都分唔出。
 *   附錄 B「模擬手指 ≠ 真手指」有完整經過。
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
   * 尾隨嗰下 click 食咗㗎喇。⛔ **淨係熄咗 `moved`，⛔ 唔准掂 `dx` / `open`。**
   * ⚠️ 見下面 `swipeClickAction()` —— 呢一步就係「推開咗之後即刻彈返」個修法。
   */
  | { type: 'clickEaten' }

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

    case 'clickEaten':
      return { ...state, moved: false }

    case 'close':
      return SWIPE_CLOSED
  }
}

/**
 * 尾隨／真係撳落去嗰一下 click，應該做乜。
 *
 * ⭐⭐ **三種，⛔ 唔可以撈埋做兩種**（2026-09-14 實測中過）：
 *
 *   · `'eat'` —— **啱啱推完，瀏覽器補嗰一下。** 淨係食咗佢，
 *     ⛔⛔ **唔准順手收返張卡。**
 *     ⚠️ 舊版就係撈埋咗：見到 `moved || open` 就一律當「撳咗張開住嘅卡」去 `close`，
 *        於是**真滑鼠拖到 -76px，一放手就即刻彈返 0** —— 個刪除掣連望都望唔到。
 *   · `'close'` —— **開住，而家先至撳落去。** 收返張卡，⛔ 唔係開工程。
 *   · `'open'` —— 正正常常撳一下 ⇒ 入工程詳情。
 */
export type SwipeClickAction = 'eat' | 'close' | 'open'

export function swipeClickAction(state: SwipeState): SwipeClickAction {
  if (state.moved) return 'eat'
  if (state.open) return 'close'
  return 'open'
}

/** 呢一下 click 使唔使壓住（＝唔准當成「撳咗張卡」）。 */
export function swipeSuppressesClick(state: SwipeState): boolean {
  return swipeClickAction(state) !== 'open'
}
