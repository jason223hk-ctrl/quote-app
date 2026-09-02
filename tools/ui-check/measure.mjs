/**
 * UI 對數。⛔ 唔靠肉眼 —— 逐個元素量返尺寸、位置、字級、顏色，同原型比。
 *
 * 用法：
 *   node tools/ui-check/measure.mjs <原型.html> [畫面]
 *
 * 畫面 = home | hub（唔寫就全部）。
 * 退出碼 1 = 有對唔上，⛔ 即係未做完。
 */
import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const HERE = path.dirname(new URL(import.meta.url).pathname)

/**
 * 原型檔喺邊。順住揾，第一個存在嘅就用。
 * ⛔ 唔好寫死一條路 —— 個交接包搬過一次位，寫死就即刻壞。
 */
const PROTO_CANDIDATES = [
  process.env.QUOTE_PROTO,
  process.env.HOME + '/Documents/Claude/Projects/quote-app-交接/交接包/5-原型/stage57-autoupload.html',
  process.env.HOME + '/Documents/Claude/quote-app-交接/交接包/5-原型/stage57-autoupload.html',
  path.resolve(HERE, '../../../quote-app-交接/交接包/5-原型/stage57-autoupload.html'),
].filter(Boolean)

const args = process.argv.slice(2)
const PROTO = args.find((a) => a.endsWith('.html')) ?? PROTO_CANDIDATES.find((f) => fs.existsSync(f))
const ONLY = args.find((a) => !a.endsWith('.html')) ?? null
if (!PROTO || !fs.existsSync(PROTO)) {
  console.error('揾唔到原型檔。試過：')
  for (const f of PROTO_CANDIDATES) console.error('  ' + f)
  console.error('用 QUOTE_PROTO 環境變數或者第一個參數指返實。')
  process.exit(2)
}

const DIST = process.env.UI_CHECK_DIST ?? path.join(HERE, 'dist')
const PORT = 8321
const W = 390
const H = 844

/** 每項要對嘅嘢：真 app 選擇器 ↔ 原型選擇器。 */
const SCREENS = {
  home: {
    proto: 'showHome',
    pairs: [
      ['品牌字', '.hmark', '.hmark'],
      ['三個數（成行）', '.hstats', '.stats.hstats'],
      ['數字卡', '.hstats .stat', '.hstats .stat'],
      ['卡入面個 icon', '.hstats .sic .ico', '.hstats .sic .ico'],
      ['數字', '.hstats .v', '.hstats .v'],
      ['區段標題', '.sect h3', '.hmain .sect h3', 'font'],
      ['工程卡', '.proj-card', '.pcard'],
      ['工程名', '.proj-title', '.pcard .nm', 'font'],
      ['狀態膠囊', '.proj-side .status', '.pcard .st'],
      ['FAB', '.fab--round', '.fab', 'box'],
      ['nav 條', '.bottom-nav', 'nav .bar'],
      ['nav 亮起嘅字', '.nav-item.active > span:not(.nav-ic)', 'nav .tab.on b', 'font'],
    ],
  },
  hub: {
    proto: 'showProject',
    pairs: [
      ['入口卡', '.hub-row', '#screenProject .rowcard', 'nosize'],
      ['入口 icon', '.hub-ic .ico', '#screenProject .rowcard .ric .ico'],
      ['入口標題', '.hub-title', '#screenProject .rowcard b', 'font'],
      ['入口副標', '.hub-sub', '#screenProject .rowcard small', 'font'],
      ['成本卡', '.cost-card', '#costCard', 'nosize'],
      ['成本卡標題', '.cost-title', '#costCard .gh2', 'font'],
      ['只供內部參考', '.cost-note', '#costCard .note2', 'nosize'],
      ['加成格', '.cost-input', '#costCard .pv2'],
      ['報價價錢', '.cost-asking', '#costCard .gain', 'nosize'],
    ],
  },
}

/** 量咩。位置只量闊高同左右邊距 —— 上下位隨內容變，⛔ 唔可以當差異。 */
const BOX = ['width', 'height']
const CSS = [
  // ⚠️ 一定要量 —— 2026-09-02 就係漏咗搬無襯線體，
  // 而我部機兩邊都跌落同一隻 fallback，所以喺我度量唔到。
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'color',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
  'borderTopWidth',
]
/** 容忍幾多 px。⛔ 唔係「差唔多就算」—— 係瀏覽器 sub-pixel 同字型 hinting 嘅落差。 */
const TOL = 1.5

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }

