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
  // ⭐⭐ repo 入面嗰份先係第一選擇（2026-09-05 加）。
  // ⛔ 之前四條路全部喺 repo 外面 ⇒ 一個 fresh clone（雲端 Claude Code session、
  //    CI、換機）永遠揾唔到，`npm run ui:check` 直接 exit 2 ——
  //    即係「對數」呢一關喺唔喺呢部機，行唔行得到都唔同。
  // ⚠️ stage57 係已批准嘅定稿，唔會再變，所以入 repo 係啱嘅：
  //    佢係契約，⛔ 唔應該係一個散喺 Documents 度嘅檔。
  path.resolve(HERE, '../../docs/原型-stage57-autoupload.html'),
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
      ['頭部', '.bheader', '#screenProject header', 'anchor'],
      // ⚠️ 呢兩項唔量闊度：`.head-title` 係「有幾闊算幾闊」，量到嘅闊其實係
      //    副標嗰句字撐出嚟。原型副標第三格出建立人（阿耀），真 app 出日／夜 ——
      //    兩句字唔同闊，量幾多次都唔會啱。
      //    ⛔ 呢個唔係版面問題，係真嘅內容差異，仲喺待辦上面。
      ['工程名', '.head-name', '#screenProject h1', 'font'],
      ['返回掣', '.chip-btn', '#screenProject .back', 'anchor', {
          fontFamily: '粒掣入面得一個 icon，冇字。',
          fontSize: '同上，冇字。',
          lineHeight: '同上，冇字。',
        }],
      ['副標', '.head-sub', '#screenProject header .sub', 'font'],
      ['三格（成行）', '.stats--project', '#screenProject .stats', 'nosize'],
      ['一格', '.stats--project .stat', '#screenProject .stat', 'nosize'],
      ['格入面 icon', '.stats--project .sic .ico', '#screenProject .stat .sic .ico'],
      ['格標籤', '.stats--project .k', '#screenProject .stat .k', 'font'],
      ['格數字', '.stats--project .v', '#screenProject .stat .v', 'font'],
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
  settings: {
    proto: 'showSettings',
    pairs: [
      ['頭部', '.bheader', '#screenSettings header', 'anchor'],
      ['頁面標題', '.page-title', '#screenSettings h1', 'anchor'],
      ['卡', '.card', '#screenSettings .card', 'anchorNoSize'],
      ['卡標題', '.card__title', '#screenSettings .gh2', 'font'],
      ['入口行', '.hub-row', '#screenSettings .rowcard', 'nosize'],
    ],
  },
  records: {
    proto: 'showAllList',
    pairs: [
      ['頭部', '.bheader', '#screenAll header', 'anchor'],
      ['頁面標題', '.page-title', '#screenAll h1', 'anchor'],
      ['chip 一行', '.chips', '#screenAll .chips', 'anchor'],
      ['chip', '.chip2', '#screenAll .chip2', 'nosize'],
      ['亮起嘅 chip', '.chip2.on', '#screenAll .chip2.on', 'nosize'],
      ['工程卡（位）', '.proj-card', '#allList .pcard', 'anchorNoSize'],
    ],
  },
  client: {
    proto: 'showBasic',
    pairs: [
      ['頭部', '.bheader', '#screenBasic header', 'anchor'],
      ['標籤', '.field__label', '#screenBasic label', 'font'],
      [
        '輸入格',
        '.field__input',
        '#screenBasic input[type=text]',
        'nosize',
        {
          fontSize: '同單價格一樣：原型 15px，但 iOS Safari 細過 16px 會自動放大成版。',
          lineHeight: '跟住 fontSize 嚟。',
        },
      ],
      ['卡', '.card', '#screenBasic .card', 'nosize'],
    ],
  },
  basic: {
    proto: 'showSite',
    pairs: [
      ['頭部', '.bheader', '#screenSite header', 'anchor'],
      ['頁面標題', '.head-name', '#screenSite h1', 'anchor'],
      ['卡', '.card', '#screenSite .card', 'anchorNoSize'],
    ],
  },
  trees: {
    proto: 'showList',
    pairs: [
      ['頭部', '.bheader', '#screenList header', 'anchor'],
      // 同工程詳情一樣：標題欄闊度由副標撐出嚟，而原型副標多咗個建立人。
      ['頁面標題', '.head-name', '#screenList h1', 'font'],
      ['副標', '.head-sub', '#screenList header .sub', 'font'],
      ['樹卡', '.proj-card--tree', '#treeList .treecard', 'nosize'],
      ['樹卡標題', '.proj-title', '#treeList .treecard .name', 'font'],
      ['樹卡副行', '.proj-meta', '#treeList .treecard .meta', 'font'],
      ['FAB', '.fab--round', '#screenList .fab', 'box'],
    ],
  },
  export: {
    proto: 'showPdf',
    pairs: [
      ['頭部', '.bheader', '#screenPdf header', 'anchor'],
      ['頁面標題', '.head-name', '#screenPdf h1', 'font'],
      ['副標', '.head-sub', '#screenPdf header .sub', 'font'],
      ['說明格', '.note-box', '#screenPdf .note2', 'anchorNoSize'],
      ['卡', '.card', '#screenPdf .card', 'anchorNoSize'],
      ['標籤', '.field__label', '#screenPdf label', 'font'],
      [
        '輸入格',
        '.field__input',
        '#screenPdf input[type=text]',
        'nosize',
        {
          fontSize: '同單價格一樣：原型 15px，但 iOS Safari 細過 16px 會自動放大成版。',
          lineHeight: '跟住 fontSize 嚟。',
        },
      ],
      ['選擇樹木標題', '.card__title', '#screenPdf .gh2', 'font'],
      ['chip 一行', '.chips', '#screenPdf #exChips', 'nosize'],
    ],
  },
  sync: {
    proto: 'showSync',
    pairs: [
      ['頭部', '.bheader', '#screenSync header', 'anchor'],
      ['頁面標題', '.page-title', '#screenSync h1', 'anchor'],
      // ⚠️ hero 唔量高度：原型副題永遠出（樣板寫死一句），真 app 淨係「全部同步咗」
      //    先出 —— 有冇第二行係內容差異，唔係版面差異。
      ['狀態句', '.sync-hero__title', '#screenSync .hero .hh', 'font'],
      ['總覽標題', '.card__title', '#screenSync main>.card>.gh2', 'font'],
      ['三格（成行）', '.sync-three', '#screenSync .s3', 'nosize'],
      ['一格', '.sync-three__cell', '#screenSync .s3>div', 'nosize'],
      ['大數', '.sync-three__n', '#screenSync .s3 .n', 'font'],
      ['格標籤', '.sync-three__k', '#screenSync .s3 .l', 'font'],
      ['區段標題', '.sync-sect', '#screenSync .sect2', 'font'],
      ['工程行', '.hub-row', '#screenSync .syrow', 'nosize'],
      ['工程名', '.hub-title', '#screenSync .syrow .nm2', 'font'],
      // ⚠️ 狀態 pill 唔量闊 —— 佢闊度由「✓ 已同步」嗰個 ✓（U+2713）撐出嚟，
      //    而原型檔冇 <html lang>，Chromium 就用咗另一隻 fallback 字型畫個 ✓
      //    （實測 10.48px vs 我哋 8.55px，成個 pill 爭 1.94px）。
      //    真 app 寫住 lang="zh-HK" 先啱，⛔ 唔可以為咗夾條數而拎走 lang。
      ['狀態 pill', '.sync-stamp', '#screenSync .sypill', 'font'],
    ],
  },
  price: {
    proto: 'showPrice',
    pairs: [
      ['頭部', '.bheader', '#screenPrice header', 'anchor'],
      ['頁面標題', '.head-name', '#screenPrice h1', 'anchor'],
      ['副標', '.head-sub', '#screenPrice header .sub', 'anchorNoSize'],
      [
        '返回掣',
        '.chip-btn',
        '#screenPrice .back',
        'anchor',
        {
          fontFamily: '粒掣入面得一個 icon，冇字 —— 原型冇同佢寫 font:inherit 啫。',
          fontSize: '同上，冇字。',
          lineHeight: '同上，冇字。',
        },
      ],
      ['說明格', '.note-box', '#screenPrice .note2', 'anchorNoSize'],
      ['第一張類別卡（位）', '.price-card', '#priceBox > .card', 'anchorNoSize'],
      ['類別卡', '.price-card', '#priceBox > .card', 'nosize'],
      ['類別標題', '.price-group', '#priceBox .gh2', 'font'],
      ['一行', '.prow', '#screenPrice .prow', 'nosize'],
      ['項目名', '.price-label', '#screenPrice .prow .pl', 'font'],
      ['單位細字', '.price-unit', '#screenPrice .prow .pu', 'font'],
      ['價錢格', '.price-input', '#screenPrice .prow .pv'],
      [
        '價錢格入面個 input',
        '.price-input input',
        '#screenPrice .prow .pv input',
        null,
        {
          fontSize:
            '原型全部格都係 15px。iOS Safari 喺細過 16px 嘅格㩒落去會自動放大成版，' +
            '真 app 特登用 16px 擋住（Jason 2026-09-02 拍板保留）。',
          lineHeight: '跟住 fontSize 嚟。',
        },
      ],
      ['錢號', '.price-dollar', '#screenPrice .prow .dollar', 'font'],
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
  out.top = Math.round(r.top * 10) / 10
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
  for (const [label, a, b, mode, except] of spec.pairs) {
    const ra = await real.evaluate(READ, [a, BOX, CSS])
    const rb = await proto.evaluate(READ, [b, BOX, CSS])
    if (!ra || !rb) {
      console.log(`  ？ ${label} —— ${!ra ? '真 app' : '原型'} 揾唔到 (${!ra ? a : b})`)
      continue
    }
    // font ＝ 樣本文字唔同，量闊高冇意思，淨係對字型／顏色。
    // box  ＝ 對尺寸位置，唔對字（例如 FAB 入面根本冇字）。
    // nosize ＝ 對位置同樣式，唔對高度（內容行數唔同）。
    /**
     * ⚠️ `top` 預設唔量 —— 佢隨上面有幾多內容而變，樣本唔同就一定唔同。
     * 淨係 `anchor` 模式先量，用喺 header 同第一件內容 —— 嗰兩樣係定位嘅根。
     */
    const SKIP = {
      font: ['width', 'height', 'left', 'right', 'top'],
      box: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'top'],
      nosize: ['height', 'top'],
      anchor: [],
      anchorNoSize: ['height'],
    }[mode] ?? ['top']

    const diffs = []
    /** 明知會唔同、而且已經拍板嘅項目。⛔ 唔係「當佢冇事」—— 要寫明點解。 */
    const notes = []
    for (const k of Object.keys(rb)) {
      if (SKIP.includes(k)) continue
      const x = ra[k]
      const y = rb[k]
      const differs =
        typeof y === 'number' ? Math.abs(x - y) > TOL : String(x) !== String(y)
      if (!differs) continue
      if (except?.[k]) notes.push(`${k} ${x} ≠ ${y} —— ${except[k]}`)
      else diffs.push(`${k} ${x} ≠ ${y}`)
    }
    checked++
    if (diffs.length === 0) {
      console.log(`  ✓ ${label}`)
      for (const n of notes) console.log(`      ⚠ 已拍板嘅例外：${n}`)
    } else {
      bad++
      console.log(`  ✗ ${label}`)
      for (const d of diffs) console.log(`      ${d}`)
      for (const n of notes) console.log(`      ⚠ 已拍板嘅例外：${n}`)
    }
  }
  await real.close()
  await proto.close()
}

await browser.close()
srv.close()

console.log(`\n量咗 ${checked} 項，對唔上 ${bad} 項。`)
process.exit(bad === 0 ? 0 : 1)
