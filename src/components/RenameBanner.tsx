import { useState } from 'react'
import { bannerText } from '../lib/renamePending'
import { renameTreeFiles } from '../lib/renameTree'
import { useRenamePending } from '../lib/useRenamePending'
import type { QuoteTree } from '../lib/trees'

/**
 * 樹木頁頂嗰條黃色橫幅 —— P3f §4.6 第 1 點：**只喺真係失敗先出** ＋ 一粒「再試」。
 *
 * ⭐ 再試 ＝ 再叫一次 `/rename-tree`（Worker 保證重試安全：已經叫啱嘅⛔ 唔郁）。
 * ⭐ 改返成功 ⇒ 記錄清走 ⇒ 呢條同設定頁嗰行一齊冇（§4.6 第 3 點）。
 * ⚠️ 撞名嗰種再試幾多次都一樣 —— Worker 特登唔改，句嘢叫人截圖搵 Jason。
 */
export default function RenameBanner({
  tree,
  recordId,
  accessToken,
}: {
  tree: QuoteTree
  recordId: string
  accessToken: string
}) {
  const items = useRenamePending()
  const item = items.find((one) => one.treeId === tree.id) ?? null
  const [busy, setBusy] = useState(false)
  const text = bannerText(item)
  if (item === null || text === null) return null

  async function retry() {
    setBusy(true)
    try {
      // ⛔ `renameTreeFiles` 唔會 throw —— 失敗會寫返入記錄，條橫幅照出。
      await renameTreeFiles({ accessToken, treeId: tree.id, recordId, treeNo: tree.tree_no })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="note-box note-box--warn" role="status" data-testid="rename-banner">
      <p>{text}</p>
      {item.reasons.map((why) => (
        <p key={why} className="muted">
          {why}
        </p>
      ))}
      {item.hitLimit && <p className="muted">一次最多處理 12 張，尚有未處理的。</p>}
      <button
        className="button button--secondary"
        type="button"
        data-testid="rename-retry"
        disabled={busy}
        onClick={() => {
          retry().catch((caught: unknown) => console.error('[quote-app] rename retry:', caught))
        }}
      >
        {busy ? '再試中⋯' : '再試'}
      </button>
    </div>
  )
}
