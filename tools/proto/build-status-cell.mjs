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

/** 原型自己嗰件衫（⛔ 唔改真 app 任何一條規則，全部用 `.frame` / `.pick` / `#app` 前綴）。 */
const protoCss = `
/* ══════════════════════════════════════════════════════════════════
   ⛔⛔⛔ **個機殼高度釘死 727px，⛔ 唔准跟瀏覽器視窗。**

   ⚠️⚠️ **2026-09-16 第一版就係喺呢度死咗一次，⛔ 唔准淨係記住結論：**

   第一版寫咗 \`#app { flex: 1 }\` —— 即係個機殼**跟住視窗高度變**。
   喺我部量度機（844）睇落一切正常，但 Jason 喺真瀏覽器開條 link，
   佢個視窗高 **1328**，於是：

     「已報價」chip top   859
     .bottom-nav   top  1243
     中間空咗            384px

   ⇒ **張轉狀態卡未撳之前已經完全見到、⛔ 根本冇俾底 nav 遮住。**
     跟住撳「甲」，個畫面只郁咗大約 8px —— **眼睇唔到**，
     佢照樣會覺得「撳完冇反應」。

   ⭐⭐ **而佢要驗嗰樣嘢本身就係「高度夠唔夠」** ——
      個原型跟住視窗變，等於**自己把要驗嘅條件拆咗**。
      ⚠️ 同上一次「寫咗會捲但冇真係捲」係同一個病嘅另一個版本：
      **個原型睇落做齊晒嘢，但佢證明唔到任何嘢。**

   ⇒ 727 ＝ Jason 部機實際可見高度。⛔ 呢個數釘死，
     ⛔ 唔准改成 \`dvh\` / \`vh\` / \`flex: 1\` / \`100%\` 任何一種跟住變嘅寫法。
   ══════════════════════════════════════════════════════════════════ */
:root { --frame-h: 727px; }

/* ⛔⛔⛔ **一定要蓋返真 app 嗰兩條，⛔ 唔准當佢哋唔存在。**
   真 app 個 app.css 寫住：
       html, body, #root { height: 100dvh }
       html, body        { overflow: hidden }
   ⭐ 對真 app 嚟講啱 —— 佢成版唔捲，只有入面個 .float-cards-scroll 捲。
   ⚠️⚠️ **但呢個原型個機殼下面仲有「揀做法」嗰行**，成版要捲得到。
      2026-09-16 實測中過：唔蓋返嘅話，\`body\` 變咗一個 727px 高、
      \`overflow: hidden\` 嘅盒，入面 847px 嘅內容**溢咗出去而且用手指碌唔到**
      ⇒ **Jason 喺部機上面永遠見唔到甲／乙／丙三粒掣。**
   ⚠️ 而呢個病用 scrollTop = … 係試唔出嘅（程式碌得郁，手指碌唔郁）——
      所以 measure-status-cell.mjs 用 **真滾輪** 嚟量。 */
html, body { margin: 0; background: #060a07; height: auto; overflow: visible; }

.frame {
  position: relative;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  height: var(--frame-h);   /* ⛔ 釘死。⛔ 唔准用 dvh／vh／%／flex。 */
  overflow: hidden;
}

/* ⛔ \`.app--float\` 本身係 \`height: 100dvh\` —— id 蓋過佢，食足個機殼。 */
#app { height: 100%; }

/* ⭐ 「樣板」四個字擺喺個機殼最頂嗰條**本來就係空**嘅帶入面
   （\`.bheader\` 上內距 22px，工程名同垃圾桶都由 y=22 先開始）。
   ⇒ ⛔ 佢冇遮住任何嘢，亦冇把成個殼推低 —— 呢兩樣都會令個殼唔再係真嘢。 */
.stamp {
  position: absolute; top: 0; left: 0; right: 0; z-index: 30;
  height: 20px; line-height: 20px;
  padding: 0 12px;
  border: 0; border-radius: 0;
  background: rgba(179, 93, 74, .92); color: #fff;
  font-family: var(--q-font-sans); font-size: 11px; font-weight: 700;
  letter-spacing: .02em; text-align: center;
}

/* ⛔⛔⛔ **點解條帶要撳得 —— ⛔ 唔准淨係記住結論**

   「揀做法」嗰行喺個機殼**下面**（⛔ 唔准疊上去，疊上去就遮住咗要驗嘅嘢）。
   ⚠️ 即係喺 Jason 部 727 機上面，佢喺條 fold 下面。

   ⚠️⚠️ **而佢⛔ 碌唔到落去** —— 實測（真滾輪，⛔ 唔係 set scrollTop）：
   真 app 個 .float-cards-scroll 帶住 \`overscroll-behavior: contain\`
   （2026-09-13 特登加，為咗擋 Android 下拉整頁 reload）。
   ⇒ 手指喺卡度向上掃，**掃到個清單見底就停**，⛔ 唔會傳落去成版。
   實測 window.scrollY 一路都係 0。

   ⭐ 所以⛔ 唔靠掃 —— **撳一下條帶就直接帶佢落去**，撳完揀完自動帶返上嚟。
   ⛔ 亦⛔ 唔准去改真 app 個 overscroll-behavior 嚟遷就原型。 */
.stamp u { text-underline-offset: 2px; }

/* ── 揀做法嗰行：⛔ 擺喺個機殼**下面**，⛔ 唔准疊喺個殼上面 ──────
   ⚠️ 疊上去就會遮住殼入面啲嘢，而「有冇嘢遮住」正正就係今次要驗嘅嘢。 */
.pick {
  max-width: 480px; margin: 0 auto; padding: 10px 12px 18px;
  font-family: var(--q-font-sans); color: var(--q-text-2);
}
.pick p { margin: 0 0 8px; font-size: 12.5px; line-height: 1.45; }
.pick p b { color: var(--q-text-primary); }
.segs { display: flex; gap: 6px; }
.segs button {
  flex: 1; min-height: 46px; padding: 5px 2px;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  border: 1px solid var(--q-line); border-radius: 12px;
  background: #171e18; color: var(--q-text-2);
  font: inherit; font-size: 14px; font-weight: 700;
}
.segs button small { font-size: 10.5px; font-weight: 500; opacity: .85; }
.segs button.on { background: var(--q-accent); border-color: var(--q-accent); color: #0f140f; }
.segs button.bad.on { background: #b35d4a; border-color: #b35d4a; color: #fff; }

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
 *
 * ⛔⛔⛔ **動畫係裝飾。⛔ 佢⛔ 唔可以係「做到件事」嘅唯一途徑。**
 *
 * ⚠️⚠️ **2026-09-16 實測中過，⛔ 唔准淨係記住結論：**
 * 第一版淨係寫 \`scrollTo({ behavior: 'smooth' })\`。喺一部**開咗「減少動態效果」**
 * 嘅瀏覽器上面（Android 協助工具裏面一個好普通嘅掣，\`matchMedia\` 審返 true）：
 *
 *     smooth → scrollTop 0     （⛔ 一個像素都唔郁）
 *     auto   → scrollTop 450   （✅ 郁到）
 *     smooth → scrollTop 0     （再試，一樣）
 *     scrollIntoView({behavior:'smooth'}) → 0
 *
 * ⭐ 即係**⛔ 唔係「瞬間跳到」，係完全冇反應** ——
 *   而嗰個症狀，**逐隻字就係 Jason 當日嗰句「我撳狀態無反應」**。
 *
 * ⇒ 所以而家分兩條路，⛔ 兩條都要保證到位：
 *   · 開咗「減少動態」⇒ **直接 \`scrollTop = to\`**，⛔ 唔行動畫
 *   · 冇開 ⇒ 行 smooth，**但加一張網**：一段時間之後仲未到位就硬推過去
 *     ⚠️ 張網⛔ 唔係多餘 —— 有啲瀏覽器會**靜靜咁唔做 smooth 而又⛔ 唔報
 *        reduced-motion**，嗰種上面條 \`if\` 攔唔到。
 */
statStatus.addEventListener('click', function () {
  if (!app.classList.contains('v-A')) return   // 乙／丙／今日：⛔ 真係冇反應
  var to = scroll.scrollTop + card.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scroll.scrollTop = to
  } else {
    scroll.scrollTo({ top: to, behavior: 'smooth' })
    setTimeout(function () {
      if (Math.abs(scroll.scrollTop - to) > 4) scroll.scrollTop = to
    }, 600)
  }

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

/* 撳條紅帶 → 直接帶佢去揀做法嗰行（⛔ 唔靠掃，見 .stamp 上面嗰段）。 */
document.getElementById('toPick').addEventListener('click', function () {
  document.querySelector('.pick').scrollIntoView({ behavior: 'smooth', block: 'end' })
})

document.getElementById('segs').addEventListener('click', function (e) {
  var btn = e.target.closest('button')
  if (!btn) return
  apply(btn.dataset.v)
  /* ⭐ 揀完即刻帶佢返上去睇個機殼 —— 粒掣喺個殼下面，⛔ 唔可以疊喺殼上面
     （疊上去就遮住咗殼入面啲嘢，而「有冇嘢遮住」正正就係今次要驗嘅嘢）。 */
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

apply('A')
</script>
</body>
</html>
`

fs.writeFileSync(path.join(ROOT, 'public/proto-status-cell.html'), html)
console.log('寫咗 public/proto-status-cell.html', (html.length / 1024).toFixed(1), 'KB')
