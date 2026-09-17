/*
 * 量 `public/proto-status-cell.html` —— ⛔ 唔係為咗好睇，係為咗**證明個原型真係試到嘢**。
 *
 * ⛔⛔ **點解要一把尺量一個原型 —— ⛔ 唔准淨係記住結論**
 *
 * 2026-09-16 第一版原型**睇落樣樣齊**：三個做法都撳得、都真係捲。
 * ⚠️ 但個機殼寫咗跟住視窗高度變。Jason 喺一個高 1328 嘅視窗開佢，量到：
 *
 *     「已報價」chip top   859
 *     .bottom-nav   top  1243      ⇒ 中間仲空 384px
 *
 * ⇒ **張轉狀態卡未撳之前已經完全見到** —— 撳「甲」只郁咗大約 8px，眼睇唔到。
 * ⭐⭐ 而佢要驗嗰樣嘢**本身就係「高度夠唔夠」**：
 *    個原型自己把要驗嘅條件拆咗，**綠燈同紅燈都冇意思**。
 *
 * ⇒ 所以要量三樣，缺一不可（Jason 2026-09-16 明文定嘅驗收標準）：
 *    ① 未撳之前，張卡**真係俾底 nav 遮住**（出兩個數：卡 top、nav top）
 *    ② 撳咗「甲」之後，畫面**真係捲咗幾多 px**
 *    ③ 捲完之後，張卡**由遮住變成完全見到**
 *
 * ⛔ ① 冇咗嗰個數，成個原型證明唔到任何嘢。
 *
 * 跑法：node tools/proto/measure-status-cell.mjs
 *      （要 chromium：CHROMIUM_PATH=… 或者 npx playwright install chromium）
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const PORT = 8387
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript' }
const srv = http
  .createServer((q, s) => {
    const p = path.join(ROOT, 'public', decodeURIComponent(q.url.split('?')[0]))
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      s.writeHead(404)
      s.end()
      return
    }
    s.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' })
    fs.createReadStream(p).pipe(s)
  })
  .listen(PORT)

/**
 * ⭐⭐ **特登喺三個唔同高度嘅視窗量。**
 * ⛔ 淨係量一個高度，就係第一版死嗰個法：喺我部機啱，喺佢部機唔啱。
 * 1328 就係 Jason 撞到嗰個。個機殼釘死咗 727 ⇒ 三個高度出嚟嘅數要**一模一樣**。
 */
const HEIGHTS = [1328, 844, 727]

/**
 * ⭐⭐⭐ **⛔ 三種跑法，⛔ 一種都唔可以慳 —— 呢段⛔ 唔准淨係記住結論**
 *
 * 2026-09-16：個原型喺我部量度機**三個視窗高度全綠**，
 * 但喺一部**開咗「減少動態效果」**嘅真瀏覽器上面，撳「甲」個頂格
 * **一個像素都唔郁**。實測（同一部機，反覆三次）：
 *
 *     smooth → 0      auto → 450      smooth → 0
 *     scrollIntoView({behavior:'smooth'}) → 0
 *
 * ⚠️ ⛔ **唔係「瞬間跳到」，係完全冇反應** ——
 *    而嗰個症狀**逐隻字就係 Jason 當日嗰句「我撳狀態無反應」**。
 *
 * ⛔⛔ **而且要老實講一樣**：`reducedMotion: 'reduce'` 呢一趟，
 *    **喺呢部 headless Chromium 度捉唔到** —— 佢照樣捲到 566。
 *    ⇒ 嗰一趟**⛔ 唔算證據**，佢係留俾第二個引擎／將來版本捉。
 *
 * ⭐ 真正捉得到嘅係第三趟 `smoothDead`：**直接把 smooth 整成冇效**，
 *    即係**照抄嗰部真機量到嘅行為**。⛔ 佢⛔ 唔係一個假嘅輸入事件
 *    （嗰種喺 `swipeDelete` 檔頭已經禁咗）—— 佢係**平台行為**，
 *    而我哋要驗嘅正正就係「平台唔幫手嗰陣，我哋自己頂唔頂得住」。
 */
const MODES = [
  { key: 'normal', label: '平時', reducedMotion: 'no-preference', killSmooth: false },
  {
    key: 'reduce',
    label: '開咗「減少動態效果」',
    reducedMotion: 'reduce',
    killSmooth: false,
  },
  {
    key: 'smoothDead',
    label: '⭐ smooth 完全唔做嘢（照抄真機量到嗰個行為）',
    reducedMotion: 'no-preference',
    killSmooth: true,
  },
]

/**
 * 把 `scrollTo` / `scrollIntoView` 入面帶 `behavior: 'smooth'` 嗰啲**變成冇效**。
 * ⛔ 其餘（`auto`、直接 set `scrollTop`）照行 —— 咁先分得出
 * 「靠動畫」同「自己到位」。
 */
