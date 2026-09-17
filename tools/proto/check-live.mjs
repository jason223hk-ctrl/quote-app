#!/usr/bin/env node
/*
 * 交條原型 link 出去**之前**，問返條 link 本身派緊乜。
 *
 * ⭐⭐⭐ **點解要有呢個 —— ⛔ 唔准淨係記住結論**
 *
 * **2026-09-16**：修咗（甲）嗰個「撳完冇反應」，`git push` 成功，
 * GitHub 上面 branch head 確認係新 commit。⇒ 我就咁交咗條 link 出去。
 *
 * ⚠️⚠️ **但 Cloudflare Pages 根本冇 build 過嗰個 commit。**
 * 條 GitHub comment 停咗喺上一個 commit，`14:41:53Z` 之後再冇郁。
 * ⇒ **條 preview link 派緊嘅，仲係未修嗰份。**
 *
 * ⭐ 對方 fetch 返個真內容 grep 先揾到：
 *
 * ```
 * fetch('/proto-status-cell.html', { cache: 'no-store' })
 *   → 92967 bytes，相隔三分鐘兩次一模一樣
 *   → grep "scrollTop = to" / "behavior:'auto'"  ⇒ 零個
 *   → 個 handler 逐隻字仲係 scrollTo({ behavior: 'smooth' })
 * ```
 *
 * ⚠️⚠️ **而未修嗰份喺佢部機上面，症狀正正就係「撳完冇反應」** ——
 * 即係佢會**撳到舊嗰份、見到個病、然後拍板話呢個做法唔得**。
 * ⭐ **一個錯嘅理由，一個可能錯嘅決定。**
 *
 * ⇒ **規矩：`git push` 咗 ⛔ 唔等於條 link 派緊新嗰份。**
 *   交出去之前，**攞返條 link 嘅真內容**對一對。
 *   （「Merged badge ≠ 上咗線」嗰條嘅孫，見 `docs/開發紀錄.md` 附錄 B。）
 *
 * 跑法（要一部出到街嘅機）：
 *   node tools/proto/check-live.mjs https://claude-proto-status-cell.sylvan-quote.pages.dev/proto-status-cell.html
 *
 * ⚠️ 亦可以喺瀏覽器 Console 一句搞掂：
 *   fetch(location.href, {cache:'no-store'}).then(r=>r.text()).then(t=>
 *     console.log(t.match(/id="stamp">(\w+)</)?.[1], t.length))
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const url = process.argv[2]
if (!url) {
  console.error('用法：node tools/proto/check-live.mjs <條原型 link>')
  process.exit(2)
}

const local = fs.readFileSync(path.join(ROOT, 'public/proto-status-cell.html'), 'utf8')
const stampOf = (text) => text.match(/id="stamp">([0-9a-f]{7})</)?.[1] ?? null
const want = stampOf(local)
if (!want) {
  console.error('⛔ 本機嗰份都揾唔到指紋 —— 先跑 node tools/proto/build-status-cell.mjs')
  process.exit(2)
}

/* ⛔ `cache: 'no-store'` 缺唔得 —— ⚠️ 唔加就有機會問咗自己部機個 cache，
   而咁樣就等於「自己問自己」，正正係呢個檔要防嘅嘢。 */
const res = await fetch(url, { cache: 'no-store' })
const text = await res.text()
const got = stampOf(text)

console.log(`本機指紋 : ${want}`)
console.log(`線上指紋 : ${got ?? '⛔ 揾唔到（線上嗰份舊到未有指紋）'}`)
console.log(`線上大細 : ${text.length} 字`)

/* ⭐ 除咗指紋，再直接對返「修咗嗰句」——
   ⛔ 唔淨係信個指紋：指紋答「係咪同一份」，呢兩句答「修咗嗰樣喺唔喺度」。 */
const marks = [
  ['減少動態嗰條路', "matchMedia('(prefers-reduced-motion: reduce)').matches"],
  ['直接到位', 'scroll.scrollTop = to'],
  ['機殼釘死 727', '--frame-h: 727px'],
]
let bad = got !== want
console.log(got === want ? '  ✓ 指紋對得上' : '  ✗ ⛔⛔ 指紋對唔上 —— 條 link 派緊嘅⛔ 唔係你以為嗰份')
for (const [name, needle] of marks) {
  const ok = text.includes(needle)
  if (!ok) bad = true
  console.log(`  ${ok ? '✓' : '✗ ⛔⛔'} ${name}`)
}

console.log(bad ? '\n⛔ ⛔ 唔准交呢條 link 出去。' : '\n✓ 條 link 派緊嘅就係本機呢份，交得。')
process.exit(bad ? 1 : 0)
