import { useEffect, useRef } from 'react'

/**
 * 一行紅色錯誤字，**而且會自己拉入畫面**。
 *
 * ⭐⭐ **點解要有呢件嘢 —— ⛔ 唔准淨係記住結論**
 *
 * 2026-09-14 Jason 喺真機刪唔到「Testing01」，佢嘅形容係
 * **「撳咗冇反應」**：冇錯誤訊息、個工程仲喺度。
 *
 * ⚠️ 但查落去，**訊息其實有出**。問題係出咗喺睇唔到嘅地方 ——
 * 呢一行紅字寫喺 `<form>` 入面（儲存掣上面），而「刪除」粒掣喺
 * `</form>` 之後嗰張 `.card danger-zone`，中間隔住成個現場資料表。
 *
 * 喺 390×844 度量返（改咗個對數殼令刪除必定失敗，再撳落去）：
 *
 * ```
 * 訊息有冇出喺 DOM: true
 * 訊息喺畫面邊個位 top: -1540      ← ⛔ 畫面頂上面 1540px
 * 訊息喺唔喺畫面入面: false
 * 訊息喺手指上面幾多 px: 2037      ← ⛔⛔
 * ```
 *
 * ⭐ **2037px 就係「撳咗冇反應」嘅全部真相。**
 * ⛔ 唔係 handler 冇跑、⛔ 唔係只入咗 console —— 係出咗，喺兩千 pixel 之外。
 *
 * ⭐⭐ **點解揀「拉入畫面」而唔係「搬去粒掣隔籬」**（Jason 2026-09-14 拍板「甲，先止血」）：
 *
 *   · 拉入畫面 ⇒ **⛔ 一粒新 pixel 都冇加**，用返同一個已批准嘅紅字組件 ⇒
 *     唔觸發 CLAUDE.md §2.11 原型先行 ⇒ **即日出得**。
 *   · 搬去粒掣隔籬 ⇒ 係**新版面**，要先出可撳原型俾 Jason 喺手機撳過拍板。
 *     ⭐ 嗰樣**照樣要做**，排喺原型嗰條隊（⛔ 唔係「以後再算」）——
 *     只係唔應該為咗一個零 pixel 嘅修改，令「撳咗冇反應」多留幾日。
 *
 * ⚠️ **代價要講白**：畫面會彈返上去，離開你隻手指嗰個位，一下係有啲突兀。
 *    ⭐ 但「突兀」好過「乜都冇發生」—— 後者令人一路撳落去。
 *
 * ⭐⭐ **⛔ 唔止用喺成版嘢度 —— 刪工程個彈窗一樣要用。**
 *    ⚠️ 2026-09-14 影相驗返先發現：彈窗中間嗰段係一個**寫死高度嘅捲動框**
 *    （186px，為咗釘死兩粒掣嘅位）。工程名長嗰陣，錯誤訊息就出咗喺**框底之外** ——
 *    ⭐ 同「喺手指上面 2037px」係**同一個病**，淨係細部咗個框咁解。
 *    `scrollIntoView` 會捲最近嗰個捲動祖先，所以擺喺框入面一樣有效。
 */
export default function ErrorNotice({
  message,
  testId,
}: {
  message: string | null
  /**
   * ⚠️ 淨係俾對數個殼／測試認人用，⛔ 唔改任何樣式。
   * ⭐ 加咗佢，個彈窗換走自己嗰行紅字改用呢個組件嗰陣，把尺唔使跟住改。
   */
  testId?: string
}) {
  const ref = useRef<HTMLParagraphElement | null>(null)
  /**
   * 上次已經拉過嗰句。⛔ 同一句嘢唔准拉兩次 ——
   * ⚠️ 唔係嘅話，任何一次 re-render（打字、載入完）都會再抢一次畫面。
   */
  const shown = useRef<string | null>(null)

  useEffect(() => {
    if (message === null || message === '') {
      shown.current = null
      return
    }
    if (shown.current === message) return
    shown.current = message

    const node = ref.current
    if (!node) return
    // `block: 'center'` ⇒ 拉到畫面中間，⛔ 唔係啱啱好貼住頂 —— 貼住頂好易
    // 俾波浪 header 蓋住半行。
    node.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // ⭐ focus 唔係為咗好睇：讀屏會即刻讀出嚟，而鍵盤／輔助操作亦會跳咗過嚟。
    //    ⛔ `preventScroll` 一定要開 —— 唔係嘅話 focus 自己會再拉一次，
    //    同上面個 smooth 打交，畫面會抽一抽。
    node.focus({ preventScroll: true })
  }, [message])

  if (message === null || message === '') return null

  return (
    // ⛔ class 一個字都冇改過 —— 呢個係已批准嗰行紅字，⛔ 唔係一個新設計。
    //    `tabIndex={-1}` 淨係令佢 focus 得到，⛔ 唔會入 tab 次序、⛔ 唔改任何樣式。
    <p className="notice notice--error" role="alert" tabIndex={-1} ref={ref} data-testid={testId}>
      {message}
    </p>
  )
}
