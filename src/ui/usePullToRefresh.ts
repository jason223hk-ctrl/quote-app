import { useRef, useState, type TouchEvent } from 'react'
import {
  PULL_IDLE,
  pullReducer,
  type PullEvent,
  type PullState,
} from '../lib/pullToRefresh'

/**
 * 向下拉刷新 —— React 嗰層。**所有決定都喺 `src/lib/pullToRefresh.ts` 個 reducer，
 * 呢度淨係負責「聽手指」同「叫個 promise」。**
 *
 * ⛔⛔ **`enabled` 係 false 就完全冇呢件事** —— 唔掛 handler、⛔ 唔郁 state。
 *    ⚠️ 呢個就係「有未儲存輸入嘅畫面唔准做」嗰條規矩嘅實作：
 *    表單類畫面**唔傳 `onRefresh`**，於是連一個 touch handler 都唔存在，
 *    ⛔ 冇任何路徑可以清走人哋打咗嘅字。
 *
 * ⛔ 冇裝任何 library（Jason 2026-09-13 第 7 條）—— 得三個 touch event。
 */
export function usePullToRefresh(onRefresh?: () => Promise<unknown>) {
  const [state, setState] = useState<PullState>(PULL_IDLE)
  /** 手指㩒落去嗰點。⛔ 用 ref 唔用 state —— 佢每 move 都變，唔應該引發 render。 */
  const startY = useRef<number | null>(null)
  const enabled = typeof onRefresh === 'function'

  function send(event: PullEvent) {
    setState((current) => {
      const { state: next, refresh } = pullReducer(current, event)
      if (refresh && onRefresh) {
        // ⛔ 唔准 throw 上去 —— 刷失敗都要收返個轉圈，
        //    唔係嘅話個轉圈會永遠轉落去，而人會以為死咗機。
        void Promise.resolve()
          .then(() => onRefresh())
          .catch((caught: unknown) => {
            console.error('[quote-app] pull to refresh failed:', caught)
          })
          .finally(() => setState(PULL_IDLE))
      }
      return next
    })
  }

  if (!enabled) {
    return { state: PULL_IDLE, handlers: {} as Record<string, never> }
  }

  return {
    state,
    handlers: {
      onTouchStart(event: TouchEvent<HTMLDivElement>) {
        // ⛔ 兩隻手指（放大縮細）⇒ 唔當落拉。
        if (event.touches.length !== 1) {
          startY.current = null
          send({ type: 'cancel' })
          return
        }
        startY.current = event.touches[0].clientY
        send({ type: 'start', scrollTop: event.currentTarget.scrollTop })
      },

      onTouchMove(event: TouchEvent<HTMLDivElement>) {
        if (startY.current === null || event.touches.length !== 1) return
        send({ type: 'move', raw: event.touches[0].clientY - startY.current })
      },

      onTouchEnd() {
        startY.current = null
        send({ type: 'release' })
      },

      onTouchCancel() {
        startY.current = null
        send({ type: 'cancel' })
      },
    },
  }
}
