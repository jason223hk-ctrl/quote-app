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
const ONLY = args.find((a) => !a.endsWith('.html') && !a.startsWith('--')) ?? null
/**
 * ⛔⛔ 驗返把尺本身。⭐ 一個「加咗但捉唔到」嘅檢查，比冇檢查更差 ——
 *    ⚠️ 佢會令下次有人見到綠燈就真係信。
 */
const SELF_TEST = args.includes('--self-test')
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

  /* ⭐⭐ 刪工程確認彈窗 —— **兩個極端**。⛔ 原型入面冇呢件嘢，所以冇 `pairs`：
     ⚠️ 唔係跳過咗，係根本冇尺可以對（stage57 早過呢個決定）。
     呢兩個畫面量嘅係**絕對要求**：兩粒掣撳唔撳得到、兩邊座標一唔一樣。 */
  dialog: {
    query: '',
    remember: ['delete-cancel', 'delete-confirm'],
  },
  dialoglong: {
    // ⚠️ 同上面用同一個畫面，⛔ 唔係另一個 component —— 一模一樣嘅 code，
    //    淨係內容唔同。咁對出嚟嘅先算數。
    screen: 'dialog',
    query: '&long=1',
    // 撳一下「刪除」令佢出埋錯誤 —— ⭐ 咁先係真正嘅「內容最長」。
    before: async (page) => { await page.click('[data-testid="delete-confirm"]') },
    remember: ['delete-cancel', 'delete-confirm'],
  },
}

/**
 * 「撳得到」檢查。**⛔ 呢個唔係同原型對數，係一個絕對要求。**
 *
 * ⭐⭐ **點解要有 —— ⛔ 唔准淨係記住結論**
 *
 * 2026-09-14 試過將首頁個 `<main className="hmain">` 換成共用嘅 `ScrollBody`。
 * **對數出「量咗 90 項，對唔上 0 項」—— 全綠。**
 *
 * ⚠️ 但實測用 `elementFromPoint` 打過：**「待報價」嗰粒數字卡撳唔到。**
 * `.float-cards-scroll` 帶住 `position:absolute; inset:0`，成個捲動區
 * **由頂到底蓋晒**（實測 `top: 0`、`height: 844`、`padding-top: 164px`）。
 *
 * ⭐⭐ **對數量嘅係位置，⛔ 佢唔量撳唔撳得到。** 三個數嘅位置冇郁
 *    （padding 啱好補返），所以 90／0 —— 但佢哋已經死咗。
 *
 * ⚠️ 呢個窿喺任何一張截圖上面都睇唔出，而現場同事只會覺得「撳極都冇反應」。
 *
 * ⛔⛔ **驗收標準唔係「加咗」，係「捉得到」** —— 所以有 `--self-test`：
 *    佢會**故意整返 2026-09-14 嗰個壞法**，然後要求呢個檢查**真係紅**。
 */
const HIT_SELECTOR = 'button, a[href], input, select, textarea, [role=button]'
/**
 * 每個元素撒 5×5 點，**有一個撳得到就算數**。
 * ⭐ ⛔ 唔要求全部點都通：一粒掣俾第二樣嘢遮咗一半仍然撳得到，
 *    ⚠️ 而要求全通就會出一大堆假紅，跟住冇人再理佢。
 */
const HIT_GRID = 5
const HIT_INSET = 2

/**
 * 喺瀏覽器入面行：逐個可撳元素試吓撳唔撳得到。
 *
 * ⭐⭐ **每個元素先 `scrollIntoView` 再試** —— ⛔ 唔係為咗方便。
 *    ⚠️ 一張卡喺捲動區最底俾底 nav 壓住半橛，**唔算 bug**（碌一碌就撳到）。
 *    真 bug 係「**點碌都撳唔到**」—— 而嗰種正正就係唔喺捲動區入面嘅嘢
 *    （首頁三個數就係）。先碌後試，就啱啱好分開咗呢兩種。
 */
