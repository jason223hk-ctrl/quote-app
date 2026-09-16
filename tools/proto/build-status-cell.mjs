/*
 * 砌 `public/proto-status-cell.html` —— 狀態格三個做法嘅原型。
 *
 * ⭐⭐ **點解要一個產生器，⛔ 唔手寫個 HTML**
 *
 * 2026-09-16 Jason 對 `proto-four.html` 個 tab ④ 嘅回應係：**「甲係點捲」**。
 * ⚠️ 即係嗰個原型**寫咗**「撳咗捲落去」，⛔ **但冇真係捲俾佢睇**。
 * ⭐ 同附錄 B 嗰條伏一模一樣：**描述咗一件事 ≠ 俾人試到件事。**
 *
 * ⛔⛔ 第二個伏：**手寫一個「似樣」嘅殼，量出嚟嘅嘢係我自己畫嘅，⛔ 唔係真 app。**
 *    而今次要驗嘅嘢**本身就係幾何**（底 nav 遮唔遮住張轉狀態卡、要碌幾多）。
 *    殼差 20px，答案就係錯嘅。
 *
 * ⇒ 所以呢個產生器**原封不動抄真嘢**：
 *      · `src/styles/tokens.css` ＋ `src/styles/app.css`（真 CSS，⛔ 唔重寫）
 *      · `src/ui/sprite.ts` 嗰 46 個 icon（真 icon，⛔ 唔搵替代品）
 *      · markup 用真 class 名（由真 app render 出嚟嗰份抄返，見 body 檔）
 *    出嚟係**一個自己一個檔嘅 HTML**（跟返 CLAUDE.md §2.11「一個 HTML 檔就夠」），
 *    ⛔ 唔駁 Supabase、⛔ 唔上載、⛔ 唔寫任何嘢。
 *
 * ⚠️ 出嚟嗰個 HTML 係一份**定格快照**。⛔ 唔會自動跟住真 CSS 變 ——
 *    原型係「攞嚟拍板」嘅嘢，拍完板就完，⛔ 唔使維持同步。
 *    要重砌：`node tools/proto/build-status-cell.mjs`
 */
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const tokens = read('src/styles/tokens.css')
// ⛔ 拎走 `@import './tokens.css';` —— 上面已經貼咗真嘢入去。
const app = read('src/styles/app.css').replace(/@import\s+'\.\/tokens\.css';\s*/, '')

/** `sprite.ts` 係一條 template string。⛔ 唔 eval，直接剪返兩個 backtick 中間嗰橛。 */
const spriteSrc = read('src/ui/sprite.ts')
const sprite = spriteSrc.slice(spriteSrc.indexOf('`') + 1, spriteSrc.lastIndexOf('`'))
if (!sprite.includes('<symbol id="01_bottom_nav__home_seedling"')) {
  throw new Error('剪唔到 ICON_SPRITE —— sprite.ts 個格式變咗，⛔ 唔准夾硬出檔。')
}

const body = read('tools/proto/status-cell.body.html')

/** 原型自己嗰件衫（⛔ 唔改真 app 任何一條規則，全部用 `.pt` / `#app` 前綴）。 */
const protoCss = `
/* ── 原型自己嗰條頂帶（⛔ 唔屬於真 app）──────────────────────── */
/* ⭐ 成版係一條直行：條頂帶 ＋ 個 app 食晒剩返嘅高。
   ⛔ 唔用「calc(100dvh 減條帶高度)」—— 2026-09-16 實測嗰條 calc 出咗
      個 app 高 844px（＝底 nav 跌咗出畫面外 108px），而畫面上面完全睇唔出。
   ⭐ flex 由瀏覽器自己計，⛔ 冇得計錯。 */
html, body { height: 100%; }
body { margin: 0; background: var(--q-page-bg); display: flex; flex-direction: column; }
.pt { flex: 0 0 auto; }
.pt {
  position: relative; z-index: 20;
  padding: calc(8px + env(safe-area-inset-top, 0px)) 14px 8px;
  background: #1c241d; border-bottom: 1px solid var(--q-line);
  font-family: var(--q-font-sans); color: var(--q-text-primary);
}
/* ⛔ 頂部最多兩行字（原型規矩，2026-09-15 定）—— 就係下面兩條。 */
.pt1, .pt2 { margin: 0; font-size: 12.5px; line-height: 1.45; }
.pt2 { color: var(--q-text-2); }
.segs { display: flex; gap: 6px; margin-top: 8px; }
.segs button {
  flex: 1; min-height: 44px; padding: 5px 2px;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  border: 1px solid var(--q-line); border-radius: 12px;
  background: #171e18; color: var(--q-text-2);
  font: inherit; font-size: 14px; font-weight: 700;
}
.segs button small { font-size: 10.5px; font-weight: 500; opacity: .85; }
.segs button.on { background: var(--q-accent); border-color: var(--q-accent); color: #0f140f; }
.segs button.bad.on { background: #b35d4a; border-color: #b35d4a; color: #fff; }

/* 個 app 食晒剩返嗰忽，⛔ 唔係嘅話底 nav 會俾推出畫面外（實測中過）。 */
#app { height: auto; flex: 1 1 auto; min-height: 0; }

/* ⭐ 甲：捲完之後閃一閃，⛔ 唔係為咗靚 —— 係要佢知「你而家喺呢度」。 */
#statusCard.flash { animation: protoFlash 1.1s ease-out; }
@keyframes protoFlash {
  0%, 100% { box-shadow: none; }
  15%, 60% { box-shadow: 0 0 0 2px var(--q-accent); }
}

/* ⭐ 乙：個「狀態」格改到**明顯唔似掣** —— 虛線邊、冇底、冇圓角陰影。 */
#app.v-B #statStatus {
  background: none; border: 1px dashed var(--q-line); box-shadow: none;
}
#app.v-B #statStatus .k::after { content: '（睇嘅）'; font-size: 10px; opacity: .7; }

/* ⭐ 甲：個「狀態」格照樣似粒掣（真 app 而家三格就係咁），加返撳落去嘅反應。 */
#app.v-A #statStatus { cursor: pointer; }
#app.v-A #statStatus:active { transform: scale(.98); }
`

