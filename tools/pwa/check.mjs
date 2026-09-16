/*
 * 量「加到主畫面之後係咪一隻真 app」。
 *
 * ⭐⭐ **點解要一把尺 —— ⛔ 唔准淨係讀 code**
 *
 * 2026-09-16 Jason 報料：「報價 app 加到主畫面之後仲係有網址列，tree app 冇」。
 * ⚠️ 呢樣**讀 repo 係睇唔出嘅** —— 要真係打開個網站、問返個瀏覽器
 * 「你搵唔搵到個 manifest」。當日就係咁樣量出嚟：
 *
 *     sylvan-quote.pages.dev   link[rel=manifest] → null
 *     tree-app-v7.pages.dev    /manifest.webmanifest → 200，display: standalone
 *
 * ⇒ 所以呢把尺量嘅係**瀏覽器見到啲乜**，⛔ 唔係「個檔喺唔喺 repo 度」。
 *
 * 跑法：npm run build 之後 `node tools/pwa/check.mjs`
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const DIST = path.join(ROOT, 'dist')
const PORT = 8379
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  // ⚠️ ⛔ 唔可以當佢係 `application/json` —— Chrome 認得兩個，但
  //    `application/manifest+json` 先係規格寫嘅嗰個。Cloudflare Pages 自己會派啱。
  '.webmanifest': 'application/manifest+json',
}

const srv = http
  .createServer((q, s) => {
    const p = path.join(DIST, decodeURIComponent(q.url.split('?')[0]))
    const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(DIST, 'index.html')
    s.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' })
    fs.createReadStream(f).pipe(s)
  })
  .listen(PORT)

let bad = 0
const say = (ok, line) => {
  if (!ok) bad += 1
  console.log(`  ${ok ? '✓' : '✗ ⛔⛔'} ${line}`)
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 390, height: 727 } })
await page.goto(`http://localhost:${PORT}/`)
await page.waitForTimeout(500)

console.log('\n══ 瀏覽器搵唔搵到個 manifest ══')
const href = await page.evaluate(
  () => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
)
say(href !== null, `link[rel=manifest] → ${href ?? 'null（⛔ 就係 2026-09-16 嗰個病）'}`)

const res = href ? await page.request.get(`http://localhost:${PORT}${href}`) : null
say(res !== null && res.ok(), `攞個 manifest → HTTP ${res ? res.status() : '—'}`)
const mf = res && res.ok() ? await res.json() : {}

console.log('\n══ manifest 入面啲嘢 ══')
say(mf.display === 'standalone', `display = ${mf.display} （要 standalone —— 冇網址列就係靠佢）`)
say(mf.start_url === '/', `start_url = ${mf.start_url}`)
say(mf.scope === '/', `scope = ${mf.scope}`)
say(mf.theme_color === '#0D120E', `theme_color = ${mf.theme_color}`)
say(mf.background_color === '#0D120E', `background_color = ${mf.background_color}`)
say(typeof mf.name === 'string' && mf.name.length > 0, `name = ${mf.name}`)
// ⚠️ 主畫面個名用 short_name。太長 Android 會自己剪，⛔ 剪到冇人知係邊隻 app。
say(
  typeof mf.short_name === 'string' && mf.short_name.length > 0 && mf.short_name.length <= 12,
  `short_name = ${mf.short_name}（⛔ 唔准超過 12 個字，主畫面剪到就冇意思）`,
)

console.log('\n══ 三個 icon ══')
const icons = mf.icons ?? []
const want = [
  ['192x192', 'any'],
  ['512x512', 'any'],
  ['512x512', 'maskable'],
]
for (const [sizes, purpose] of want) {
  const hit = icons.find((i) => i.sizes === sizes && (i.purpose ?? 'any').includes(purpose))
  say(Boolean(hit), `${sizes} purpose=${purpose} → ${hit ? hit.src : '⛔ 冇'}`)
}
/* ⛔⛔ 512 缺唔得：Chrome 見唔到 512 就當「裝唔到」，於是**照舊整個普通捷徑** ——
   而個捷徑同真 app 喺主畫面睇落幾乎一樣，⇒ ⭐ 錯咗都冇人知。 */

for (const icon of icons) {
  const got = await page.request.get(`http://localhost:${PORT}${icon.src}`)
  say(got.ok(), `${icon.src} → HTTP ${got.status()}`)
}

console.log('\n══ iOS（⛔ 佢唔睇 manifest 個 display）══')
const ios = await page.evaluate(() => ({
  capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content ?? null,
  title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content ?? null,
  bar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content ?? null,
  touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
}))
say(ios.capable === 'yes', `apple-mobile-web-app-capable = ${ios.capable}`)
say(ios.title !== null, `apple-mobile-web-app-title = ${ios.title}`)
say(ios.bar !== null, `status-bar-style = ${ios.bar}`)
say(ios.touchIcon !== null, `apple-touch-icon = ${ios.touchIcon}`)

console.log('\n══ ⭐ 冇咗瀏覽器嗰條列，個 app 有冇嘢靠緊佢 ══')
const nav = await page.evaluate(() => ({
  historyLength: history.length,
  hash: location.hash,
  search: location.search,
}))
/* ⭐ 呢個 app **冇 router** —— 換版係 `useState<Route>`（見 `src/ui/routes.ts`）。
   ⇒ 網址由頭到尾唔會變，所以「靠瀏覽器返回」呢件事**根本冇得靠**。
   ⚠️ 但反過嚟講：standalone 之下撳 Android 返回鍵 ＝ **直接閂咗個 app**。 */
say(nav.hash === '' && nav.search === '', `網址冇 hash 冇 query（${JSON.stringify(nav)}）`)
say(
  nav.historyLength <= 2,
  `history.length = ${nav.historyLength} ⇒ ⚠️ standalone 之下撳返回鍵 ＝ 閂咗個 app`,
)

await browser.close()
srv.close()
console.log(`\n${bad === 0 ? '全部啱。' : `⛔ ${bad} 項唔啱。`}`)
process.exit(bad === 0 ? 0 : 1)