const HIT_SCAN = ([selector, grid, inset]) => {
  const out = []
  /**
   * ⭐ 有彈窗開住嗰陣，**只掃彈窗入面**。
   * ⚠️ 後面嗰啲掣俾遮住係**應該嘅** —— 一個 modal 就係要擋住後面。
   *    ⛔ 唔分開嘅話，每個有彈窗嘅畫面都會出四粒假紅（底 nav），
   *    而假紅係最快令人唔再理呢把尺嘅嘢。
   */
  const modal = document.querySelector('[role="dialog"][aria-modal="true"]')
  const scope = modal ?? document
  for (const el of scope.querySelectorAll(selector)) {
    if (el.disabled) continue
    const cs = getComputedStyle(el)
    if (cs.pointerEvents === 'none' || cs.visibility === 'hidden' || cs.display === 'none') continue
    const first = el.getBoundingClientRect()
    if (first.width < 4 || first.height < 4) continue

    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    const x0 = Math.max(r.left + inset, 0)
    const x1 = Math.min(r.right - inset, innerWidth - 1)
    const y0 = Math.max(r.top + inset, 0)
    const y1 = Math.min(r.bottom - inset, innerHeight - 1)
    // ⛔ 碌完仲係完全喺畫面外 ⇒ 當「量唔到」，⚠️ 唔當「撳唔到」——
    //    ⭐ 報一個假紅比唔報更差。
    if (x1 < x0 || y1 < y0) continue

    let reachable = false
    let blocker = '—'
    for (let i = 0; i < grid && !reachable; i += 1) {
      for (let j = 0; j < grid && !reachable; j += 1) {
        const x = x0 + ((x1 - x0) * i) / (grid - 1)
        const y = y0 + ((y1 - y0) * j) / (grid - 1)
        const hit = document.elementFromPoint(x, y)
        if (hit && (el === hit || el.contains(hit))) reachable = true
        else if (hit && blocker === '—') {
          blocker =
            typeof hit.className === 'string' && hit.className !== ''
              ? hit.className
              : hit.tagName.toLowerCase()
        }
      }
    }
    out.push({
      reachable,
      blocker,
      tag: el.tagName.toLowerCase(),
      testid: el.dataset?.testid ?? '',
      text: (el.textContent ?? '').trim().slice(0, 16),
      cls: typeof el.className === 'string' ? el.className.slice(0, 40) : '',
    })
  }
  return out
}

