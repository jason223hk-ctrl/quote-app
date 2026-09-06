import { useEffect, useRef } from 'react'
import { RESUME_INTERVAL_MS, mirrorOnce, resumeOnce } from './autoResume'
import type { PhotosApi } from './photos'
import { photoStore, localStorageAvailable } from './photoStore'
import { createUploadDeps, mirrorPhoto, photoWorkerBase } from './photoTransport'
import { uploadPending } from './photoUpload'

/**
 * 掛住自動重傳。⛔ **成個 app 只准掛一次**，喺 `HomePage`。
 *
 * ⛔⛔ 唔准掛喺 `PhotoSlot`：一版可以有十幾格相，即係十幾個計時器、
 *    十幾個 `online` listener 一齊醒，一次過發幾十個請求 ——
 *    正正就係 `MAX_PER_ROUND` 想避免嗰件事。
 *
 * 四個觸發（`docs/上線清單.md` 第 1 條第 3 項）：
 *   1. **開 app** —— 上次冇網剩低嗰啲，一開就補
 *   2. **`online`** —— 熄咗飛航模式、行返出有訊號嗰下
 *   3. **返前景**（`visibilitychange`）—— ⚠️ 手機切走 app 之後計時器多數會凍住，
 *      淨靠計時器嘅話，阿耀切返入嚟可能等足一分鐘先郁
 *   4. **每分鐘** —— 兜底。⚠️ `online` 事件唔係次次都有（Wi-Fi 連到但冇出到街嗰種）
 *
 * ⭐ 呢個 hook **唔還任何嘢俾畫面** —— 今次特登唔做計數器。
 *    佢做嘅嘢只有兩樣：**令張相真係上到 R2**，跟住**補埋 Drive 嗰份**。
 *
 * ⭐ Jason 2026-09-05 拍板要補埋 Drive，理由係：「有人會開返嗰版」呢個假設，
 *    同「有人會記得撳再試一次」係同一種假設 —— 而嗰種假設今日已經證明咗唔成立。
 */
export function useAutoResume(accessToken: string, photos: PhotosApi): void {
  // ⛔ token 同 api 一變就重掛一次 listener 係嘥嘅，而且會斷咗行緊嗰輪。
  //    改為每次行嗰陣先讀最新嗰個。
  const latest = useRef({ accessToken, photos })
  latest.current = { accessToken, photos }

  useEffect(() => {
    // Worker 未設定就連試都唔好試 —— 每次都實敗，白白令 attempts 一路加。
    if (photoWorkerBase() === '') return
    if (!localStorageAvailable()) return

    let live = true

    const tick = async () => {
      if (!live) return
      // ⛔ resumeOnce 唔會 throw，所以呢度唔使包 try —— 但仲係接住，
      //    因為背景嘅 unhandled rejection 冇人見到。
      try {
        const sent = await resumeOnce({
          listAll: photoStore.listAll,
          save: photoStore.put,
          upload: (item) =>
            uploadPending(item, createUploadDeps(latest.current.accessToken, latest.current.photos)),
        })

        if (!live) return

        // ⭐ 啱啱有相上到 R2 就即刻補 Drive（`force`），⛔ 唔等下一次掃。
        //    冇上到嘢就照 `MIRROR_SWEEP_MS` 嗰個節奏，⛔ 唔好每分鐘問一次 DB。
        await mirrorOnce(
          {
            listRows: latest.current.photos.listAll,
            listAll: photoStore.listAll,
            save: photoStore.put,
            mirror: (photoId) => mirrorPhoto(latest.current.accessToken, photoId),
          },
          { force: sent.sent > 0 },
        )
      } catch (caught) {
        console.error('[quote-app] auto resume tick failed:', caught)
      }
    }

    const onOnline = () => void tick()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
    }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => void tick(), RESUME_INTERVAL_MS)

    void tick()

    return () => {
      live = false
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [])
}
