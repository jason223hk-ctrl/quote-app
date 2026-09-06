import { useEffect, useRef, useState } from 'react'
import { ALL_DONE_MS, celebrateFor, pendingCount } from './pendingCount'
import { localStorageAvailable, photoStore, subscribePhotoStore } from './photoStore'

/**
 * 「未上載 N 張」個數，跟住部機嗰份走。
 *
 * ⛔⛔ **唔 poll。** 冇 `setInterval`、冇每秒查 IndexedDB ——
 *    阿耀部機食電，而且九成九次查完都係同一個數。
 *
 * ⭐ 改為：**有人寫入部機就重新數一次**（`subscribePhotoStore`）。
 *    三條寫入路全部經 `photoStore.put()`：
 *      · 影完相（`PhotoSlot.handleFile`）
 *      · 撳「再試一次」（`PhotoSlot.send`）
 *      · 背景自動重傳（`autoResume.resumeOnce`）
 *    ⇒ 兩邊上完個數都即刻跌，⛔ 唔使等。
 *
 * 另外三個時機都會重數，全部係**事件**，⛔ 唔係計時器：
 *   1. 掛上去嗰陣（開 app）
 *   2. 返前景（`visibilitychange`）—— 第二個 tab 寫過嘢，我哋收唔到上面嗰個通知
 *   3. ⛔ 冇第三個。
 *
 * ⚠️ **最壞情況慢幾耐**：正常係「寫入之後 120 毫秒」（下面個合併窗）。
 * 唯一會慢過呢個嘅情況，係**第二個 tab／第二部機**改咗嘢 ——
 * 嗰陣要等切返入前景先數得返。⛔ 呢個係已知嘅，唔係手民之誤：
 * 為咗慳電特登唔 poll，而同一部機開兩個 tab 影相本身係邊緣情況。
 */

/**
 * 幾多毫秒之內嘅連續寫入當一次數。
 *
 * ⚠️ 背景重傳一輪最多三張，每張寫兩次（`uploading` ＋ 結果）＝ 六次通知。
 * ⛔ 唔合併就係六次 `getAll()`。⭐ 120 毫秒人眼睇落仍然係「即刻」。
 */
const COALESCE_MS = 120

export type PendingState = {
  /** 而家幾多張淨喺部機。 */
  count: number
  /** 啱啱由有變冇，出緊「全部上晒」。 */
  celebrating: boolean
}

export function usePendingCount(): PendingState {
  const [state, setState] = useState<PendingState>({ count: 0, celebrating: false })
  const countRef = useRef(0)

  useEffect(() => {
    if (!localStorageAvailable()) return

    let live = true
    let coalesce: ReturnType<typeof setTimeout> | undefined
    let doneTimer: ReturnType<typeof setTimeout> | undefined

    const recount = async () => {
      let next: number
      try {
        next = pendingCount(await photoStore.listAll())
      } catch (caught) {
        // ⛔ 數唔到就唔好亂改個數 —— 上一個數仍然係我哋知道嘅最準嗰個。
        console.error('[quote-app] pending count failed:', caught)
        return
      }
      if (!live) return

      const previous = countRef.current
      countRef.current = next

      if (celebrateFor(previous, next)) {
        setState({ count: 0, celebrating: true })
        clearTimeout(doneTimer)
        doneTimer = setTimeout(() => {
          if (live) setState({ count: 0, celebrating: false })
        }, ALL_DONE_MS)
        return
      }

      setState({ count: next, celebrating: false })
    }

    const schedule = () => {
      clearTimeout(coalesce)
      coalesce = setTimeout(() => void recount(), COALESCE_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void recount()
    }

    const unsubscribe = subscribePhotoStore(schedule)
    document.addEventListener('visibilitychange', onVisible)
    void recount()

    return () => {
      live = false
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(coalesce)
      clearTimeout(doneTimer)
    }
  }, [])

  return state
}
