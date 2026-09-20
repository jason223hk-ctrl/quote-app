import { useEffect, useRef } from 'react'
import { ALL_DONE_LABEL, pendingLabel } from '../lib/pendingCount'
import { usePendingCount } from '../lib/usePendingCount'

/**
 * 「未上載 N 張」—— **釘喺成版最頂嗰條 bar。**
 *
 * ⛔⛔⛔ **2026-09-06 拍板嗰條「① 擺喺底部導航上面」已經作廢，⛔ 唔准照返。**
 *
 * **Jason 2026-09-16 原話：「47，可以撳走，宜家個版位遮住左新增工程個 fab」，
 * 追問之後定案：「細條啲既 bar 放最頂」。**
 *
 * ⚠️⚠️ **點解要推翻 —— ⛔ 唔准淨係記住結論**
 *
 * 實測（390×844 真 render，`tools/ui-check/measure.mjs`）：
 *
 * ```
 * 條 bar      y 703 – 749
 * 加工程 FAB   y 684 – 742      ← 中心點 (343, 713)
 * elementFromPoint(343, 713) → data-testid="pending-bar"   ⛔ 唔係 FAB
 * ```
 *
 * ⇒ **戴住手套嗰個人撳個 FAB 個正正中央，撳到嘅係條 bar，跳咗去同步頁。**
 * ⭐ 而嗰陣 `ui:check` 係**全綠**嘅：「撳得到」嗰把尺係「25 點有一點通就算數」，
 *    FAB 四隻角仲露住 ⇒ 佢照綠。**又一次：一把尺量唔到嘅嘢，佢綠燈證明唔到佢冇事。**
 *    ⇒ 所以今次一齊加咗 `centreHit`（中心點要打到自己）。
 *
 * ⭐⭐ **Jason 自己揀嗰個做法保住咗規矩**：佢本來講「可以撳走」——
 *    ⚠️ 嗰樣會直接踩爛下面「⛔ 唔准有得撳走」嗰條。追問之後佢改為
 *    「細條啲 ＋ 放最頂」，⭐ **既解決咗 FAB 被遮，又一條規矩都冇拆。**
 *
 * **今日仍然作數嗰四條**（2026-09-06 五條入面除咗位置嗰條）：
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
   * 度返條 bar 自己實際幾高，寫落 `.app--float` 個 `--pending-top`。
   *
   * ⭐ **點解仲要度**：條 bar 而家係 flex 仔，`.bheader` / `.hhero` 嗰啲
   *    **自己會順住落**，⛔ 唔使人幫手。⚠️ 但 `.float-cards-scroll` 同
   *    `.float-pills-layer` 係 `position: absolute` —— **佢哋唔識跟 flex 仔落**，
   *    唔推佢哋一推，成個浮卡層就會由畫面頂開始，匿咗半橛喺條 bar 後面。
   *
   * ⛔ 唔寫死一個數：條 bar 高度跟字體大細同 `safe-area-inset-top` 變
   *    （瀏海機同冇瀏海機唔同高）。⭐ 度返實際值就永遠唔會走位。
   * ⚠️ 做法跟返 `shell.tsx` 個 `FloatBody`（佢都係 ResizeObserver 度 pills 高度）。
   */
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const shell = bar.parentElement

    const apply = () => shell?.style.setProperty('--pending-top', `${bar.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      // ⭐ 條 bar 一收，個位要即刻還返 —— ⛔ 唔准留低一段永遠嘅空白。
      shell?.style.removeProperty('--pending-top')
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
        查看同步 ›
      </span>
    </button>
  )
}