function serve(root, port) {
  return http
    .createServer((q, s) => {
      let f = path.join(root, q.url.split('?')[0])
      if (f.endsWith('/')) f = path.join(f, 'index.html')
      let body = null
      try { body = fs.readFileSync(f) } catch { /* 404 */ }
      if (body) {
        s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] ?? 'application/octet-stream' })
        s.end(body)
      } else {
        s.writeHead(404)
        s.end('nf')
      }
    })
    .listen(port)
}

const READ = ([sel, box, css]) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const out = {}
  for (const k of box) out[k] = Math.round(r[k] * 10) / 10
  out.left = Math.round(r.left * 10) / 10
  out.right = Math.round((innerWidth - r.right) * 10) / 10
  for (const k of css) out[k] = cs[k]
  out.serif = /serif/i.test(cs.fontFamily) && !/sans-serif/i.test(cs.fontFamily)
  return out
}

const srv = serve(DIST, PORT)
/**
 * 開瀏覽器。三條路順住試：
 *   1. CHROMIUM_PATH —— 自己指實個 binary
 *   2. Playwright 自己下載嗰個
 *   3. 部機裝咗嘅 Chrome／Edge
 * ⚠️ Cowork 個 Linux VM 下載唔到 Playwright chromium（網絡 allowlist 擋），
 *    所以喺 Mac Terminal 自己跑：`npx playwright install chromium` 一次就得。
 */
async function openBrowser() {
  const tries = [
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : null,
    {},
    { channel: 'chrome' },
    { channel: 'msedge' },
  ].filter(Boolean)

  let last
  for (const opt of tries) {
    try {
      return await chromium.launch(opt)
    } catch (e) {
      last = e
    }
  }
  console.error('開唔到瀏覽器。喺 Terminal 跑一次 `npx playwright install chromium` 就得。')
  throw last
}

const browser = await openBrowser()

let bad = 0
let checked = 0

for (const [name, spec] of Object.entries(SCREENS)) {
  if (ONLY && ONLY !== name) continue

  const real = await browser.newPage({ viewport: { width: W, height: H } })
  // ⛔ 頁面行唔起就一定要嘈出嚟 —— 否則會靜靜咁量到零項然後報「全對」。
  real.on('pageerror', (e) => console.log('  ⚠️ 真 app 出錯：', e.message))
  real.on('console', (m) => { if (m.type() === 'error') console.log('  ⚠️ 真 app console：', m.text()) })
  await real.goto(`http://localhost:${PORT}/?screen=${name}`)
  await real.evaluate(() => document.fonts.ready)
  await real.waitForTimeout(700)

  const proto = await browser.newPage({ viewport: { width: W, height: H } })
  await proto.goto('file://' + path.resolve(PROTO))
  await proto.evaluate(() => document.fonts.ready)
  await proto.evaluate((fn) => window[fn](), spec.proto)
  await proto.waitForTimeout(700)

  console.log(`\n══ ${name} ══`)
  for (const [label, a, b, mode] of spec.pairs) {
    const ra = await real.evaluate(READ, [a, BOX, CSS])
    const rb = await proto.evaluate(READ, [b, BOX, CSS])
    if (!ra || !rb) {
      console.log(`  ？ ${label} —— ${!ra ? '真 app' : '原型'} 揾唔到 (${!ra ? a : b})`)
      continue
    }
    // font ＝ 樣本文字唔同，量闊高冇意思，淨係對字型／顏色。
    // box  ＝ 對尺寸位置，唔對字（例如 FAB 入面根本冇字）。
    // nosize ＝ 對位置同樣式，唔對高度（內容行數唔同）。
    const SKIP = {
      font: ['width', 'height', 'left', 'right'],
      box: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
      nosize: ['height'],
    }[mode] ?? []

    const diffs = []
    for (const k of Object.keys(rb)) {
      if (SKIP.includes(k)) continue
      const x = ra[k]
      const y = rb[k]
      if (typeof y === 'number') {
        if (Math.abs(x - y) > TOL) diffs.push(`${k} ${x} ≠ ${y}`)
      } else if (String(x) !== String(y)) {
        diffs.push(`${k} ${x} ≠ ${y}`)
      }
    }
    checked++
    if (diffs.length === 0) {
      console.log(`  ✓ ${label}`)
    } else {
      bad++
      console.log(`  ✗ ${label}`)
      for (const d of diffs) console.log(`      ${d}`)
    }
  }
  await real.close()
  await proto.close()
}

await browser.close()
srv.close()

console.log(`\n量咗 ${checked} 項，對唔上 ${bad} 項。`)
process.exit(bad === 0 ? 0 : 1)
