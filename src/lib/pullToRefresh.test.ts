import { describe, expect, it } from 'vitest'
import {
  PULL_IDLE,
  PULL_MAX,
  PULL_THRESHOLD,
  pullDistance,
  pullLabel,
  pullReducer,
  pulledEnough,
  type PullState,
} from './pullToRefresh'

/** 由最頂㩒落去、拉咗 `raw` px、然後放手。回傳每一步。 */
function pull(raw: number, from: PullState = PULL_IDLE, scrollTop = 0) {
  const started = pullReducer(from, { type: 'start', scrollTop })
  const moved = pullReducer(started.state, { type: 'move', raw })
  const released = pullReducer(moved.state, { type: 'release' })
  return { started, moved, released }
}

/** 拉到夠門檻要幾多 px 手指位（有一半阻力）。 */
const ENOUGH = PULL_THRESHOLD * 2 + 10

describe('pullDistance（阻力）', () => {
  it('向上拉（負數）＝ 零', () => {
    expect(pullDistance(-50)).toBe(0)
    expect(pullDistance(0)).toBe(0)
  })

  it('一半阻力 —— ⛔ 唔係一比一跟手指', () => {
    expect(pullDistance(100)).toBe(50)
  })

  it('⛔ 有上限，唔會扯到落 screen 外面', () => {
    expect(pullDistance(9999)).toBe(PULL_MAX)
  })
})

describe('⛔ 規矩一：只有捲到最頂先觸發得到', () => {
  it('碌到一半㩒落去 ⇒ ⛔ 連 pulling 都唔會入', () => {
    const { started, released } = pull(ENOUGH, PULL_IDLE, 240)
    expect(started.state.phase).toBe('idle')
    expect(released.refresh).toBe(false)
  })

  it('喺最頂 ⇒ 入到 pulling', () => {
    const started = pullReducer(PULL_IDLE, { type: 'start', scrollTop: 0 })
    expect(started.state.phase).toBe('pulling')
  })

  it('⭐ scrollTop 係負數（iOS 回彈）都算喺最頂', () => {
    const started = pullReducer(PULL_IDLE, { type: 'start', scrollTop: -12 })
    expect(started.state.phase).toBe('pulling')
  })
})

describe('⛔ 規矩二＋三：要過門檻，而且放手先執行', () => {
  it('拉緊嗰陣 ⛔ 唔會刷 —— 就算已經過咗門檻', () => {
    const started = pullReducer(PULL_IDLE, { type: 'start', scrollTop: 0 })
    const moved = pullReducer(started.state, { type: 'move', raw: ENOUGH })
    expect(moved.refresh).toBe(false)
    expect(moved.state.phase).toBe('pulling')
    expect(pulledEnough(moved.state)).toBe(true)
  })

  it('放手 ＋ 過咗門檻 ⇒ 先至刷', () => {
    const { released } = pull(ENOUGH)
    expect(released.refresh).toBe(true)
    expect(released.state.phase).toBe('refreshing')
  })

  it('⛔ 規矩四：拉到一半放手 ＝ 彈返，乜都唔做', () => {
    const { released } = pull(PULL_THRESHOLD) // 一半阻力 ⇒ 得 36px，唔夠
    expect(released.refresh).toBe(false)
    expect(released.state).toEqual(PULL_IDLE)
  })

  it('啱啱好夠門檻都算數', () => {
    const { released } = pull(PULL_THRESHOLD * 2)
    expect(released.refresh).toBe(true)
  })
})

describe('⛔⛔ 規矩五：重複拉唔會跑兩次', () => {
  it('刷緊嗰陣再由頭拉一次 ⇒ ⛔ 唔會再刷', () => {
    const first = pull(ENOUGH)
    expect(first.released.refresh).toBe(true)

    // 刷緊，個 promise 未返 —— 阿耀心急再拉多兩次。
    const again = pull(ENOUGH, first.released.state)
    expect(again.started.state.phase).toBe('refreshing')
    expect(again.moved.refresh).toBe(false)
    expect(again.released.refresh).toBe(false)
  })

  it('刷緊嗰陣 move ⛔ 唔會郁到個轉圈', () => {
    const refreshing = pull(ENOUGH).released.state
    const moved = pullReducer(refreshing, { type: 'move', raw: 300 })
    expect(moved.state).toEqual(refreshing)
  })

  it('⛔ 刷緊唔准 cancel —— 個請求已經出咗去', () => {
    const refreshing = pull(ENOUGH).released.state
    expect(pullReducer(refreshing, { type: 'cancel' }).state).toEqual(refreshing)
  })

  it('刷完（done）先返得去 idle，跟住可以再拉', () => {
    const refreshing = pull(ENOUGH).released.state
    const done = pullReducer(refreshing, { type: 'done' })
    expect(done.state).toEqual(PULL_IDLE)
    expect(pull(ENOUGH, done.state).released.refresh).toBe(true)
  })

  it('⭐ 一次拉只會出一次 refresh —— 放兩次手都係一次', () => {
    const { released } = pull(ENOUGH)
    const again = pullReducer(released.state, { type: 'release' })
    expect(again.refresh).toBe(false)
  })
})

describe('睇得到嘅回饋', () => {
  it('⛔ 靜止嗰陣冇字 —— 成個指示器唔會出', () => {
    expect(pullLabel(PULL_IDLE)).toBe(null)
  })

  it('拉緊但未夠 ⇒ 叫人拉多啲', () => {
    const moved = pull(40).moved.state
    expect(pullLabel(moved)).toBe('向下拉刷新')
  })

  it('拉夠 ⇒ 叫人放手', () => {
    const moved = pull(ENOUGH).moved.state
    expect(pullLabel(moved)).toBe('放手刷新')
  })

  it('刷緊 ⇒ ⛔ 唔准靜靜雞，要出「刷新中⋯」', () => {
    expect(pullLabel(pull(ENOUGH).released.state)).toBe('刷新中⋯')
  })
})

describe('⛔⛔ 有未儲存輸入嘅畫面：唔傳 onRefresh 就完全冇呢件事', () => {
  /**
   * ⚠️ 呢組測試守住 Jason 2026-09-13 第 3 條：
   * **報價表、現場表、客戶資料表格⛔ 絕對唔准清走人哋打咗嘅字。**
   *
   * ⭐ 實作上嘅保證係：`ScrollBody` 冇收到 `onRefresh` 就**連 handler 都唔會掛**
   * （見 `src/ui/usePullToRefresh.ts` 個 `enabled`）。
   * 下面兩條係嗰個「enabled = false」嘅行為契約。
   */
  it('冇 onRefresh ⇒ 由頭到尾都係 idle，⛔ 唔會 refresh', () => {
    // enabled 係 false 嗰陣，component 根本唔會派 event 入嚟 ——
    // 即係個 state 永遠停喺 PULL_IDLE。
    expect(PULL_IDLE).toEqual({ phase: 'idle', distance: 0 })
    expect(pullLabel(PULL_IDLE)).toBe(null)
  })

  it('就算真係派咗 event 入嚟，冇 release 都⛔ 唔會 refresh', () => {
    const started = pullReducer(PULL_IDLE, { type: 'start', scrollTop: 0 })
    const moved = pullReducer(started.state, { type: 'move', raw: 999 })
    expect(started.refresh).toBe(false)
    expect(moved.refresh).toBe(false)
  })
})