const html = `<!doctype html>
<html lang="zh-HK">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0D120E">
<title>原型：狀態格三個做法</title>
<!--
  ══════════════════════════════════════════════════════════════════
  ⛔⛔ 呢個係原型。⛔ 唔駁 Supabase、⛔ 唔上載、⛔ 一個字都唔會存。

  ⭐ 入面嘅 CSS ＋ icon ＋ class 名係**由真 app 原封不動抄過嚟**
     （src/styles/tokens.css、src/styles/app.css、src/ui/sprite.ts），
     ⛔ 唔係另外畫一套 —— 因為今次要驗嘅嘢**本身就係幾何**：
     底 nav 遮唔遮住轉狀態卡、要碌幾多先搵到佢。殼差 20px，答案就係錯。

  重砌：node tools/proto/build-status-cell.mjs
  ══════════════════════════════════════════════════════════════════
-->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@600;700&display=swap">
<style>
/* ───── 以下由 src/styles/tokens.css 抄過嚟，⛔ 一個字都冇改 ───── */
${tokens}
/* ───── 以下由 src/styles/app.css 抄過嚟，⛔ 一個字都冇改 ───── */
${app}
/* ───── 以下先至係原型自己嗰啲 ───── */
${protoCss}
</style>
</head>
<body>

<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
${sprite}
</defs></svg>

${body}

<script>
/* ⛔ 純樣板：冇 fetch、冇 localStorage、冇任何寫入。 */
var app = document.getElementById('app')
var scroll = document.getElementById('scroll')
var card = document.getElementById('statusCard')
var pills = document.getElementById('pills')
var statStatus = document.getElementById('statStatus')

/*
 * 三個做法**唯一嘅分別就係張卡排喺邊、同埋頂格撳唔撳得**。
 * ⛔ 冇任何一個係「出句字講俾你聽佢會點」—— 三個都真係做出嚟。
 */
function apply(v) {
  app.className = 'app app--float v-' + v

  // 丙：張卡真係搬到三格下面（＝一開就見到）。其餘：張卡排喺「匯出 PDF」之後。
  if (v === 'C') {
    pills.after(card)
  } else {
    scroll.querySelector('.cost-card').before(card)
  }
  scroll.scrollTop = 0

  for (var b of document.querySelectorAll('#segs button')) {
    b.classList.toggle('on', b.dataset.v === v)
  }
}

/*
 * ⭐⭐ 甲 ＝ 撳頂格**真係捲落去**（有動畫，睇到佢捲），⛔ 唔係出句字話你知會捲。
 *    ⚠️ 要留返底 nav 嗰條位：捲到張卡頂喺三格下面少少，
 *       ⛔ 唔准捲到張卡匿咗喺底 nav 後面（嗰個正正就係今日個病）。
 */
statStatus.addEventListener('click', function () {
  if (!app.classList.contains('v-A')) return   // 乙／丙／今日：⛔ 真係冇反應
  var to = scroll.scrollTop + card.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12
  scroll.scrollTo({ top: to, behavior: 'smooth' })
  card.classList.remove('flash')
  void card.offsetWidth
  card.classList.add('flash')
})

/* 三粒狀態掣：三個做法入面全部真係撳得、真係會轉。 */
document.getElementById('chips').addEventListener('click', function (e) {
  var btn = e.target.closest('.chip2')
  if (!btn) return
  for (var c of document.querySelectorAll('.chip2')) c.classList.toggle('on', c === btn)
  document.getElementById('statStatusV').textContent = btn.dataset.s
  document.getElementById('cardNote').textContent = '（' + btn.dataset.s + '）'
})

document.getElementById('segs').addEventListener('click', function (e) {
  var btn = e.target.closest('button')
  if (btn) apply(btn.dataset.v)
})

apply('A')
</script>
</body>
</html>
`

fs.writeFileSync(path.join(ROOT, 'public/proto-status-cell.html'), html)
console.log('寫咗 public/proto-status-cell.html', (html.length / 1024).toFixed(1), 'KB')
