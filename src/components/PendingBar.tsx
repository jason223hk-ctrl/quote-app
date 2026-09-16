import { useEffect, useRef } from 'react'
import { ALL_DONE_LABEL, pendingLabel } from '../lib/pendingCount'
import { usePendingCount } from '../lib/usePendingCount'

/** 條 bar 同 nav 之間留幾多空隙。 */
const GAP = 10

/**
 * 「未上載 N 張」—— 釘喺底部導航上面嗰條 bar。
 *
 * Jason 2026-09-06 睇完原型 `public/proto-pending-count.html` 拍板嘅五條：
 *   ① 擺喺底部導航上面，⭐ 永遠可見（碌到邊都喺度）
 *   ② N 只數「一份雲端副本都未有」嗰啲（見 `pendingCount`）
 *   ③ 撳得，撳咗去同步頁
 *   ④ N 到零：變綠、寫「✓ 全部上晒」、停兩秒先消失
 *   ⑤ ⛔ 冇網唔變樣 —— 唔變灰、唔加字（見 `pendingCount.ts` 尾嗰段）
 *
 * ⛔⛔ 兩條硬規矩（`docs/上線清單.md` 第 1 條原文），⛔ 唔准當成可調嘅選項：
 *   · **N 唔係零就唔准收埋** —— 呢度冇任何「碌走就縮起」「幾秒後淡出」嘅邏輯。
 *   · **唔准有得撳走** —— ⛔ 冇 ✕、冇「知道喇」、冇「唔好再提」。
 *     撳落去嘅唯一結果係**去同步頁**，⛔ 唔會令佢消失。
 *     個數要跌，⭐ 只有一個方法：張相真係上到。
 */
export default function PendingBar({
  onOpenSync,
  sample,
}: {
  onOpenSync: () => void
  /**
   * 對數個殼餵入嚟嘅定死數字。**⛔ 真 app 永遠唔傳呢個。**
   *
   * ⭐ 點解要開呢個窿：條 bar 個數由 IndexedDB 嚟，而 `ui:check` 個殼冇資料
   *    ⇒ 唔傳就永遠係零、永遠唔出，**把尺等於量緊一個唔存在嘅嘢**。
   * ⚠️ 做法跟返 `DeleteRecordDialog` 個 `listLocal` —— ⛔ 唔係俾人換一條
   *    第二嘅讀取路，淨係為咗餵一批定死嘅資料入嚟量。
   */
  sample?: { count: number; celebrating: boolean }
}) {
  // ⛔ hook 唔准有條件咁行 —— 所以照 call，之後先揀用邊個。
  const live = usePendingCount()
  const { count, celebrating } = sample ?? live
  const barRef = useRef<HTMLElement | null>(null)

  /**
   * 度返底部導航實際幾高，再擺高條 bar。
   *
   * ⛔ 唔寫死一個數：nav 高度 2026-08-29 改過兩次（icon 放大、行高改 1），
   *    每次都有人漏改由佢推算出嚟嘅常數。⭐ 度返實際值就永遠唔會走位。
   * ⚠️ 做法跟返 `shell.tsx` 個 `FloatBody`（佢都係 ResizeObserver 度 pills 高度）。
   */
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const nav = bar.parentElement?.querySelector('.bottom-nav')
    if (!(nav instanceof HTMLElement)) return

    const shell = bar.parentElement
    const apply = () => {
      bar.style.setProperty('--pending-bar-lift', `${nav.offsetHeight + GAP}px`)
      // ⛔ 條 bar 疊喺內容上面，所以捲動區底部要讓返佢 —— 唔係嘅話
      //    最後一張卡會匿喺佢後面，戴住手套點都撳唔到（見 app.css 尾嗰段）。
      shell?.style.setProperty('--pending-extra', `${bar.offsetHeight + GAP}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(nav)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      // ⭐ 條 bar 一收，個位要即刻還返 —— ⛔ 唔准留低一段永遠嘅空白。
      shell?.style.removeProperty('--pending-extra')
    }
  }, [celebrating, count])

  // 冇嘢未上、亦唔係啱啱傳完 ⇒ 唔出。⭐ 呢個唔算「收埋」—— N 係零，冇嘢要講。
  if (count === 0 && !celebrating) return null

  if (celebrating) {
    return (
      <div
        ref={barRef as React.RefObject<HTMLDivElement>}
        className="pending-bar pending-bar--done"
        role="status"
        data-testid="pending-bar"
      >
        <span className="pending-bar__text">{ALL_DONE_LABEL}</span>
      </div>
    )
  }

  return (
    <button
      ref={barRef as React.RefObject<HTMLButtonElement>}
      type="button"
      className="pending-bar"
      onClick={onOpenSync}
      data-testid="pending-bar"
      aria-live="polite"
    >
      <span className="pending-bar__text">{pendingLabel(count)}</span>
      <span className="pending-bar__go" aria-hidden="true">
        睇同步 ›
      </span>
    </button>
  )
}