const KILL_SMOOTH = `
  (() => {
    const smooth = (a) => a && typeof a === 'object' && a.behavior === 'smooth'
    for (const proto of [Element.prototype, Window.prototype]) {
      const orig = proto.scrollTo
      if (orig) proto.scrollTo = function (...a) { if (smooth(a[0])) return; return orig.apply(this, a) }
    }
    const into = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (...a) { if (smooth(a[0])) return; return into.apply(this, a) }
  })()
`

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)

let bad = 0
const say = (ok, line) => {
  if (!ok) bad += 1
  console.log(`  ${ok ? '✓' : '✗ ⛔⛔'} ${line}`)
}

for (const height of HEIGHTS) {
  console.log(`\n══ 視窗 390 × ${height} ══`)
  const page = await browser.newPage({ viewport: { width: 390, height } })
  await page.goto(`http://localhost:${PORT}/proto-status-cell.html`)
  await page.waitForTimeout(500)

  const geo = () =>
    page.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { top: Math.round(b.top), bottom: Math.round(b.bottom) }
      }
      const chipEl = document.querySelector('.chip2')
      const chip = chipEl.getBoundingClientRect()
      const hit = document.elementFromPoint(chip.x + chip.width / 2, chip.y + chip.height / 2)
      return {
        frame: box('.frame'),
        card: box('#statusCard'),
        nav: box('.bottom-nav'),
        chip: { top: Math.round(chip.top), bottom: Math.round(chip.bottom) },
        /* ⭐ ⛔ 唔係問「喺唔喺 DOM」，係問「撳落去撳到邊個」。 */
        chipHit: hit
          ? (hit.closest('button')?.className ?? hit.tagName).toString().slice(0, 24)
          : 'null（跌咗出畫面外）',
        scrollTop: Math.round(document.getElementById('scroll').scrollTop),
      }
    })

  const pick = async (v) => {
    await page.click(`#segs button[data-v="${v}"]`)
    await page.waitForTimeout(600)
  }

  /* 個機殼⛔ 唔准跟視窗 —— 三個高度都要係 727。 */
  const frame0 = (await geo()).frame
  say(frame0.bottom - frame0.top === 727, `機殼高 ${frame0.bottom - frame0.top}px（要釘死 727）`)

  /* ⛔⛔ 「揀做法」嗰行喺個機殼**下面** ⇒ Jason 一定要去到佢先揀到做法。
     ⚠️⚠️ 2026-09-16 實測到兩件事，兩件都係真嘅：
       ① 真 app 個 `html, body { overflow: hidden }` 跟咗過嚟 ⇒ 成版**根本唔捲**
          （原型已經蓋返做 `overflow: visible`）
       ② 蓋返之後**仍然掃唔到**：`.float-cards-scroll` 帶住
          `overscroll-behavior: contain`，手指喺卡度掃到見底就停，
          ⛔ 唔會傳落去成版。實測**真滾輪** 400px，`window.scrollY` 一路係 0。
     ⇒ 所以個原型⛔ 唔靠掃，改為**撳條紅帶**。呢度就係量佢：
        ⭐ 用**真 click**（⛔ 唔係 `scrollIntoView` 自己 call 一次算數）。 */
  await page.mouse.move(195, Math.min(height, 700) / 2)
  await page.mouse.wheel(0, 500)
  await page.waitForTimeout(400)
  const byWheel = await page.evaluate(() => Math.round(window.scrollY))
  console.log(`    （真滾輪掃 500px：window.scrollY ${byWheel} —— ⚠️ 0 係預期，見上面 ②）`)

  await page.click('#toPick')
  await page.waitForTimeout(900)
  const reach = await page.evaluate(() => {
    const b = document.querySelector('#segs button[data-v="C"]').getBoundingClientRect()
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return {
      y: Math.round(window.scrollY),
      inView: b.top >= 0 && b.bottom <= innerHeight,
      hit: hit ? (hit.closest('button')?.dataset.v ?? hit.tagName) : 'null',
    }
  })
  say(
    reach.inView && reach.hit === 'C',
    `撳條紅帶 → 揀做法嗰行去到咗（scrollY ${reach.y}，粒「丙」喺畫面入面 ${reach.inView}，中心撳到「${reach.hit}」）`,
  )

  /* ⚠️ 上面條 smooth 捲可能仲行緊 —— 等佢停晒先歸零，
     ⛔ 唔係嘅話下面啲 top 會全部偏咗一個捲動量，而個報告會靜靜咁講錯數。 */
  await page.waitForTimeout(700)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(300)

  for (const v of ['N', 'A', 'B']) {
    await pick(v)
    const g = await geo()
    /* ① 未撳之前：張卡要**真係**俾底 nav 遮住。 */
    const covered = g.card.bottom > g.nav.top
    say(
      covered,
      `${v}：未撳之前 卡 top ${g.card.top} / bottom ${g.card.bottom}，nav top ${g.nav.top} ` +
        `⇒ ${covered ? `俾遮住 ${g.card.bottom - g.nav.top}px` : `⛔ 冇遮住，中間仲空 ${g.nav.top - g.card.bottom}px`}`,
    )
    say(
      g.chipHit !== 'chip2 on',
      `${v}：未撳之前「待報價」掣中心撳落去 → ${g.chipHit}（⛔ 要唔係佢自己）`,
    )
  }

  /* ②③ 撳咗「甲」之後：真係捲，而且捲完張卡完全見到。 */
  await pick('A')
  const before = await geo()
  await page.click('#statStatus')
  await page.waitForTimeout(1200)
  const after = await geo()
  const moved = after.scrollTop - before.scrollTop
  say(moved > 100, `甲：撳頂格之後畫面捲咗 ${moved}px（⛔ 要大過 100，⚠️ 8px 眼睇唔到）`)
  say(
    after.card.bottom <= after.nav.top,
    `甲：捲完 卡 top ${after.card.top} / bottom ${after.card.bottom}，nav top ${after.nav.top} ⇒ ` +
      (after.card.bottom <= after.nav.top ? '完全見到' : '⛔ 仲係俾遮住'),
  )
  say(after.chipHit === 'chip2 on', `甲：捲完「待報價」掣中心撳落去 → ${after.chipHit}（要係佢自己）`)

  /* 丙：⛔ 唔使撳、⛔ 唔使碌，一開就撳得到。 */
  await pick('C')
  const c = await geo()
  say(c.scrollTop === 0, `丙：scrollTop ${c.scrollTop}（要 0 —— ⛔ 冇碌過）`)
  say(
    c.card.bottom <= c.nav.top,
    `丙：卡 top ${c.card.top} / bottom ${c.card.bottom}，nav top ${c.nav.top} ⇒ ` +
      (c.card.bottom <= c.nav.top ? '完全見到' : '⛔ 俾遮住'),
  )
  say(c.chipHit === 'chip2 on', `丙：「待報價」掣中心撳落去 → ${c.chipHit}（要係佢自己）`)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────
   ⭐⭐ 同一套驗收，再跑多兩趟：開咗「減少動態效果」、同埋 smooth 冇效。
   ⛔ 動畫係裝飾 —— **佢⛔ 唔可以係「做到件事」嘅唯一途徑。**
   ──────────────────────────────────────────────────────────────── */