/** 一粒掣而家喺邊（用嚟對「內容最短 vs 最長」）。 */
const BUTTON_BOX = (testid) => {
  const el = document.querySelector(`[data-testid="${testid}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    left: Math.round(r.left * 10) / 10,
    top: Math.round(r.top * 10) / 10,
    width: Math.round(r.width * 10) / 10,
    height: Math.round(r.height * 10) / 10,
  }
}

/**
 * ⛔⛔ 2026-09-14 嗰個壞法，逐字整返出嚟。**淨係喺 `--self-test` 用。**
 *
 * 當日係將 `<main className="hmain">` 換成 `ScrollBody`（`.float-cards-scroll`）。
 * 呢段 CSS 就係嗰個換法帶嚟嘅幾何後果，數字係當日實測：
 * `top: 0`、`height: 844`、`padding-top: 164.15px`
 * （`min(38.5vw, 184px) + 14px`，390px 闊之下 ＝ 150.15 + 14）。
 *
 * ⭐ 用返實測數字，⛔ 唔係求其寫一個蓋住成版嘅 div ——
 *    ⚠️ 一個「求其嘅遮擋」證明唔到呢把尺捉得返**當日嗰件事**。
 */
const SELF_TEST_CSS = `
  [data-testid="home-scroll"] {
    position: absolute;
    inset: 0;
    z-index: 2;
    padding-top: calc(min(38.5vw, 184px) + 14px);
  }
`

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
 * 部機本身裝咗嘅 chromium 喺邊。順住揾，存在嘅先試。
 * ⛔ 唔好寫死一條路 —— Mac、Linux、雲端 session 三邊擺法都唔同。
 */
function localChromiums() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH].filter(Boolean)
  const found = []
  for (const root of roots) {
    // ⭐ 有啲環境（雲端 session）擺咗條 symlink 喺 <root>/chromium 度，直接指住個 binary。
    found.push(path.join(root, 'chromium'))
    // 冇 symlink 就自己入去揾 chromium-<版本號> 嗰堆。
    let dirs = []
    try {
      dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium'))
    } catch {
      dirs = []
    }
    for (const d of dirs) {
      found.push(path.join(root, d, 'chrome-linux', 'chrome'))
      found.push(path.join(root, d, 'chrome-linux', 'headless_shell'))
      found.push(path.join(root, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
    }
  }
  found.push(
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  )
  return found.filter((f) => {
    try {
      return fs.statSync(f).isFile()
    } catch {
      return false
    }
  })
}

/**
 * 開瀏覽器。四條路順住試：
 *   1. CHROMIUM_PATH —— 自己指實個 binary
 *   2. Playwright 自己下載嗰個
 *   3. 部機本身裝咗嗰個 chromium（見 localChromiums）
 *   4. 部機裝咗嘅 Chrome／Edge
 * ⚠️ Cowork 個 Linux VM 下載唔到 Playwright chromium（網絡 allowlist 擋），
 *    所以喺 Mac Terminal 自己跑：`npx playwright install chromium` 一次就得。
 * ⛔ 第 3 條係 2026-09-05 加返嘅：雲端 session 部機本身有 chromium，
 *    但 Playwright 因為版本號對唔上而用唔到，第 2 條會死，跟住一路試到去搵 Edge。
 *    結果 `npm run ui:check` 要人手加 `CHROMIUM_PATH` 先行到 ——
 *    ⚠️ 一個要靠人記得嘅步驟，遲早會漏，而漏咗就等於「對數」嗰關靜靜跳咗。
 */
async function openBrowser() {
  const tries = [
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : null,
    {},
    ...localChromiums().map((executablePath) => ({ executablePath })),
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

/** 記低咗嘅掣位（`畫面·testid` → box），用嚟做「內容最短 vs 最長」嗰個對比。 */
const remembered = {}

let bad = 0
let checked = 0
/** 「撳得到」嗰組：⛔ 同上面 90 項分開數，唔想令一個熟悉嘅數字突然變樣。 */
let hitChecked = 0
let hitBad = 0

for (const [name, spec] of Object.entries(SCREENS)) {
  if (ONLY && ONLY !== name) continue

  const real = await browser.newPage({ viewport: { width: W, height: H } })
  // ⛔ 頁面行唔起就一定要嘈出嚟 —— 否則會靜靜咁量到零項然後報「全對」。
  real.on('pageerror', (e) => console.log('  ⚠️ 真 app 出錯：', e.message))
  real.on('console', (m) => { if (m.type() === 'error') console.log('  ⚠️ 真 app console：', m.text()) })
  await real.goto(`http://localhost:${PORT}/?screen=${spec.screen ?? name}${spec.query ?? ''}`)
  await real.evaluate(() => document.fonts.ready)
  await real.waitForTimeout(700)
  // ⛔ 自我測試：喺量之前先整返 2026-09-14 嗰個壞法。
  if (SELF_TEST && name === 'home') await real.addStyleTag({ content: SELF_TEST_CSS })
  // 有啲畫面要先撳一下先至去到最長嗰個狀態（例如彈窗出埋錯誤）。
  if (spec.before) { await spec.before(real); await real.waitForTimeout(500) }

  console.log(`\n══ ${name} ══`)

  // ── 有啲畫面要記低粒掣喺邊，事後對（⛔ 唔同原型比，係兩個畫面互相比）──
  //    ⚠️ 一定要喺任何捲動之前攞 —— 下面個 hit 掃描會逐粒掣 scrollIntoView。
  if (spec.remember) {
    for (const testid of spec.remember) {
      remembered[`${name}·${testid}`] = await real.evaluate(BUTTON_BOX, testid)
    }
  }

  // ── 同原型對數 ────────────────────────────────────────────────
  // ⛔⛔ **一定要行喺「撳得到」掃描之前。**
  //    ⚠️ 2026-09-14 寫呢個檢查嗰陣中過：hit 掃描會逐粒掣 `scrollIntoView`，
  //    跟住成版嘢企咗喺另一個捲動位置 —— 而 `anchor` 模式量嘅 `top` 就全部走晒。
  //    實測係「量咗 90 項，對唔上 7 項」，⭐ 而七項全部係我把尺自己整出嚟嘅，
  //    ⛔ 唔係真 app 有嘢壞。**次序本身就係規格。**
  if (spec.pairs) {
    const proto = await browser.newPage({ viewport: { width: W, height: H } })
    await proto.goto('file://' + path.resolve(PROTO))
    await proto.evaluate(() => document.fonts.ready)
    await proto.evaluate((fn) => window[fn](), spec.proto)
    await proto.waitForTimeout(700)

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
    await proto.close()
  }

  // ── 撳得到？（⛔ 唔關原型事，係一個絕對要求。⛔ 一定要行喺對數之後）──
  const hits = await real.evaluate(HIT_SCAN, [HIT_SELECTOR, HIT_GRID, HIT_INSET])
  for (const one of hits) {
    hitChecked += 1
    if (one.reachable) continue
    hitBad += 1
    const who = one.testid !== '' ? `[${one.testid}]` : one.text !== '' ? `「${one.text}」` : one.cls
    console.log(`  ✗ 撳唔到：${one.tag}${who} —— 撳落去撳到嘅係「${one.blocker}」`)
  }

  await real.close()
}

await browser.close()
srv.close()

/* ══════════════════════════════════════════════════════════════════
   ⛔⛔ 2026-08-11 tree app 真實誤刪嘅解藥，喺呢度釘死。
       內容最短同內容最長兩個彈窗，兩粒掣**座標一定要一樣**。
   ══════════════════════════════════════════════════════════════════ */
let sameSpot = 0
let sameSpotBad = 0
if (!ONLY || ONLY === 'dialog' || ONLY === 'dialoglong') {
  console.log('\n══ 彈窗兩粒掣，內容最短 vs 最長 ══')
  for (const testid of ['delete-cancel', 'delete-confirm']) {
    const short = remembered[`dialog·${testid}`]
    const long = remembered[`dialoglong·${testid}`]
    sameSpot += 1
    if (!short || !long) {
      sameSpotBad += 1
      console.log(`  ✗ ${testid} —— 量唔到（${!short ? '最短' : '最長'}嗰個揾唔到粒掣）`)
      continue
    }
    const diffs = ['left', 'top', 'width', 'height'].filter(
      (k) => Math.abs(short[k] - long[k]) > TOL,
    )
    if (diffs.length === 0) {
      console.log(`  ✓ ${testid} —— 兩邊一樣（left ${short.left}, top ${short.top}）`)
    } else {
      sameSpotBad += 1
      console.log(`  ✗ ${testid} —— ⛔ 粒掣郁咗，即係 2026-08-11 嗰個壞法翻兜`)
      for (const k of diffs) console.log(`      ${k} ${short[k]} ≠ ${long[k]}`)
    }
  }
}

console.log(`\n量咗 ${checked} 項，對唔上 ${bad} 項。`)
console.log(`撳得到嘅檢查：量咗 ${hitChecked} 粒掣，撳唔到 ${hitBad} 粒。`)
console.log(`彈窗掣位：對咗 ${sameSpot} 粒，郁咗 ${sameSpotBad} 粒。`)

if (SELF_TEST) {
  console.log('\n──── 自我測試 ────')
  console.log('整返咗 2026-09-14 嗰個壞法（首頁容器換成 .float-cards-scroll 嘅幾何）。')
  if (hitBad > 0) {
    console.log(`✓ 捉到 —— 撳唔到 ${hitBad} 粒。⭐ 呢把尺係有用嘅。`)
    process.exit(0)
  }
  console.log('✗ ⛔⛔ 捉唔到。呢把尺量唔到佢應該量嘅嘢，即係一個假嘅安全感。')
  process.exit(3)
}

process.exit(bad === 0 && hitBad === 0 && sameSpotBad === 0 ? 0 : 1)
