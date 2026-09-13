/**
 * 向下拉刷新 —— **純邏輯，⛔ 唔掂 DOM、唔掂 React、⛔ 冇裝任何 library。**
 *
 * ⭐ Jason 2026-09-13 要嘅：每一頁碌得嘅畫面向下拉都可以刷新。
 *
 * ⛔⛔ **唔係瀏覽器原生嗰個整頁 reload。** 呢度做嘅係「叫返嗰頁自己個 reload」
 *    （重新問 DB 攞資料）。⚠️ 整頁 reload 會**弄走人哋打到一半嘅字**。
 *
 * ⭐ 成個機制寫成一個 reducer，就係為咗**測得到**：
 *    門檻、只喺最頂、放手先執行、重複拉唔會跑兩次 —— ⛔ 唔靠手測。
 */

/**
 * 要拉夠幾多 px 先算數。
 *
 * ⭐ 72px ≈ 一隻手指第一節嘅長度 —— 戴住手套都拉得到，
 * ⛔ 但唔會行路㩒住個 mon 就意外觸發。
 */
export const PULL_THRESHOLD = 72

/**
 * 最多拉幾多（拉到底就唔再郁）。
 * ⛔ 冇上限嘅話，一隻手指可以將成版扯到落screen 外面。
 */
export const PULL_MAX = 120

/** 刷緊嗰陣個轉圈停喺邊。⭐ 要企喺一個睇得到嘅位，⛔ 唔好縮返上去。 */
export const PULL_REFRESHING_AT = 56

/**
 * 手指拉咗 `raw` px，畫面實際跟幾多。
 *
 * ⭐ 一半（阻力感）＋ 封頂。⛔ 一比一跟手指會令人以為版面爛咗。
 */
export function pullDistance(raw: number): number {
  if (raw <= 0) return 0
  return Math.min(raw / 2, PULL_MAX)
}

export type PullPhase = 'idle' | 'pulling' | 'refreshing'

export type PullState = {
  phase: PullPhase
  /** 而家個轉圈應該喺離頂幾多 px。 */
  distance: number
}

export const PULL_IDLE: PullState = { phase: 'idle', distance: 0 }

export type PullEvent =
  /** 手指㩒落去。`scrollTop` ＝ 嗰一刻捲到邊。 */
  | { type: 'start'; scrollTop: number }
  /** 手指向下移咗 `raw` px（由㩒落去嗰點計）。 */
  | { type: 'move'; raw: number }
  /** 放手。 */
  | { type: 'release' }
  /** 刷完（成功或者失敗都算）。 */
  | { type: 'done' }
  /** 中途取消（例如多過一隻手指、或者畫面拆咗）。 */
  | { type: 'cancel' }

export type PullResult = {
  state: PullState
  /** ⭐ `true` ＝ **而家**要行 `onRefresh()`。⛔ 一次拉只會出現一次。 */
  refresh: boolean
}

/**
 * 一個 event 行一步。
 *
 * 五條規矩（Jason 2026-09-13 逐條講明），⛔ 全部喺呢個 function 度：
 *
 * 1. ⛔ **只有捲到最頂（`scrollTop` ＝ 0）先開始得到** —— 碌到一半唔准觸發。
 * 2. 要拉過 `PULL_THRESHOLD`。
 * 3. ⛔ **放手先執行** —— 拉緊嗰陣乜都唔會發生。
 * 4. 拉到一半放手 ＝ 彈返、⛔ 乜都唔做。
 * 5. ⛔⛔ **刷緊嗰陣再拉唔會再跑一次** —— `refreshing` 收到 `start` 係唔郁嘅。
 */
export function pullReducer(state: PullState, event: PullEvent): PullResult {
  switch (event.type) {
    case 'start': {
      // ⛔ 刷緊 ⇒ 唔理。呢句就係「重複拉唔會跑兩次」。
      if (state.phase === 'refreshing') return { state, refresh: false }
      // ⛔ 唔喺最頂 ⇒ 唔開始。⚠️ 用 `> 0` 唔用 `!== 0`：
      //    iOS 回彈嗰陣 scrollTop 會係負數，嗰下仍然係「喺最頂」。
      if (event.scrollTop > 0) return { state: PULL_IDLE, refresh: false }
      return { state: { phase: 'pulling', distance: 0 }, refresh: false }
    }

    case 'move': {
      // ⛔ 唔喺 pulling（idle 或者刷緊）⇒ 一律唔郁。
      if (state.phase !== 'pulling') return { state, refresh: false }
      return { state: { phase: 'pulling', distance: pullDistance(event.raw) }, refresh: false }
    }

    case 'release': {
      if (state.phase !== 'pulling') return { state, refresh: false }
      // 拉唔夠 ⇒ 彈返，⛔ 乜都唔做。
      if (state.distance < PULL_THRESHOLD) return { state: PULL_IDLE, refresh: false }
      return {
        state: { phase: 'refreshing', distance: PULL_REFRESHING_AT },
        refresh: true,
      }
    }

    case 'done':
      return { state: PULL_IDLE, refresh: false }

    case 'cancel':
      // ⛔ 刷緊嗰陣唔准 cancel —— 個請求已經出咗去，收咗個轉圈只會令人以為死咗機。
      if (state.phase === 'refreshing') return { state, refresh: false }
      return { state: PULL_IDLE, refresh: false }
  }
}

/** 拉夠未（畫面用嚟決定句字係「拉多啲」定「放手刷新」）。 */
export function pulledEnough(state: PullState): boolean {
  return state.phase === 'pulling' && state.distance >= PULL_THRESHOLD
}

/** 轉圈旁邊嗰句字。⛔ 靜止（idle）冇字 —— 成個指示器都唔會出。 */
export function pullLabel(state: PullState): string | null {
  if (state.phase === 'refreshing') return '刷新中⋯'
  if (state.phase !== 'pulling') return null
  return pulledEnough(state) ? '放手刷新' : '向下拉刷新'
}