for (const mode of MODES) {
  console.log(`\n══ 甲：撳頂格（390 × 727，${mode.label}）══`)
  const page = await browser.newPage({
    viewport: { width: 390, height: 727 },
    reducedMotion: mode.reducedMotion,
  })
  if (mode.killSmooth) await page.addInitScript(KILL_SMOOTH)
  await page.goto(`http://localhost:${PORT}/proto-status-cell.html`)
  await page.waitForTimeout(500)

  await page.click('#segs button[data-v="A"]')
  await page.waitForTimeout(700)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(200)

  const before = await page.evaluate(() => Math.round(document.getElementById('scroll').scrollTop))
  await page.click('#statStatus')
  /* ⚠️ 等夠 —— 個 fallback 係 600ms 之後先出手。⛔ 等唔夠就會報一個假紅。 */
  await page.waitForTimeout(1600)

  const r = await page.evaluate(() => {
    const sc = document.getElementById('scroll')
    const chip = document.querySelector('.chip2').getBoundingClientRect()
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect()
    const hit = document.elementFromPoint(chip.x + chip.width / 2, chip.y + chip.height / 2)
    return {
      scrollTop: Math.round(sc.scrollTop),
      chipTop: Math.round(chip.top),
      navTop: Math.round(nav.top),
      visible: chip.bottom <= nav.top && chip.top >= 0,
      hit: hit ? (hit.closest('button')?.className ?? hit.tagName) : 'null',
      mm: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }
  })

  console.log(`    matchMedia(reduce) = ${r.mm}`)
  say(r.scrollTop - before > 100, `撳完捲咗 ${r.scrollTop - before}px（⛔ 要大過 100）`)
  say(r.visible, `「待報價」掣 top ${r.chipTop}，nav top ${r.navTop} ⇒ ${r.visible ? '睇得到' : '⛔ 睇唔到'}`)
  say(r.hit === 'chip2 on', `中心撳到「${r.hit}」（要係佢自己）`)
  await page.close()
}

await browser.close()
srv.close()
console.log(`\n${bad === 0 ? '全部啱。' : `⛔ ${bad} 項唔啱。`}`)
process.exit(bad === 0 ? 0 : 1)
