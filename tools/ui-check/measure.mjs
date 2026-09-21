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
/*
 * ⛔⛔ **一部真機嘅「可用高度」⛔ 唔係佢個螢幕高度。**
 *
 * `H = 844` 係 iPhone 個**螢幕**。⚠️ 但瀏覽器嗰條網址列食咗一截 ——
 * Jason 2026-09-17 喺自己部機量到嘅真實可用高度係 **727**。
 * ⭐ 對得返：喺 727 度量到底部 nav 個頂係 **642**，同佢部機報返嚟嗰個數一模一樣。
 *
 * ⇒ 即係話 844 係**最好嗰個情況**，727 先係**現場嗰個情況**。差 117px。
 *   ⚠️ 而（丙）搬位之前嗰個壞法喺 844 度先褪咗 67px —— **少過 117**。
 *   ⇒ 一個「喺 844 見到、喺 727 褪咗」嘅版面完全存在，
 *     而且喺一把淨係量 844 嘅尺度會**全綠**。（2026-09-18 真係整咗一個出嚟試過。）
 *
 * ⭐⭐ 呢個同 #40 嗰個「原型機殼跟住瀏覽器高度」係同一個家族：
 *    量度嘅條件比現場鬆 ⇒ 量到嘅「合格」係假嘅。
 *
 * ⛔⛔ 所以「一開就見到」呢組**兩個高度都要過**。
 * ⛔ 唔准因為版面過唔到就調高 727。要調，⛔ 淨係喺 Jason 量到一個更矮嘅數嗰陣調低。
 */
const SHORT_H = 727

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
    /* ⭐ （丙）嘅驗收：一開個工程頁就見到轉狀態，⛔ 唔使碌。
       ⛔ 三粒 chip 逐粒都要量 —— 「張卡見到」⛔ 唔等於「三粒都見到」。 */
    firstSight: [
      {
        testid: 'status-card',
        scroller: 'hub-scroll',
        why: '轉狀態係開單之後最常做嘅嘢，⛔ 唔應該要碌落去揾',
      },
      { testid: 'status-pending', scroller: 'hub-scroll', why: '「待報價」撳得到先叫見到' },
      { testid: 'status-quoted', scroller: 'hub-scroll', why: '「已報價」撳得到先叫見到' },
      { testid: 'status-won', scroller: 'hub-scroll', why: '「已中標」撳得到先叫見到' },
    ],
    /* ⛔ 頂部三格（狀態／樹木／地區）淨係顯示，⛔ 唔准扮掣。 */
    notFakeButton: [
      { sel: '[data-testid="record-summary"] .stat:nth-child(1)', why: '真嘅轉狀態掣喺下面張卡' },
      { sel: '[data-testid="record-summary"] .stat:nth-child(2)', why: '入樹木清單用下面「樹木清單」嗰行' },
      { sel: '[data-testid="record-summary"] .stat:nth-child(3)', why: '改地區用下面「工程資料」嗰行' },
    ],
    proto: 'showProject',
    /* ⭐⭐ 撳完⛔ 唔准變藍（Jason 2026-08-29 原型拍板，2026-09-15 再講一次）。
       ⛔ 揀嘅係「撳落去唔會去第二版」嗰幾粒 —— ⚠️ 撳咗粒垃圾桶會開彈窗，
       之後量乜都唔準。 */
    noBlue: [{ testid: 'hub-client' }, { testid: 'hub-record-form' }],
    /* ⭐ 同一版順手驗返另一半：鍵盤 Tab 仲要見到自己停喺邊。 */
    keyboardRing: true,
    /* ⭐⭐ 加成打錯字 ⇒ ⛔ 唔出價；空格 ⇒ 照出成本價。**兩樣都要量。**
       ⚠️ 只量一樣嘅話：只量「abc 唔出價」⇒ 一個「乜都唔出」嘅 code 會全綠；
          只量「空格出成本價」⇒ 今日呢個病本身就全綠。 */
    askingWhenTyped: [
      {
        type: 'abc',
        wantMoney: false,
        why: '計唔到就⛔ 唔准出價（Jason 2026-09-16 拍板）—— ⛔ 唔准出一個似層層但錯嘅成本價。',
      },
      {
        type: '',
        wantMoney: true,
        why: '⭐ 空格 ＝ 真係未填，係**合法狀態**（CLAUDE.md §2.3 null ≠ 0）⇒ 要照出成本價。',
      },
      { type: '50', wantMoney: true, why: '有加成就梗係要出價。' },
      /*
       * ⭐⭐ **打一個真嘅 `0` —— ⛔ 佢同「清空」⛔ 唔係同一件事。**
       *
       * ⚠️ 2026-09-17 呢個係一個**冇寫入 PR #47 嘅行為變化**，要釘死免得俾人「修返」：
       *   舊：`pct <= 0` ⇒ **兩樣都**出「未設加成，等於成本價」
       *   新：`askingState('0')` ＝ `{ kind: 'ok', pct: 0 }`
       *        ⇒ **出價，而嗰句「未設加成」⛔ 唔再出**（佢而家綁 `kind === 'cost'`）
       *
       * ⭐ **呢個係有意嘅**：佢**自己打咗 `0`**，⛔ 唔係未填 ——
       *   兩樣喺畫面上面**應該分得開**。
       * ⚠️ 而「報價 ＝ 成本」呢件事⛔ 唔使再寫一句：總成本同報價價錢兩個數
       *   就喺隔籬、一樣大，⭐ **睇得到嘅嘢⛔ 唔使再講一次**。
       *
       * ⛔⛔ **下一個人見到「打 0 冇咗嗰句字」⛔ 唔准當 regression 去修返。**
       */
      { type: '0', wantMoney: true, why: '⭐ 自己打咗 0 ＝ 明確講「冇加成」⇒ 要出價（成本價）。' },
    ],
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
  /* ⭐⭐ 工程卡向左推 —— **用真滑鼠拖真嗰張 `RecordCard`（一個 `<button>`）**。
     ⛔ 原型 stage57 冇呢件嘢，所以冇 `pairs`：量嘅係**絕對要求**，⛔ 唔係對數。

     ⛔⛔ **點解一定要係真滑鼠 —— ⛔ 唔准淨係記住結論**
     2026-09-14 上一版嘅驗證係自己 `dispatchEvent` 整個 `TouchEvent` 出嚟，
     **綠燈**；Jason 真機推，**張卡一 px 都唔郁**。⚠️ 自己發嘅事件繞過晒瀏覽器
     嘅手勢仲裁，所以壞咗嘅 code 一樣過。⭐ Playwright 個 `page.mouse` 係經 CDP
     打真嘅輸入 —— **佢當日就係量到 `0px`**（實測，commit `3738140`）。

     ⭐ 呢一下拖同時量緊兩樣嘢：
       ① Pointer Events ＋ `touch-action` 有冇接返到（唔係就停喺 0px）
       ② 放手之後**尾隨嗰下 click 有冇順手收返張卡**（係就彈返 0px）
     ⚠️ 而且**特登喺 `hits` 之前拖** —— 推開咗之後個垃圾桶掣先至露出嚟，
        跟住個「撳得到」掃描就會順手驗埋「露咗出嚟真係撳得到」。 */
  swipe: {
    query: '',
    drag: { testid: 'record-row', by: -90, expect: -76 },
  },

  dialog: {
    query: '',
    remember: ['delete-cancel', 'delete-confirm'],
    /* ⭐⭐ `deleteDialog.ts` 講嘅三道保險之一：**一開就 focus 咗「取消」**。
       ⛔⛔ 「唔要藍底」⛔ 唔准順手殺埋呢樣 —— ⚠️ 2026-08-11 tree app
       嗰次真實誤刪，成因就係「佢以為自己撳緊另一粒」。
       ⇒ 呢度量兩樣：真係 focus 咗「取消」，而且**個 focus 睇得到**。 */
    focusStart: { testid: 'delete-cancel' },
  },
  /* ⭐⭐ 「未上載 N 張」條 bar（首頁，條 bar 出住）。

     ⛔⛔⛔ **呢個畫面而家一項對數都冇，⛔ 唔係漏咗 —— 係特登拆走嘅。**

     **點解**：佢本來對 `docs/原型-未上載計數器.html`（Jason 2026-09-06
     撳完四個位置揀咗「甲：底部導航上面一條 bar」）。
     ⚠️ **嗰個決定 2026-09-16 俾佢自己推翻咗** ——
     原話「宜家個版位遮住左新增工程個 fab」，定案「細條啲既 bar 放最頂」。
     ⇒ 嗰份原型而家係一份**作廢嘅稿**。
     ⭐ 呢個檔本身寫過嘅規矩：**對一個已經作廢嘅稿，綠燈同紅燈都冇意思。**
     ⛔ 所以三項對數（成條 bar 位置、入面啲字、「睇同步 ›」）一齊拆走，
        對數總數由 93 跌返 90。⛔ 唔准偷偷搬去對第二份稿嚟湊返個數。

     ⭐⭐ **拆走三項對數，換返嚟嘅係三條「⛔ 唔使原型都成立」嘅絕對要求：**
       · ⛔ 唔准有得撳走（`noEscape`，上線清單第 1 條）
       · 粒掣夠大撳（`minSize` 44px）
       · **中心點撳到自己**（`centreHit`）—— 就係捉返 FAB 被遮嗰個窿 */
  pending: {
    screen: 'pending',
    query: '',
    noEscape: [{ testid: 'pending-bar' }],
    minSize: [{ testid: 'pending-bar', w: 200, h: 44, noLabel: true }],
    centreHit: [
      {
        testid: 'home-add',
        why:
          '⛔⛔ 2026-09-16 Jason 真機撞到嗰個窿本身：條 bar 坐咗喺「加工程」FAB 上面。' +
          '⚠️ 佢中心撳唔到 ＝ 現場同事開唔到新單，而「撳得到」嗰把尺照樣綠。',
      },
      /* ⭐ 條 bar 自己都要量：佢搬咗去最頂，⚠️ 瀏海／狀態列會唔會壓返佢？ */
      { testid: 'pending-bar', why: '條 bar 自己俾人坐住 ⇒ 撳極都入唔到同步頁。' },
      /* ⛔⛔ 碌到底之後佢仲要喺同一個位 —— 見 `scrollFirst` 上面嗰段。 */
      {
        testid: 'pending-bar',
        scrollFirst: true,
        why:
          '⛔⛔ 碌落去就唔見咗 ＝ 偷偷做成咗 2026-09-06 已經否決嘅「乙 · 頂部」，' +
          '而且踩爛上線清單第 1 條「畫面永遠見到『未上載 N 張』」。',
      },
      /* ⭐ 首頁三個數字掣 2026-09-14 中過一次「成個捲動區蓋咗上面」。 */
      { testid: 'stat-pending', why: '首頁三個數字掣 2026-09-14 俾捲動層蓋過一次。' },
      /* ⛔ 唔係掣，但一樣唔准俾人坐住 —— 條 bar 搬咗去最頂，佢隔籬就係品牌字。 */
      { sel: '.hmark', why: '條 bar 搬咗最頂，⚠️ 一疊落去就會坐喺品牌字上面。' },
    ],
  },

  /* ⭐⭐ **條 bar ＋ 波浪 header 一齊出。**

     ⛔⛔ **點解要多開一個畫面 —— ⛔ 唔准淨係記住結論**

     條 bar 由「底 nav 上面」搬去「最頂」，⚠️ **等於由一個窿搬去另一個窿旁邊**：
     底部嗰邊有 FAB，頂部嗰邊有**返回掣、頁面標題、user pill、垃圾桶**。
     實測（390×844）頂部頭 64px 從來都唔係空嘅：

     ```
     首頁         .hmark（品牌字）      top 22  h 49
     工程詳情     .head-trash（垃圾桶） top 22  h 44   ← 一粒真·刪嘢掣
     工程列表     .page-title ＋ user pill
     ```

     ⇒ 所以⛔ 唔可以淨係量首頁。呢個畫面用**工程詳情 ＋ 最長嗰個真工程名**，
       量粒垃圾桶同粒返回掣嘅中心 —— ⭐ 兩粒入面有一粒係**冇得反悔**嘅動作。 */
  pendinghub: {
    screen: 'pendinghub',
    query: '',
    noEscape: [{ testid: 'pending-bar' }],
    centreHit: [
      {
        testid: 'hub-delete',
        why: '⛔⛔ 粒垃圾桶俾條 bar 坐住 ＝ 刪唔到工程，而且睇落好似個 app 壞咗。',
      },
      { testid: 'pending-bar', why: '條 bar 自己俾人坐住 ⇒ 撳極都入唔到同步頁。' },
      { sel: '.chip-btn', why: '返回掣俾條 bar 坐住 ＝ 出唔返去，戴住手套更加試唔到第二下。' },
      { sel: '.head-name', why: '工程名俾條 bar 坐住 ＝ 唔知自己開緊邊一單。' },
    ],
  },

  /* ⭐⭐ 一粒撳唔到嘅掣，睇落一定要同撳得嘅唔同。

     ⛔⛔ **點解要一把尺 —— ⛔ 唔准淨係記住結論**

     2026-09-17：`.export-bar .button:disabled` 個字色寫住 `var(--q-text-3)`，
     ⚠️ **而嗰個變數由頭到尾冇定義過**（第三層叫 `--q-text-secondary`）。
     ⇒ 個色**靜靜咁冇暗到** —— ⭐ 而 CSS 引錯變數係 **⛔ 唔報錯、⛔ build 唔紅、
     ⛔ lint 唔出聲** 嘅，所以佢可以就咁擺喺度好耐冇人知。

     ⚠️ 後果⛔ 唔係「靚唔靚」：**一粒撳唔到嘅掣睇落同撳得嘅一樣** ——
     ⭐ 同「灰咗嘅掣係一個冇答案嘅問題」（`StatusCard` / `PhotoSlot`）同一個家族。

     ⇒ 呢把尺⛔ 唔對死一個色碼（色會改），佢問嘅係
     **「撳唔到嗰粒同撳得嗰粒，色係咪真係唔同」**。 */
  exportnone: {
    query: '',
    disabledLooksDisabled: [{ scope: '.export-bar' }],
  },

  /* ⭐⭐ 「移除」同「修剪／拉索加固」互斥 —— 剔唔到嗰啲要**講到出點解**。

     ⛔⛔ **點解要一把尺 —— ⛔ 唔准淨係記住結論**

     呢條規矩 **2026-08-24 拍咗板，22 日冇入過真 code**
     （同「封存」同「藍底色」一樣，見附錄 B「原型拍咗板 ≠ 入咗真 code」）。
     ⚠️ 而佢⛔ 唔係「靚唔靚」：兩樣都剔咗 ＝ **一棵已經冇咗嘅樹，
     報價單上面照計埋修剪錢** —— 係**出咗去俾客人嘅價錢**。

     ⭐ 量嘅⛔ 唔止「灰咗」，係「灰咗**而且講到出點解**」：
     ⚠️ 「一粒灰咗嘅掣係一個冇答案嘅問題」—— `StatusCard` 同 `PhotoSlot`
        兩個檔為咗同一件事寫過同一句。 */
  treeremoval: {
    query: '',
    mustLock: [
      { testid: 'pick-crown_cleaning', needs: 'blocked-crown_cleaning' },
      { testid: 'pick-cabling', needs: 'blocked-cabling' },
    ],
    /* ⭐⭐ 「起樹頭」⛔ 唔准俾擋 —— P3f 明文「✅ 移除 ＋ 起樹頭 係正常組合」。
       ⚠️ 冇呢一項，一把「擋得太多」嘅尺會照樣全綠。 */
    canStillPick: [{ testid: 'pick-stump_removal', why: '移除 ＋ 起樹頭 係正常組合' }],
  },

  /* ⭐⭐ 舊單：兩樣都已經剔咗。**量嘅係出口。**

     ⛔⛔ 連「剔走其中一樣」都俾人擋住，佢就**永遠卡死喺一個違規狀態**，
     ⛔ 連修都修唔到 —— 附錄 B 嗰條「一條規矩啱、但冇出口」。

     ⚠️ Jason 2026-09-16：「唔理舊樹，我會刪除舊工程」⇒ ⛔ 冇遷移、⛔ 冇提示。
     ⭐ **但呢條出口規矩照留** —— 唔然佢刪之前嗰幾日就卡死。 */
  treeboth: {
    query: '',
    canStillPick: [
      { testid: 'pick-crown_cleaning', why: '舊單兩樣都有 ⇒ 剔走修剪嗰樣要仲得' },
      { testid: 'pick-removal', why: '舊單兩樣都有 ⇒ 剔走移除嗰樣要仲得' },
    ],
  },

  /* ⭐⭐ 工程名長到爆嗰張卡 —— 量嘅係**兩件嘢有冇疊埋**。

     ⛔⛔ **點解要有呢把尺 —— ⛔ 唔准淨係記住結論**

     2026-09-15：`ui:check` 出「量咗 90 項，對唔上 0 項」、「179 粒掣，撳唔到 0 粒」
     ——**全綠**。但 Jason 部機張截圖入面，工程名 `Test123456897536654267898758`
     **直接壓咗喺「現場中」嗰粒標籤上面，兩樣字疊埋，兩樣都讀唔到**。

     ⭐ 點解舊尺捉唔到：
       · 對數量嘅係**每件嘢自己喺邊個位**，⛔ 佢唔會問「你兩件撞唔撞」
       · 「撳得到」量嘅係**撳唔撳得落**，⚠️ 而張卡係一整粒掣 ——
         字疊埋咗，佢一樣撳得落，⛔ 一樣綠
     ⇒ **又一次：一把尺量唔到嘅嘢，佢綠燈證明唔到佢冇事。**
        （附錄 B「`ui:check` 綠燈 ≠ 個掣仲用得」係同一個病。） */
  longname: {
    query: '',
    overlap: [{ a: 'proj-title', b: 'proj-side', why: '工程名壓住右邊粒狀態標籤' }],
  },

  /* ⭐⭐ 加成 ％ 存唔到，一定要出聲。

     ⛔⛔ **點解要一把尺** —— 呢格係全 app **唯一一格冇儲存掣、打一個字存一次**嘅。
     2026-09-16 實測：存唔到**畫面一個字都冇**（兩次 unhandled rejection）。
     ⚠️ 而佢係**計報價價錢**嘅格。⭐ 同 PR #17「撳咗冇反應」係同一條。
     ⚠️ 靜態睇 code 睇唔出 —— 一定要**真鍵盤打落去**先量到。 */
  hubfail: {
    screen: 'hubfail',
    query: '',
    typeThenSee: {
      testid: 'markup-input',
      type: '35',
      needs: 'markup-error',
      why: '加成 ％ 存唔到',
    },
    /* ⭐⭐ 2026-09-19：Jason 真機報「狀態撳唔到」。
       根因係 `void onStatusChange(…).finally(…)` ⛔ 冇 `.catch` ——
       ⚠️ 撳落去「改緊⋯」閃一閃就冇咗，**⛔ 一隻字都冇**。
       ⭐ 同加成嗰格**同一條字、同一個病**；加成嗰個修咗，⛔ 但冇人掃返其餘。
       ⇒ 呢把尺同 `typeThenSee` 係一對：一個量「打完字存唔到要出聲」，
         一個量「撳完做唔到要出聲」。 */
    tapThenSee: {
      testid: 'status-quoted',
      needs: 'status-error',
      why: '轉狀態俾伺服器拒絕',
    },
  },

  /* ⭐⭐ 工程詳情頁頂部：大字工程名 ＋ 右上角粒垃圾桶。
     ⚠️ **同上面張卡一模一樣嘅病**，所以一加咗粒垃圾桶就要即刻量返。
     ⛔ 用返 Jason 部機嗰個真名，⛔ 唔准用短名量完就算。
     ⭐ 順手量埋粒垃圾桶撳唔撳得到（`hits`）同埋佢有幾大（`minSize`）。 */
  hubname: {
    query: '',
    overlap: [{ a: 'head-name', b: 'hub-delete', why: '頂部工程名壓住粒垃圾桶' }],
    minSize: [{ testid: 'hub-delete', w: 44, h: 44 }],
  },

  /* ⭐⭐ 數唔到嗰個樣 —— 量嘅係**一條安全性質**，⛔ 唔係一個版面。 */
  dialogfail: {
    screen: 'dialogfail',
    query: '',
    mustLock: [{ testid: 'delete-confirm', needs: 'delete-cannot-count' }],
  },

  /* ⭐⭐ 相片頁第 3 粒「拍攝」掣 —— ⛔ 呢個係一個**量出嚟嘅險位**，⛔ 唔係一個安全數。

     2026-09-20 Jason 撳完原型，揀咗**甲 · 現狀**（⛔ 唔改排法）。
     ⚠️⚠️ 揀甲 ＝ **兩個真問題佢知情下接受咗**，⛔ 唔係冇咗：
       (i) 9 個工序要碌 1058px
       (ii) **727 度第 3 粒「拍攝」嘅 clearance 係 `−1px`**（最底 1px 俾 nav 蓋住；
            ⛔ 唔係「見唔到」—— 48px 嘅掣仲有 47px 撳得到）

     ⛔⛔ 所以呢把尺⛔ **唔係**量「見唔見到」—— 佢而家仲撳得到。
        佢量嘅係 **clearance ⛔ 唔准再差**。

     ⛔⛔ **報數一律用 `clearance` 加正負號，⛔ 唔准用形容詞。**
        ⚠️ 同一個 `−1px`，2026-09-20 一日之內俾人讀錯咗兩次：
          · 「爭 1px 就見到」⇒ 讀成仲有空位，**反轉咗**
          · 「已經見唔到」  ⇒ **講大咗**（淨係蓋住 48px 入面最底 1px）
        ⭐ 一個帶正負號嘅數⛔ 冇得讀反，形容詞有。

     ⚠️⚠️ **點解要有佢**：張卡高咗一次已經出過事。
        `VITE_PHOTO_WORKER_URL` 未設定嗰陣，卡上面多咗段 102px 黃色警告
        ⇒ 每格由 **212px 發水到 328px**，第 3 粒由 y 643 跌到 y 943。
        ⇒ **將來任何令張卡高咗嘅改動（多一行字、多一個 badge、多一段警告），
          都會靜靜咁將佢推得更出，而⛔ 冇任何一把尺會紅。**

     ⛔ 兩個高度都要量。⭐ 844 度佢仲有 +116px —— 即係話
       **一把淨係量 844 嘅尺喺呢度會全綠**（同 `SHORT_H` 嗰段同一個道理）。 */
  treephotos: {
    screen: 'treephotos',
    clearance: [
      {
        what: '第 3 粒「拍攝」掣',
        slot: 2,
        label: '拍攝',
        /* ⛔⛔ 呢兩個數係 2026-09-20 實測。**⛔ 淨係可以升，⛔ 唔准降。**
           ⚠️ 降一格 ＝ 「我接受張卡再高啲」，而嗰個決定⛔ 要 Jason 本人講。 */
        floors: { 727: -1, 844: 116 },
        why:
          '張卡一高，佢就推得更出畫面，而⛔ 冇任何提示 —— 人只會以為呢一格影唔到相。',
      },
    ],
  },

  dialoglong: {
    // ⚠️ 同上面用同一個畫面，⛔ 唔係另一個 component —— 一模一樣嘅 code，
    //    淨係內容唔同。咁對出嚟嘅先算數。
    screen: 'dialog',
    query: '&long=1',
    // 撳一下「刪除」令佢出埋錯誤 —— ⭐ 咁先係真正嘅「內容最長」。
    before: async (page) => { await page.click('[data-testid="delete-confirm"]') },
    remember: ['delete-cancel', 'delete-confirm'],
    /* ⭐⭐ **錯誤訊息一定要真係睇得到，⛔ 唔係「有出喺 DOM」。**
       ⚠️ 2026-09-14 影相驗返先發現：彈窗中間嗰段係一個**寫死高度嘅捲動框**
       （186px，為咗釘死兩粒掣嘅位）。工程名一長，錯誤訊息就出咗喺**框底之外**——
       ⭐ 同「錯誤訊息渲染喺手指上面 2037px」係**同一個病**，淨係細部咗個框咁解。
       ⇒ 呢度量返佢喺唔喺框入面。醫法係 `ErrorNotice` 自己捲返入嚟。 */
    inView: [{ what: 'delete-error', inside: 'delete-dialog-body' }],
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
/**
 * **用真滑鼠拖一嘢**，然後讀返張卡最尾停咗喺邊。
 *
 * ⛔⛔ 呢度⛔ 唔准改成自己 `dispatchEvent` —— 見上面 `swipe` 個註解。
 * ⭐ 讀嘅係 `getComputedStyle().transform` 個 `m41`（＝ translateX），
 *    ⚠️ ⛔ 唔係讀 React state：state 啱而畫面唔郁，正正就係要捉嗰種病。
 * ⭐ 拖完等 400ms 先量：⛔ 要等埋 `.2s` 嗰個 transition，
 *    **亦都要等埋放手之後瀏覽器補嗰一下 `click`** —— 嗰下就係會令佢彈返 0 嗰個。
 */
async function realMouseDrag(page, { testid, by, steps = 12 }) {
  const box = await page.locator(`[data-testid="${testid}"]`).first().boundingBox()
  if (!box) return null
  const y = box.y + box.height / 2
  const x = box.x + box.width * 0.7
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i += 1) await page.mouse.move(x + (by * i) / steps, y)
  await page.mouse.up()
  await page.waitForTimeout(400)
  return await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return null
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return Math.round(m.m41 * 10) / 10
  }, testid)
}

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
/** 「真滑鼠拖得郁」嗰組：⛔ 一樣分開數。 */
let dragChecked = 0
let dragBad = 0
/** 「訊息睇得到」嗰組（⛔ 唔係「有冇喺 DOM」）。 */
let seenChecked = 0
let seenBad = 0
/** 「數唔到就鎖住」嗰組 —— P8 步 2 最緊要嗰條性質。 */
let lockChecked = 0
let lockBad = 0
/** 「兩件嘢冇疊埋」嗰組。 */
let overlapChecked = 0
let overlapBad = 0
/** 「打完字存唔到要出聲」嗰組。 */
let typedChecked = 0
let typedBad = 0
/*
 * ⛔⛔ 「撳完做唔到要出聲」**自己一組** —— ⛔ 唔准同上面「打完字」共用。
 *
 * ⚠️ 2026-09-19 中過：`tapThenSee` 一開始借咗 `typedChecked`／`typedBad`，
 *    而 `FLOORS` 有一行 `['打完字存唔到要出聲', typedChecked, 5]`。
 *    ⇒ **一個「撳」嘅檢查幫「打字」嘅下限頂數** ——
 *      將來有人剷走一個 `typeThenSee`，個下限照樣過得。
 * ⭐ 正正就係我哋自己成日講嗰句：**兩件唔同嘅嘢撈埋一齊就等於冇講。**
 */
let tapChecked = 0
let tapBad = 0
/** 「中心點撳到自己」嗰組 —— ⛔ 同上面「撳得到」係兩把唔同嘅尺，見下面。 */
let centreChecked = 0
let centreBad = 0
/** 「一開就見到」嗰組 —— ⛔ 唔准撳、⛔ 唔准碌。 */
let firstChecked = 0
let firstBad = 0
/** 「睇落撳得就一定撳得」嗰組。 */
let fakeChecked = 0
let fakeBad = 0

/** 「拍攝掣離底部 nav 仲有幾遠」嗰組 —— ⛔ 量嘅係「唔准再差」，⛔ 唔係「見唔見到」。 */
let clearChecked = 0
let clearBad = 0

/** 「撳完⛔ 唔變藍」同「鍵盤仲睇得到」嗰組。 */
let blueChecked = 0
let blueBad = 0

/** 我哋自己個綠。⛔ focus 框一定要係佢，⛔ 唔准係瀏覽器嗰個預設環。 */
const ACCENT = 'rgb(152, 165, 107)'

/** 一個 outline 睇唔睇得到。 */
const RING_VISIBLE = (r) => r.style !== 'none' && parseFloat(r.width) > 0

/** 「粒掣夠唔夠大撳」嗰組。 */
let sizeChecked = 0
let sizeBad = 0
/** 「⛔ 冇得撳走」嗰組 —— 上線清單第 1 條。 */
let escapeChecked = 0
let escapeBad = 0

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

  /* ⛔⛔ **呢一組一定要喺呢度行 —— ⛔ 唔准搬落去。**
     下面啲尺會撳掣、會碌畫面（`centreHit` 個 `scrollFirst`、`askingWhenTyped` 打字…）。
     ⚠️ 一碌咗，「一開就見到」就量唔返 —— 而量到嘅「見到」會係一個**假嘅合格**。
     ⭐ 所以佢擺喺 `goto` 之後、任何人郁過個畫面之前。 */
  /* ── ⭐⭐ 一開就見到嗎？（⛔ 唔准撳、⛔ 唔准碌） ──────────────

     ⛔⛔ **點解要一把尺 —— ⛔ 唔准淨係記住結論**

     2026-09-17 Jason 撳咗三個做法嘅原型，揀咗（丙）：轉狀態卡搬去最頂。

     ⚠️⚠️ **以下係 CO 嘅分析，⛔ 唔係 Jason 嘅理由 —— 佢淨係揀咗（丙），
        ⛔ 冇講過點解。**（CO 2026-09-21 捉返。）
     ⇒ CO 睇法：**（丙）贏嘅地方⛔ 唔係「撳咗有反應」，係「根本唔使撳」。**

     ⇒ 所以呢把尺⛔ 唔可以量「撳完之後見唔見到」——
       佢一定要喺 **scrollTop 0、⛔ 一下都未撳過** 嗰個狀態度量。

     原本個排法（張卡喺「匯出 PDF」之後）實測：
         三粒狀態 chip 頂  761px
         底部 nav 頂       642px      ⇒ 褪咗 119px

     ⚠️ 而嗰 119px 係**靜靜**嘅：畫面冇報錯、冇灰、冇任何提示，
        淨係「見唔到」。Jason 當日嗰句「我撳狀態冇反應」就係咁嚟。 */
  if ((spec.firstSight ?? []).length > 0) {
    /*
     * ⛔⛔ **⛔ 唔准開第二版嚟量矮嘅** —— 喺同一版度縮高度、量完即刻縮返。
     * ⚠️ 縮返之後要等 layout 定，先至輪到下面九把尺；
     *    ⛔ 唔等就會喺一個中間狀態度量，而嗰種數查極查唔到。
     */
    const READ = ([testid, scrollId, navSel]) => {
      const el = document.querySelector(`[data-testid="${testid}"]`)
      const scroller = scrollId ? document.querySelector(`[data-testid="${scrollId}"]`) : null
      const nav = document.querySelector(navSel)
      if (!el || !nav) return null
      const b = el.getBoundingClientRect()
      const n = nav.getBoundingClientRect()
      return {
        scrollTop: scroller ? Math.round(scroller.scrollTop) : 0,
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        navTop: Math.round(n.top),
      }
    }

    /* ⭐ 兩個高度都要過。⛔ 唔係「揀一個」—— 見上面 `SHORT_H` 嗰段。 */
    for (const at of [
      { h: H, tag: `${W}×${H}` },
      { h: SHORT_H, tag: `${W}×${SHORT_H}（Jason 部機真實可用高度）` },
    ]) {
      if (at.h !== H) {
        await real.setViewportSize({ width: W, height: at.h })
        await real.waitForTimeout(400)
      }
      for (const one of spec.firstSight ?? []) {
        firstChecked += 1
        const r = await real.evaluate(READ, [
          one.testid,
          one.scroller ?? null,
          one.nav ?? '.bottom-nav',
        ])
        if (r === null) {
          firstBad += 1
          console.log(`  ✗ [${one.testid}] ${at.tag}：揾唔到 —— ⛔ 量唔到就當唔合格`)
          continue
        }
        /* ⛔⛔ 呢一句係成把尺嘅前提：如果畫面已經碌咗，
           下面量到「見到」就係一個**假嘅合格**。 */
        if (r.scrollTop !== 0) {
          firstBad += 1
          console.log(
            `  ✗ ⛔⛔ [${one.testid}] ${at.tag}：量之前個畫面已經碌咗 ${r.scrollTop}px` +
              ' —— 呢把尺量嘅係「⛔ 唔使碌」',
          )
          continue
        }
        const hidden = Math.max(0, r.bottom - r.navTop)
        if (hidden > 0) {
          firstBad += 1
          console.log(
            `  ✗ ⛔⛔ [${one.testid}] ${at.tag}：一開就褪咗 ${hidden}px 落底部 nav 後面` +
              `（卡底 ${r.bottom}、nav 頂 ${r.navTop}）`,
          )
          console.log(`      ⚠️ ${one.why}`)
          console.log('      ⛔ 見唔到嘅嘢冇任何提示 —— 人只會以為撳咗冇反應。')
        } else if (r.top < 0) {
          firstBad += 1
          console.log(
            `  ✗ ⛔⛔ [${one.testid}] ${at.tag}：一開就有 ${-r.top}px 喺畫面上面出咗界（頂 ${r.top}）`,
          )
          console.log(`      ⚠️ ${one.why}`)
        } else {
          console.log(
            `  ✓ [${one.testid}] ${at.tag}：完整見到（${r.top}–${r.bottom}，` +
              `nav 頂 ${r.navTop}，仲爭 ${r.navTop - r.bottom}px）`,
          )
        }
      }
    }
    /* ⛔ 縮返原本高度 —— 下面九把尺同 90 項對數全部係喺 H 度定嘅。 */
    await real.setViewportSize({ width: W, height: H })
    await real.waitForTimeout(400)
  }

  /* ── ⭐⭐ Clearance：粒掣離底部 nav 仲有幾遠（⛔ 唔准再差）────────

     ⛔⛔ **同上面「一開就見到」係兩把唔同嘅尺，⛔ 唔准撈埋。**
        「一開就見到」問：**見唔見到**（0 就係唔合格）。
        呢把問：**同上次比，有冇變差**（而家個數可以係負數 ＝ 粒掣最底嗰幾 px
        俾 nav 蓋住，⛔ 唔等於「見唔到」）。
     ⭐ 兩把都要，因為 Jason 2026-09-20 知情下接受咗一個負數 ——
       ⇒ ⛔ 用「一開就見到」嗰把尺量佢，只會日日紅，而紅咗都改唔到（佢揀咗唔改）
         ⇒ 結果一定係有人調鬆佢，而嗰下就連「有冇變差」都冇人睇。

     ⚠️ 同上面一樣擺喺呢度：⛔ 任何人郁過個畫面之前。 */
  if ((spec.clearance ?? []).length > 0) {
    const CLEAR = ([index, label, navSel, scrollId]) => {
      const slots = document.querySelectorAll('[data-testid="photo-slot"]')
      const nav = document.querySelector(navSel)
      const scroller = scrollId ? document.querySelector(`[data-testid="${scrollId}"]`) : null
      if (!nav) return null
      const card = slots[index]
      if (!card) return { slots: slots.length }
      const btn = [...card.querySelectorAll('.photo-slot__buttons button')].find(
        (b) => b.textContent.trim() === label,
      )
      if (!btn) return { slots: slots.length }
      const b = btn.getBoundingClientRect()
      const navTop = nav.getBoundingClientRect().top
      return {
        slots: slots.length,
        scrollTop: scroller ? Math.round(scroller.scrollTop) : 0,
        cardHeight: Math.round(card.getBoundingClientRect().height),
        bottom: Math.round(b.bottom),
        navTop: Math.round(navTop),
        clearance: Math.round(navTop - b.bottom),
      }
    }

    /* ⭐ 兩個高度都要過。⛔ 唔係「揀一個」—— 844 度佢仲有一百幾十 px，
       即係話一把淨係量 844 嘅尺喺呢度會全綠。 */
    for (const at of [
      { h: H, tag: `${W}×${H}` },
      { h: SHORT_H, tag: `${W}×${SHORT_H}（Jason 部機真實可用高度）` },
    ]) {
      if (at.h !== H) {
        await real.setViewportSize({ width: W, height: at.h })
        await real.waitForTimeout(400)
      }
      for (const one of spec.clearance ?? []) {
        clearChecked += 1
        const floor = one.floors[at.h]
        if (floor === undefined) {
          clearBad += 1
          console.log(`  ✗ ⛔⛔ ${one.what} ${at.tag}：呢個高度冇寫下限 —— ⛔ 冇下限就唔算量過`)
          continue
        }
        const r = await real.evaluate(CLEAR, [
          one.slot,
          one.label,
          one.nav ?? '.bottom-nav',
          one.scroller ?? 'tree-photos-scroll',
        ])
        if (r === null || r.clearance === undefined) {
          clearBad += 1
          console.log(
            `  ✗ ⛔⛔ ${one.what} ${at.tag}：揾唔到（畫面得 ${r?.slots ?? 0} 格相）—— ⛔ 量唔到就當唔合格`,
          )
          continue
        }
        /* ⛔⛔ 樣本本身變咗（例如 fixture 改咗工序數）就⛔ 唔准靜靜咁量第二格。 */
        if (r.slots !== 3) {
          clearBad += 1
          console.log(
            `  ✗ ⛔⛔ ${one.what} ${at.tag}：呢版而家有 ${r.slots} 格相，⛔ 唔係 3 格` +
              ' —— 個樣本變咗，呢個數同舊嗰個⛔ 比唔到',
          )
          continue
        }
        if (r.scrollTop !== 0) {
          clearBad += 1
          console.log(`  ✗ ⛔⛔ ${one.what} ${at.tag}：量之前個畫面已經碌咗 ${r.scrollTop}px`)
          continue
        }
        const sign = (n) => (n >= 0 ? `+${n}` : `${n}`)
        if (r.clearance < floor) {
          clearBad += 1
          console.log(
            `  ✗ ⛔⛔ ${one.what} ${at.tag}：clearance ${sign(r.clearance)}px，` +
              `下限係 ${sign(floor)}px —— **差咗 ${floor - r.clearance}px**`,
          )
          console.log(`      （卡高 ${r.cardHeight}px，掣底 ${r.bottom}，nav 頂 ${r.navTop}）`)
          console.log(`      ⚠️ ${one.why}`)
          console.log(
            '      ⛔ 呢個⛔ 唔係「調低下限」嘅訊號 —— 係「邊樣嘢令張卡高咗」要查返。',
          )
        } else {
          const extra = r.clearance > floor ? `（⭐ 好過下限 ${r.clearance - floor}px）` : ''
          console.log(
            `  ✓ ${one.what} ${at.tag}：clearance ${sign(r.clearance)}px，` +
              `下限 ${sign(floor)}px${extra}　卡高 ${r.cardHeight}px` +
              (r.clearance < 0
                ? `　⚠️ 負數 ＝ 粒掣最底 ${-r.clearance}px 俾 nav 蓋住（Jason 2026-09-20 知情下接受）`
                : ''),
          )
        }
      }
    }
    await real.setViewportSize({ width: W, height: H })
    await real.waitForTimeout(400)
  }


  // ── 真滑鼠拖（⛔ 一定要喺「撳得到」掃描之前 —— 推開咗個垃圾桶掣先露出嚟）──
  if (spec.drag) {
    const got = await realMouseDrag(real, spec.drag)
    dragChecked += 1
    if (got === null || Math.abs(got - spec.drag.expect) > TOL) {
      dragBad += 1
      console.log(
        `  ✗ 真滑鼠向左拖 ${-spec.drag.by}px —— 張卡停咗喺 ${got}px，應該係 ${spec.drag.expect}px`,
      )
      console.log(
        got === 0
          ? '      ⛔ 0px ＝ 完全冇郁過。Pointer Events 甩咗，或者尾隨嗰下 click 收返咗佢。'
          : '      ⛔ 見 src/lib/swipeDelete.ts 檔頭。',
      )
    } else {
      console.log(`  ✓ 真滑鼠向左拖 ${-spec.drag.by}px ⇒ 停喺 ${got}px（露出個刪除掣）`)
    }
  }

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
    /* ⛔ `protoFile` ＝ 呢個畫面對嘅唔係 stage57，係另一個拍咗板嘅原型檔。
       ⚠️ 見 `pending` 嗰個 spec：對一個已經作廢嘅稿，綠燈同紅燈都冇意思。 */
    await proto.goto('file://' + path.resolve(spec.protoFile ?? PROTO))
    await proto.evaluate(() => document.fonts.ready)
    if (spec.proto) await proto.evaluate((fn) => window[fn](), spec.proto)
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

  /* ── 兩件嘢有冇疊埋？（⛔ 一定要喺 hit 掃描之前 —— 嗰個會 scrollIntoView）──
     ⭐ 量嘅係**畫出嚟嗰個框**（`getBoundingClientRect`），⛔ 唔係 CSS 寫咗乜。
     ⚠️ 長工程名個窿正正就係「盒縮到 0，但啲字照樣畫出盒外」——
        ⛔ 睇 CSS 睇唔出，一定要量真嘅框。 */
  for (const one of spec.overlap ?? []) {
    overlapChecked += 1
    const r = await real.evaluate(([a, b]) => {
      const ea = document.querySelector(`[data-testid="${a}"]`)
      const eb = document.querySelector(`[data-testid="${b}"]`)
      if (!ea || !eb) return null
      const ra = ea.getBoundingClientRect()
      const rb = eb.getBoundingClientRect()
      /* ⭐ 用 `range` 量**啲字真正畫到去邊**，⛔ 唔係量個盒 ——
         個盒俾 `min-width: 0` 縮咗，但啲字可以照樣爆出去。 */
      const range = document.createRange()
      range.selectNodeContents(ea)
      const ink = range.getBoundingClientRect()
      range.detach?.()

      /* ⛔⛔ **但 `range` 報嘅係「未剪之前」嗰個闊度 —— 一定要自己剪返。**
         ⚠️ 2026-09-15 呢把尺第一版就係漏咗呢段，喺工程詳情頁出咗一個**假紅**：
         報「疊埋咗 122px」，但個名其實有 `overflow: hidden` ＋ `…`，
         真機睇落**完全冇疊**（名剪到 318，粒垃圾桶由 328 開始，
         `elementFromPoint` 打粒垃圾桶中心撳到嘅就係佢本人）。
         ⭐ 所以要由佢自己行上去，凡係 `overflow-x` 唔係 `visible` 嘅祖先
         都會剪住佢 —— **瀏覽器點剪，尺就要點剪**。
         ⚠️ 假紅係最快令人唔再理一把尺嘅嘢（附錄 B 自己寫低過），
         ⛔ 所以呢段唔准拆。 */
      let clipRight = Infinity
      for (let e = ea; e && e !== document.documentElement; e = e.parentElement) {
        if (getComputedStyle(e).overflowX !== 'visible') {
          clipRight = Math.min(clipRight, e.getBoundingClientRect().right)
        }
      }
      const inkRight = Math.min(ink.right, clipRight)
      const right = Math.max(ra.right, inkRight)
      const overlapPx = Math.round(right - rb.left)
      return {
        overlapPx,
        boxRight: Math.round(ra.right),
        inkRight: Math.round(inkRight),
        rawInkRight: Math.round(ink.right),
        clipped: clipRight !== Infinity && ink.right > clipRight,
        otherLeft: Math.round(rb.left),
      }
    }, [one.a, one.b])
    if (r === null) {
      overlapBad += 1
      console.log(`  ✗ [${one.a}] 或者 [${one.b}] 揾唔到 —— 量唔到`)
    } else if (r.overlapPx <= 0) {
      const how = r.clipped ? `，啲字剪到 ${r.inkRight}（本身想去到 ${r.rawInkRight}）` : ''
      console.log(`  ✓ [${one.a}] 冇壓住 [${one.b}]（差 ${-r.overlapPx}px${how}）`)
    } else {
      overlapBad += 1
      console.log(`  ✗ ⛔⛔ ${one.why} —— 疊埋咗 ${r.overlapPx}px`)
      console.log(
        `      啲字畫到 ${r.inkRight}（個盒淨係去到 ${r.boxRight}），而 [${one.b}] 由 ${r.otherLeft} 開始`,
      )
      console.log('      ⛔ 兩樣字疊埋 ＝ 兩樣都讀唔到。')
    }
  }

  /* ── 打完字，存唔到有冇出聲？ ────────────────────────────────
     ⭐ **真鍵盤打落去**，⛔ 唔係 `fill()`、⛔ 唔係讀 code。 */
  /* ── ⭐ 撳完做唔到，畫面一定要出到字 ──────────────────────

     ⛔⛔ 量嘅係**現場見唔見到**，⛔ 唔係「有冇 throw」。
     ⚠️ 一個 unhandled rejection 喺 console 度好明顯，喺山上面完全睇唔到。 */
  if (spec.tapThenSee) {
    const one = spec.tapThenSee
    tapChecked += 1
    await real.locator(`[data-testid="${one.testid}"]`).click()
    await real.waitForTimeout(800)
    const r = await real.evaluate(([need, btn]) => {
      const el = document.querySelector(`[data-testid="${need}"]`)
      const b = document.querySelector(`[data-testid="${btn}"]`)
      if (!el) return { seen: false }
      const rect = el.getBoundingClientRect()
      const br = b ? b.getBoundingClientRect() : null
      return {
        seen: true,
        text: (el.textContent ?? '').trim().slice(0, 30),
        inView: rect.top >= 0 && rect.bottom <= innerHeight,
        /* ⭐ 句錯要**貼住**粒掣，⛔ 唔係出咗喺版尾。 */
        near: br === null ? false : Math.abs(rect.top - br.bottom) < 240,
        gap: br === null ? null : Math.round(rect.top - br.bottom),
      }
    }, [one.needs, one.testid])
    if (!r.seen) {
      tapBad += 1
      console.log(`  ✗ ⛔⛔ ${one.why}，但畫面**一個字都冇** —— 就係「撳咗冇反應」`)
      console.log('      ⚠️ 現場同事會一路撳一路以為個 app 壞咗。')
    } else if (!r.inView) {
      tapBad += 1
      console.log(`  ✗ ⛔ ${one.why} 有出聲，但嗰句字唔喺畫面入面（要碌先見到）`)
    } else if (!r.near) {
      tapBad += 1
      console.log(`  ✗ ⛔ ${one.why} 出咗聲，但離粒掣 ${r.gap}px —— ⛔ 太遠，等於冇出`)
    } else {
      console.log(`  ✓ ${one.why} ⇒ 出咗聲「${r.text}…」，而且貼住粒掣（爭 ${r.gap}px）`)
    }
  }

  if (spec.typeThenSee) {
    const one = spec.typeThenSee
    typedChecked += 1
    await real.locator(`[data-testid="${one.testid}"]`).click()
    /* ⛔⛔ 一定要先剷清個格先打。
       ⚠️ 2026-09-16 中過：個格本來有「50」，撳一下游標停喺尾，打「35」
       ⇒ 出「5035」，把尺報咗個**假紅**。⭐ 修嘅係**測試起點**，
       ⛔ 唔係放鬆個 assertion —— 要量嘅係「人打嘅嘢有冇俾人食咗」，
       所以個起點一定要係我控制得住嘅。 */
    await real.keyboard.press('Control+a')
    await real.keyboard.press('Backspace')
    await real.waitForTimeout(250)
    await real.keyboard.type(one.type, { delay: 90 })
    await real.waitForTimeout(700)
    const r = await real.evaluate(([need, field]) => {
      const el = document.querySelector(`[data-testid="${need}"]`)
      const box = document.querySelector(`[data-testid="${field}"]`)
      if (!el) return { seen: false, typedStill: box?.value ?? null }
      const rect = el.getBoundingClientRect()
      return {
        seen: true,
        text: (el.textContent ?? '').trim().slice(0, 30),
        inView: rect.top >= 0 && rect.bottom <= innerHeight,
        typedStill: box?.value ?? null,
      }
    }, [one.needs, one.testid])

    if (!r.seen) {
      typedBad += 1
      console.log(`  ✗ ⛔⛔ ${one.why}，但畫面**一個字都冇** —— 又一次「撳咗冇反應」`)
    } else if (!r.inView) {
      typedBad += 1
      console.log(`  ✗ ⛔ ${one.why} 有出聲，但嗰句字唔喺畫面入面（要碌先見到）`)
    } else if (r.typedStill !== one.type) {
      // ⛔ 存唔到唔應該連人打咗嘅嘢都食咗。
      typedBad += 1
      console.log(`  ✗ ⛔ 存唔到之後，人打嘅「${one.type}」唔見咗（個格而家係「${r.typedStill}」）`)
    } else {
      console.log(`  ✓ ${one.why} ⇒ 出咗聲「${r.text}…」，而且打咗嘅「${r.typedStill}」仲喺格入面`)
    }
  }

  /* ── 撳完⛔ 會唔會變藍？ ──────────────────────────────────────
     ⭐⭐ **⛔ 唔係讀 CSS，係真滑鼠撳落去再量。**
     ⚠️ `-webkit-tap-highlight-color` 讀 computed 就知；但「撳完粘住個底色／
        外框」⛔ 一定要真撳過先量得到 —— 佢係一個 `:focus` 狀態，
        ⭐ 靜態睇 CSS 係睇唔出嘅（同 2026-09-14「真滑鼠拖」同一個道理）。

     ⚠️⚠️ **一樣我證明唔到、⛔ 唔准扮證明到嘅嘢**：
        Jason 見到嗰浸藍係 **Android Chrome** 嘅 tap highlight。
        呢度（Linux headless Chromium）個預設值係 `rgba(0, 0, 0, 0.18)`（黑，唔係藍）。
        ⇒ 我量到嘅係「**佢有冇熄咗**」（要變成 `rgba(0, 0, 0, 0)`），
        ⛔ **唔係**「Android 嗰浸藍冇咗」。嗰半要 Jason 真機睇。 */
  for (const one of spec.noBlue ?? []) {
    blueChecked += 1
    const read = () =>
      real.evaluate((id) => {
        const e = document.querySelector(`[data-testid="${id}"]`)
        const c = getComputedStyle(e)
        return {
          tap: c.webkitTapHighlightColor,
          bg: c.backgroundColor,
          ring: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`,
        }
      }, one.testid)

    const before = await read()
    const box = await real.locator(`[data-testid="${one.testid}"]`).first().boundingBox()
    await real.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await real.waitForTimeout(220)
    const after = await read()

    const problems = []
    // ⭐ `transparent` 喺 computed 度係 `rgba(0, 0, 0, 0)`。
    if (before.tap !== 'rgba(0, 0, 0, 0)') problems.push(`tap highlight 仲係 ${before.tap}`)
    if (after.bg !== before.bg) problems.push(`撳完個底色由 ${before.bg} 變咗 ${after.bg}`)
    if (after.ring !== before.ring) problems.push(`撳完個框由「${before.ring}」變咗「${after.ring}」`)

    if (problems.length === 0) {
      console.log(`  ✓ [${one.testid}] 撳完⛔ 冇變樣，tap highlight 熄咗`)
    } else {
      blueBad += 1
      console.log(`  ✗ ⛔⛔ [${one.testid}] 撳完有嘢變 —— Jason 2026-08-29 已經拍板⛔ 唔要`)
      for (const x of problems) console.log(`      ${x}`)
    }
  }

  /* ── 鍵盤 Tab：⛔ 唔准睇唔到，而且⛔ 唔准係瀏覽器嗰個預設環 ────── */
  if (spec.keyboardRing) {
    blueChecked += 1
    await real.evaluate(() => document.activeElement?.blur())
    await real.keyboard.press('Tab')
    await real.waitForTimeout(200)
    const r = await real.evaluate(() => {
      const e = document.activeElement
      if (!e || e === document.body) return null
      const c = getComputedStyle(e)
      return {
        who: e.dataset?.testid || String(e.className).slice(0, 24) || e.tagName,
        style: c.outlineStyle,
        width: c.outlineWidth,
        color: c.outlineColor,
      }
    })
    if (r === null) {
      blueBad += 1
      console.log('  ✗ Tab 一下之後冇嘢 focus —— 量唔到')
    } else if (!RING_VISIBLE(r)) {
      blueBad += 1
      console.log(`  ✗ ⛔⛔ 鍵盤 Tab 去到 [${r.who}]，但個 focus **睇唔到**`)
      console.log('      ⚠️ 「唔要藍底」⛔ 唔等於「唔要 focus 指示」—— 見 app.css 檔頭。')
    } else if (r.color !== ACCENT) {
      blueBad += 1
      console.log(`  ✗ ⛔ 鍵盤 Tab 個框係 ${r.color}，⛔ 唔係我哋個綠 ${ACCENT}`)
      console.log('      ⚠️ 嗰個係瀏覽器預設環（有啲平台係藍色）。')
    } else {
      console.log(`  ✓ 鍵盤 Tab 去到 [${r.who}]，框係我哋個綠（${r.style} ${r.width} ${r.color}）`)
    }
  }

  /* ── 彈窗一開，focus 咗邊個、睇唔睇得到 ──────────────────────── */
  if (spec.focusStart) {
    blueChecked += 1
    const r = await real.evaluate((id) => {
      const e = document.querySelector(`[data-testid="${id}"]`)
      if (!e) return null
      const c = getComputedStyle(e)
      return {
        isActive: document.activeElement === e,
        active: document.activeElement?.dataset?.testid ?? '(唔知邊個)',
        style: c.outlineStyle,
        width: c.outlineWidth,
        color: c.outlineColor,
      }
    }, spec.focusStart.testid)
    if (r === null || !r.isActive) {
      blueBad += 1
      console.log(
        `  ✗ ⛔⛔ 彈窗一開冇 focus [${spec.focusStart.testid}]（focus 咗「${r?.active ?? '冇'}」）`,
      )
      console.log('      ⚠️ 呢個係 2026-08-11 誤刪嗰三道保險之一。')
    } else if (!RING_VISIBLE(r) || r.color !== ACCENT) {
      blueBad += 1
      const how = RING_VISIBLE(r) ? `唔係我哋個綠（${r.color}）` : '睇唔到'
      console.log(`  ✗ ⛔⛔ 彈窗 focus 咗 [${spec.focusStart.testid}]，但個框${how}`)
      console.log('      ⚠️ focus 咗但睇唔到 ＝ 保險有等於冇：人唔知自己停喺邊粒掣。')
    } else {
      console.log(`  ✓ 彈窗一開 focus 咗 [${spec.focusStart.testid}]，而且個綠框睇得到`)
    }
  }

  /* ── ⛔ 有冇得撳走？ ──────────────────────────────────────────
     `docs/上線清單.md` 第 1 條原文：**N 唔係零就⛔ 唔准收埋**、
     **⛔ 唔准有得撳走**（冇 ✕、冇「知道喇」、冇「唔好再提」）。

     ⭐⭐ **點解要一把尺睇住一條「唔准加嘢」嘅規矩**
     ⚠️ 一條「唔准加」嘅規矩，喺 code review 度**永遠睇落冇事** ——
        因為佢守嘅係「冇出現過嘅嘢」。加一粒 ✕ 落去，diff 睇落就係
        「體貼啲，俾人收埋佢」，⛔ 冇人會記得嗰粒 ✕ 正正係規矩禁止嗰樣。
     ⇒ 所以要量：條 bar 入面除咗佢自己，⛔ 唔准有第二粒掣，
        亦都⛔ 唔准出現「知道」「唔好再提」「稍後」「✕」呢啲字。 */
  const ESCAPE_WORDS = ['知道', '唔好再提', '稍後', '遲啲', '關閉', '收起', '✕', '×']
  for (const one of spec.noEscape ?? []) {
    escapeChecked += 1
    const r = await real.evaluate(([id, words]) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) return null
      const inner = [...el.querySelectorAll('button, [role=button], a[href]')]
      const text = (el.textContent ?? '').trim()
      return {
        innerButtons: inner.length,
        hit: words.filter((w) => text.includes(w)),
        text: text.slice(0, 24),
      }
    }, [one.testid, ESCAPE_WORDS])
    if (r === null) {
      escapeBad += 1
      console.log(`  ✗ [${one.testid}] 揾唔到 —— ⛔ N 唔係零就唔准收埋，但佢根本冇出`)
    } else if (r.innerButtons > 0 || r.hit.length > 0) {
      escapeBad += 1
      console.log(`  ✗ ⛔⛔ [${one.testid}] 有得撳走 —— 上線清單第 1 條講明⛔ 唔准`)
      if (r.innerButtons > 0) console.log(`      入面有 ${r.innerButtons} 粒自己嘅掣`)
      if (r.hit.length > 0) console.log(`      出現咗：${r.hit.join('、')}`)
    } else {
      console.log(`  ✓ [${one.testid}] 出咗，而且⛔ 冇得撳走（「${r.text}」）`)
    }
  }

  /* ── 粒掣夠唔夠大撳？ ──────────────────────────────────────────
     ⭐ 44×44 係戴住手套撳得穩嘅底線。⛔ 一粒撳得到但撳唔準嘅掣，
        喺一個**冇得反悔**嘅動作上面特別衰。 */
  for (const one of spec.minSize ?? []) {
    sizeChecked += 1
    const r = await real.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { w: Math.round(b.width), h: Math.round(b.height), label: el.getAttribute('aria-label') }
    }, one.testid)
    if (r === null) {
      sizeBad += 1
      console.log(`  ✗ [${one.testid}] 揾唔到`)
    } else if (r.w < one.w || r.h < one.h) {
      sizeBad += 1
      console.log(`  ✗ [${one.testid}] 得 ${r.w}×${r.h}，要 ${one.w}×${one.h}`)
    } else if (!one.noLabel && (r.label === null || r.label.trim() === '')) {
      // ⛔ 一粒得個圖嘅掣，冇中文 label 就係讀屏嗰邊完全講唔出佢係乜。
      sizeBad += 1
      console.log(`  ✗ [${one.testid}] 冇 aria-label —— ⛔ 一粒淨係得個圖嘅掣唔可以冇名`)
    } else {
      const named = one.noLabel ? '（有字，⛔ 唔使 label）' : `，label「${r.label}」`
      console.log(`  ✓ [${one.testid}] ${r.w}×${r.h}${named}`)
    }
  }

  /* ── ⛔ 粒掣個**正中央**撳唔撳到佢自己？ ───────────────────────

     ⛔⛔ **點解要多一把尺 —— ⛔ 唔准淨係記住結論**

     2026-09-16 Jason 真機報料：「宜家個版位遮住左新增工程個 fab」。
     嗰陣 `ui:check` 係**全綠**嘅 —— 「撳得到」嗰把尺量咗 179 粒掣、撳唔到 0 粒。

     實測返去先知點解（390×844）：

     ```
     「未上載 N 張」bar   y 703 – 749
     「加工程」FAB        y 684 – 742      中心 (343, 713)
     elementFromPoint(343, 713) → pending-bar   ⛔ 唔係 FAB
     ```

     ⭐ 即係話 **FAB 上面三分二俾遮咗，中心點根本撳唔到佢**，
        但「撳得到」嗰把尺係「**撒 5×5 點，有一點通就算數**」——
        FAB 下面兩隻角仲露住 ⇒ **佢照綠**。

     ⚠️⚠️ 嗰個「有一點通就算」⛔ **唔係寫錯，係特登嘅**（見 `HIT_GRID` 上面嗰段）：
        要求 25 點全通會出一大堆假紅，跟住冇人再理佢。
     ⇒ 所以⛔ **唔准去改嗰把尺**。正解係**另開一把窄啲、但嚴得多**嘅：
        **指名幾粒最緊要嘅掣，佢哋嘅正中央一定要打到自己。**

     ⭐ 點解係「中心」：人撳嘢係向住個中心撳嘅。一粒掣四隻角露住、
        中間俾人坐住，喺用嘅人嚟講就係**撳極都冇反應**。 */
  for (const one of spec.centreHit ?? []) {
    centreChecked += 1
    const r = await real.evaluate(([sel, scrollFirst]) => {
      /* ⭐ `scrollFirst` ＝ 先把某個捲動區碌到底，再量。

         ⛔⛔ 呢個⛔ 唔係「順手加」。⭐ **理由係上線清單第 1 條「畫面永遠見到」** ——
         一個「跟住內容一齊碌走」嘅版位，碌兩下就消失，而嗰條規矩要嘅係永遠見到。

         Jason 2026-09-16 嗰兩句**原話**（⛔ 逐字，⛔ 冇加嘢）：
           ·「細條啲既 bar 放最頂」
           ·「宜家個版位遮住左新增工程個 fab」

         ⇒ 而 2026-09-06 個原型入面，「乙 · 頂部」嗰個選擇嘅**明文代價**
           的確就係「碌落去就唔見咗」。

         ⛔⛔ **但佢⛔ 冇講過點解唔揀乙 —— 呢個⛔ 冇人問過佢。**
           ⚠️ 呢段註解本來寫住「Jason 正正因為呢個代價唔揀乙」——
           **⛔ 嗰句查唔到根據**：上面兩句原話係否決**甲**嘅理由，
           ⛔ 唔係否決乙嘅理由。（CO 2026-09-21 捉返。）
           ⭐ 而把尺⛔ 唔需要嗰個理由都企得住 —— 見上面第 1 條。 */
      if (scrollFirst) {
        /* ⛔⛔ **碌哂所有碌得到嘅嘢**，⛔ 唔係淨係碌一個指定嘅容器。
           ⚠️ 「條 bar 跟住碌走」唔止一種壞法：跟成版碌、跟 `.hmain` 碌、
              跟 `.float-cards-scroll` 碌、跟一個將來先出現嘅容器碌。
           ⭐ 指名一個 ⇒ 其餘全部走得甩，而把尺會綠住畀人睇。
              ⇒ 所以呢度掃晒，⛔ 唔准縮返做一個 selector。 */
        window.scrollTo(0, 1e6)
        for (const box of document.querySelectorAll('*')) {
          if (box.scrollHeight > box.clientHeight) box.scrollTop = box.scrollHeight
        }
      }
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const x = b.left + b.width / 2
      const y = b.top + b.height / 2
      const hit = document.elementFromPoint(x, y)
      const name = (node) =>
        node === null
          ? 'null'
          : (node.closest('[data-testid]')?.getAttribute('data-testid') ??
            (typeof node.className === 'string' && node.className !== ''
              ? node.className
              : node.tagName.toLowerCase()))
      return {
        x: Math.round(x),
        y: Math.round(y),
        ok: hit !== null && (el === hit || el.contains(hit)),
        blocker: name(hit),
      }
    /* ⭐ `testid` 係常用嗰個寫法；`sel` 係俾**唔係掣**嘅嘢用嘅
       （品牌字、頁面標題嗰啲冇 testid，但一樣⛔ 唔准俾人坐住）。 */
    }, [one.testid ? `[data-testid="${one.testid}"]` : one.sel, one.scrollFirst ?? null])
    const who = (one.testid ?? one.sel) + (one.scrollFirst ? '（碌到底之後）' : '')
    if (r === null) {
      centreBad += 1
      console.log(`  ✗ [${who}] 揾唔到 —— ⛔ 量唔到就當唔合格`)
    } else if (!r.ok) {
      centreBad += 1
      console.log(`  ✗ ⛔⛔ [${who}] 個中心 (${r.x}, ${r.y}) 撳落去打中「${r.blocker}」`)
      console.log(`      ⚠️ ${one.why ?? '個正中央俾人坐住 ⇒ 用嘅人淨係覺得「撳極冇反應」。'}`)
    } else {
      console.log(`  ✓ [${who}] 個中心 (${r.x}, ${r.y}) 打中自己`)
    }
  }

  /* ── ⛔ 計唔到嗰陣，⛔ 唔准出一個似層層但錯嘅價 ────────────────

     ⛔⛔ **點解要一把尺 —— ⛔ 唔准淨係記住結論**

     2026-09-16 實測：加成格打咗 `abc`，**報價價錢照出 `$43,400`**（成本價）。
     ⚠️ 而「**真係未填加成**」出嘅都係 `$43,400` —— **兩種一模一樣**。
     ⇒ 打錯一個字母，張單就**靜靜咁變成蝕本價**，⭐ 而嗰個係報俾客人嘅數。

     ⭐ Jason 2026-09-16 拍板：**計唔到就⛔ 唔出價。**
     ⚠️ 但⛔ 唔准一竹篙打一船 —— **空格係合法狀態**（CLAUDE.md §2.3 `null ≠ 0`），
        空格要**照出成本價**。⇒ 所以呢把尺要量**兩樣**，缺一不可。 */
  for (const one of spec.askingWhenTyped ?? []) {
    typedChecked += 1
    await real.locator('[data-testid="markup-input"]').click()
    /* ⛔ 先剷清 —— 同 `typeThenSee` 一樣嘅理由（個格本來有「50」）。 */
    await real.keyboard.press('Control+a')
    await real.keyboard.press('Backspace')
    await real.waitForTimeout(200)
    if (one.type) await real.keyboard.type(one.type, { delay: 60 })
    await real.waitForTimeout(600)
    const r = await real.evaluate(() => {
      const price = document.querySelector('[data-testid="asking-price"]')
      const why = document.querySelector('[data-testid="asking-why"]')
      const box = document.querySelector('[data-testid="markup-input"]')
      return {
        price: (price?.textContent ?? '').trim(),
        why: why ? (why.textContent ?? '').trim() : null,
        typedStill: box?.value ?? null,
      }
    })
    const showsMoney = r.price.includes('$')
    const ok = one.wantMoney ? showsMoney && r.why === null : !showsMoney && r.why !== null
    if (ok) {
      console.log(
        `  ✓ 加成打「${one.type || '（空）'}」⇒ 報價價錢「${r.price}」` +
          (r.why ? `，而且有講點解` : ''),
      )
    } else {
      typedBad += 1
      console.log(`  ✗ ⛔⛔ 加成打「${one.type || '（空）'}」⇒ 報價價錢「${r.price}」`)
      console.log(`      ⚠️ ${one.why}`)
      if (!one.wantMoney && showsMoney)
        console.log('      ⛔⛔ 呢個數會報俾客人 —— 而佢係我哋幫佢答咗一個佢冇答過嘅問題。')
    }
    /* ⭐ 順手守住：人打咗嘅嘢⛔ 唔准俾人食咗（`NaN` 死循環嗰條）。 */
    if (one.type && r.typedStill !== one.type) {
      typedBad += 1
      console.log(`  ✗ ⛔⛔ 人打嘅「${one.type}」變咗「${r.typedStill}」`)
    }
  }

  /* ── ⭐ 撳唔到嗰粒，睇落真係**暗過**撳得嗰粒嗎？ ───────────────

     ⛔⛔ **點解要「暗過」，⛔ 唔係「唔同」—— 唔准淨係記住結論**

     2026-09-17 第一版呢把尺淨係問「兩隻色同唔同」。
     ⚠️ 咁樣**一個將 disabled 改到更光、更醒目嘅改動會照樣全綠** ——
     而嗰種掣**同樣令人分唔出邊粒撳得**，甚至更差（最搶眼嗰粒就係撳唔到嗰粒）。

     ⭐ 同「擋得太少／擋得太多」（`mustLock` ↔ `canStillPick`）係同一個道理：
     **一把冇方向嘅尺，兩邊都守唔到。**

     ⇒ 所以要量**對比度**，⛔ 唔係量「色碼一唔一樣」：
       ① 撳唔到嗰粒嘅字**對比度要低過**撳得嗰粒；
       ② 而且要**低得夠明顯** —— 見下面 `MIN_DIM` 點解係 1.3。

     ⚠️ 量對比度要**同真係畫出嚟嗰隻底色**比，⛔ 唔係同 `background-color` 比：
       · 粒掣自己可能係 `transparent`，要一路行上去揾第一個唔透明嘅祖先；
       · 字色可以係 `rgba(…, 0.38)`（我哋而家就係），**要先疊落底色**先算得準。
       ⛔ 唔疊 alpha 就會當咗 `rgba(241,235,221,0.38)` 係全白 —— 差成三倍。 */

  /* ⭐ 1.3 唔係由而家份 code 度度返嚟嘅 —— ⛔ 唔准為咗就 code 而改佢。
     佢係一個**睇得出**嘅門檻：WCAG 由「大字合格」(3:1) 去到「正常字合格」(4.5:1)
     就係 1.5 倍，而現場係戴住手套、太陽底下、螢幕有手指印 ——
     所以要求至少 1.3 倍，已經係就住咗嘅下限，⛔ 唔係嚴。 */
  const MIN_DIM = 1.3
  for (const one of spec.disabledLooksDisabled ?? []) {
    lockChecked += 1
    const r = await real.evaluate((scope) => {
      const parse = (css) => {
        const m = String(css).match(/[\d.]+/g)
        if (!m) return null
        return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 }
      }
      /* 一路行上去，揾第一個真係畫到嘢出嚟嘅底色。 */
      const paintedBg = (el) => {
        let node = el
        while (node) {
          const c = parse(getComputedStyle(node).backgroundColor)
          if (c && c.a === 1) return c
          node = node.parentElement
        }
        return { r: 255, g: 255, b: 255, a: 1 }
      }
      const over = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      })
      const lum = (c) => {
        const f = (v) => {
          const x = v / 255
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
      }
      const ratio = (el) => {
        const bg = paintedBg(el)
        const own = parse(getComputedStyle(el).backgroundColor)
        const seat = own && own.a > 0 ? over(own, bg) : bg
        const ink = over(parse(getComputedStyle(el).color), seat)
        const a = lum(ink)
        const b = lum(seat)
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      }
      const all = [...document.querySelectorAll(`${scope} button`)]
      const off = all.find((b) => b.disabled)
      const on = all.find((b) => !b.disabled)
      if (!off || !on) return null
      return {
        offText: (off.textContent ?? '').trim().slice(0, 12),
        onText: (on.textContent ?? '').trim().slice(0, 12),
        offColor: getComputedStyle(off).color,
        onColor: getComputedStyle(on).color,
        offRatio: Math.round(ratio(off) * 100) / 100,
        onRatio: Math.round(ratio(on) * 100) / 100,
      }
    }, one.scope)
    if (r === null) {
      lockBad += 1
      console.log(`  ✗ [${one.scope}] 揾唔到「一粒 disabled ＋ 一粒唔係」—— ⛔ 量唔到就當唔合格`)
    } else if (r.offColor === r.onColor) {
      lockBad += 1
      console.log(`  ✗ ⛔⛔ [${one.scope}] 「${r.offText}」撳唔到，但個色同撳得嗰粒一樣（${r.offColor}）`)
      console.log('      ⚠️ 一粒撳唔到嘅掣睇落同撳得嘅一樣 ⇒ 人會一路撳一路以為個 app 壞咗。')
    } else if (r.offRatio >= r.onRatio) {
      lockBad += 1
      console.log(
        `  ✗ ⛔⛔ [${one.scope}] 「${r.offText}」撳唔到，但佢**搶眼過**撳得嗰粒` +
          `（對比度 ${r.offRatio} vs 「${r.onText}」${r.onRatio}）`,
      )
      console.log('      ⚠️ 最搶眼嗰粒就係撳唔到嗰粒 ⇒ 人一定會先撳佢。')
    } else if (r.onRatio / r.offRatio < MIN_DIM) {
      lockBad += 1
      console.log(
        `  ✗ ⛔⛔ [${one.scope}] 「${r.offText}」暗過「${r.onText}」，但⛔ 唔夠明顯` +
          `（對比度 ${r.offRatio} vs ${r.onRatio}，得 ${Math.round((r.onRatio / r.offRatio) * 100) / 100} 倍，要 ${MIN_DIM} 倍）`,
      )
      console.log('      ⚠️ 戴住手套、太陽底下，差咁少睇唔出。')
    } else {
      console.log(
        `  ✓ [${one.scope}] 「${r.offText}」撳唔到，而且暗過「${r.onText}」` +
          `（對比度 ${r.offRatio} vs ${r.onRatio}，暗咗 ${Math.round((r.onRatio / r.offRatio) * 100) / 100} 倍）`,
      )
    }
  }

  /* ── ⭐ 睇落撳得嘅，一定要真係撳得 ──────────────────────────

     ⛔⛔ **同上面嗰把係一對，⛔ 唔可以淨係要一半。**

     ⚠️ 頂部三格（狀態／樹木／地區）**唔係掣**，佢哋淨係顯示。
        ⇒ 佢哋**⛔ 唔可以睇落似掣** —— 一格睇落撳得而撳落去冇反應，
          就係 Jason 2026-09-17 嗰句「我撳狀態冇反應」嘅另一半。

     ⭐ 而家個排法解決咗第一半（真掣搬咗上嚟、一開就見到）；
        呢把尺守住第二半（⛔ 唔准留一格扮掣）。

     量三樣：⛔ 唔係 `<button>`、⛔ 冇 `role="button"`／`tabindex`、
            ⛔ 個 `cursor` ⛔ 唔係 `pointer`。 */
  for (const one of spec.notFakeButton ?? []) {
    fakeChecked += 1
    const r = await real.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        tabindex: el.getAttribute('tabindex'),
        cursor: cs.cursor,
        text: (el.textContent ?? '').trim().slice(0, 14),
      }
    }, one.sel)
    if (r === null) {
      fakeBad += 1
      console.log(`  ✗ [${one.sel}] 揾唔到 —— ⛔ 量唔到就當唔合格`)
      continue
    }
    const why = []
    if (r.tag === 'button' || r.tag === 'a') why.push(`佢係 <${r.tag}>`)
    if (r.role === 'button' || r.role === 'link') why.push(`role="${r.role}"`)
    if (r.tabindex !== null) why.push(`tabindex="${r.tabindex}"`)
    if (r.cursor === 'pointer') why.push('cursor: pointer')
    if (why.length) {
      fakeBad += 1
      console.log(`  ✗ ⛔⛔ [${one.sel}]「${r.text}」睇落撳得（${why.join('、')}），但佢⛔ 唔會做嘢`)
      console.log(`      ⚠️ ${one.why}`)
    } else {
      console.log(`  ✓ [${one.sel}]「${r.text}」⛔ 唔係掣，亦都⛔ 唔扮掣（<${r.tag}>, cursor ${r.cursor}）`)
    }
  }

  /* ── ⭐ 呢個仲剔得返轉頭嗎？ ───────────────────────────────────

     ⛔⛔ **同上面「數唔到就鎖住」係一對，⛔ 唔可以淨係要一半。**
     ⚠️ 一把只量「擋唔擋到」嘅尺，喺一個**乜都擋晒**嘅 code 上面會**全綠** ——
        而嗰種 code 會令人**卡死喺一個佢改唔到嘅狀態**。
     ⭐ 所以每擋一樣，就要有一項講明「呢樣⛔ 唔准擋」。 */
  for (const one of spec.canStillPick ?? []) {
    lockChecked += 1
    const r = await real.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) return null
      return { disabled: el.disabled === true }
    }, one.testid)
    if (r === null) {
      lockBad += 1
      console.log(`  ✗ [${one.testid}] 揾唔到 —— ⛔ 量唔到就當唔合格`)
    } else if (r.disabled) {
      lockBad += 1
      console.log(`  ✗ ⛔⛔ [${one.testid}] 剔唔到 —— 但 ${one.why}`)
    } else {
      console.log(`  ✓ [${one.testid}] 仲剔得（${one.why}）`)
    }
  }

  /* ── 數唔到就鎖住？ ────────────────────────────────────────────
     ⛔⛔ 兩樣一齊要，⛔ 唔可以淨係一樣：
       ① 粒危險掣真係 `disabled`（⛔ 唔係「睇落灰灰哋」）
       ② 同時有一句中文講返點解（⛔ 唔准靜靜咁鎖住，人會以為個 app 壞咗） */
  for (const one of spec.mustLock ?? []) {
    lockChecked += 1
    const r = await real.evaluate(([a, b]) => {
      const btn = document.querySelector(`[data-testid="${a}"]`)
      const why = document.querySelector(`[data-testid="${b}"]`)
      return {
        found: btn !== null,
        disabled: btn !== null && btn.disabled === true,
        why: why === null ? null : (why.textContent ?? '').trim().slice(0, 24),
      }
    }, [one.testid, one.needs])
    if (r.found && r.disabled && r.why !== null) {
      console.log(`  ✓ 數唔到 ⇒ [${one.testid}] 鎖住咗，而且有講原因（「${r.why}…」）`)
    } else {
      lockBad += 1
      console.log(`  ✗ ⛔⛔ 數唔到，但 [${one.testid}] ${r.disabled ? '鎖咗' : '仲撳得落'}`)
      if (!r.disabled)
        console.log('      ⛔ 我哋自己都唔知會冇幾多嘢，粒掣⛔ 唔可以撳得落。')
      if (r.why === null) console.log(`      ⛔ 冇 [${one.needs}] —— 靜靜咁鎖住，人會以為個 app 壞咗。`)
    }
  }

  // ── 睇得到？（⛔ 一定要行喺 hit 掃描之前 —— 嗰個會逐粒掣 scrollIntoView）──
  for (const one of spec.inView ?? []) {
    seenChecked += 1
    const r = await real.evaluate(([a, b]) => {
      const el = document.querySelector(`[data-testid="${a}"]`)
      const box = document.querySelector(`[data-testid="${b}"]`)
      if (!el || !box) return null
      const e = el.getBoundingClientRect()
      const g = box.getBoundingClientRect()
      return { top: Math.round(e.top), bottom: Math.round(e.bottom), gTop: Math.round(g.top), gBottom: Math.round(g.bottom) }
    }, [one.what, one.inside])
    if (r === null) {
      seenBad += 1
      console.log(`  ✗ [${one.what}] 根本冇出（或者 [${one.inside}] 揾唔到）`)
    } else if (r.top >= r.gTop - 1 && r.bottom <= r.gBottom + 1) {
      console.log(`  ✓ [${one.what}] 喺 [${one.inside}] 睇得到（${r.top}–${r.bottom} 喺 ${r.gTop}–${r.gBottom} 入面）`)
    } else {
      seenBad += 1
      console.log(`  ✗ [${one.what}] 出咗喺 [${one.inside}] 睇得到嘅範圍以外`)
      console.log(`      訊息 ${r.top}–${r.bottom}，個框 ${r.gTop}–${r.gBottom} ⇒ ⛔ 撳完睇唔到，即係「撳咗冇反應」。`)
    }
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
console.log(`真滑鼠拖：試咗 ${dragChecked} 下，推唔郁 ${dragBad} 下。`)
console.log(`訊息睇得到：量咗 ${seenChecked} 句，睇唔到 ${seenBad} 句。`)
console.log(`數唔到就鎖住：量咗 ${lockChecked} 粒掣，冇鎖 ${lockBad} 粒。`)
console.log(`兩件嘢冇疊埋：量咗 ${overlapChecked} 對，疊咗 ${overlapBad} 對。`)
console.log(`粒掣夠大撳：量咗 ${sizeChecked} 粒，唔夠 ${sizeBad} 粒。`)
console.log(`撳完⛔ 唔變藍 ＋ 鍵盤仲睇得到：量咗 ${blueChecked} 項，唔啱 ${blueBad} 項。`)
console.log(`打完字存唔到要出聲：量咗 ${typedChecked} 格，冇聲 ${typedBad} 格。`)
console.log(`撳完做唔到要出聲：量咗 ${tapChecked} 粒掣，冇聲 ${tapBad} 粒。`)
console.log(`⛔ 冇得撳走：量咗 ${escapeChecked} 件，走得甩 ${escapeBad} 件。`)
console.log(`中心點撳到自己：量咗 ${centreChecked} 粒掣，中心撳唔到 ${centreBad} 粒。`)
console.log(`一開就見到（⛔ 唔准碌）：量咗 ${firstChecked} 件，褪咗 ${firstBad} 件。`)
console.log(`睇落撳得就要真撳得：量咗 ${fakeChecked} 格，扮掣 ${fakeBad} 格。`)
console.log(
  `拍攝掣離 nav 幾遠：量咗 ${clearChecked} 個高度，跌穿下限 ${clearBad} 個。`,
)

/*
 * ── ⭐⭐ 每組至少要量到幾多（⛔ 「量咗 0」⛔ 唔係合格）─────────────
 *
 * ⛔⛔ **點解要呢一段 —— ⛔ 唔准淨係記住結論**
 *
 * 2026-09-18：改 `firstSight` 嗰陣，一個切錯範圍嘅 edit **刪咗 640 行** ——
 * 即係把尺自己俾人剷走咗一大截，剩返個殼。
 *
 * ⚠️⚠️ 而個 run **⛔ 冇 throw、exit code 係 0**，佢淨係靜靜咁報：
 *     量咗 0 項 ／ 中心點撳到自己：量咗 0 粒 ／ ⛔ 冇得撳走：量咗 0 件
 *
 * ⇒ **「量咗 0 項」同「量咗 N 項全部過」喺 exit code 度一模一樣。**
 *
 * ⭐ 呢個同 `mustLock` ↔ `canStillPick`、同書面語尺嗰條「⛔ 唔准掃空」
 *   係**同一條規矩**：一把淨係識「數少咗就好」嘅尺，⛔ 守唔住「刪走咗」。
 *   ⚠️ 只不過今次俾人刪走嘅係**把尺本身**。
 *
 * ⇒ 所以每組寫低一個**下限**。少過個下限 ⇒ 紅，而且句錯要講清楚
 *   **⛔ 唔係「唔合格」，係根本冇量過**。
 *
 * ⛔ 呢啲數淨係可以**加**，⛔ 唔准因為一個 run 跌咗就調低 ——
 *   跌咗就係出咗事。（加尺、加畫面 ⇒ 順手加返個數上去。）
 */
const FLOORS = [
  ['90 項對數', checked, 90],
  ['撳得到嘅檢查', hitChecked, 294],
  ['彈窗掣位', sameSpot + sameSpotBad, 2],
  ['真滑鼠拖', dragChecked, 1],
  ['訊息睇得到', seenChecked, 1],
  ['數唔到就鎖住', lockChecked, 7],
  ['兩件嘢冇疊埋', overlapChecked, 2],
  ['粒掣夠大撳', sizeChecked, 2],
  ['撳完⛔ 唔變藍', blueChecked, 4],
  ['打完字存唔到要出聲', typedChecked, 5],
  ['撳完做唔到要出聲', tapChecked, 1],
  ['⛔ 冇得撳走', escapeChecked, 2],
  ['中心點撳到自己', centreChecked, 9],
  ['一開就見到', firstChecked, 8],
  ['睇落撳得就要真撳得', fakeChecked, 3],
  ['拍攝掣離 nav 幾遠', clearChecked, 2],
]

let floorBad = 0
console.log('\n══ 每組至少要量到幾多（⛔ 「量咗 0」⛔ 唔係合格）══')
for (const [label, got, min] of FLOORS) {
  if (got >= min) {
    console.log(`  ✓ ${label}：量咗 ${got}（至少 ${min}）`)
  } else {
    floorBad += 1
    console.log(`  ✗ ⛔⛔ ${label}：量咗 ${got}，至少要 ${min}`)
    console.log('      ⚠️ ⛔ 呢個唔係「唔合格」—— 係**根本冇量過**。')
    console.log('      ⛔ 有嘢令把尺行唔到：可能一個 spec 冇咗、一個畫面爆咗、')
    console.log('         或者一個 edit 切錯範圍剷走咗 code（2026-09-18 就係咁）。')
  }
}
if (floorBad === 0) console.log(`  ⇒ ${FLOORS.length} 組全部有真係量過。`)


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

process.exit(
  bad === 0 &&
    hitBad === 0 &&
    sameSpotBad === 0 &&
    dragBad === 0 &&
    seenBad === 0 &&
    lockBad === 0 &&
    overlapBad === 0 &&
    sizeBad === 0 &&
    blueBad === 0 &&
    escapeBad === 0 &&
    typedBad === 0 &&
    tapBad === 0 &&
    centreBad === 0 &&
    firstBad === 0 &&
    fakeBad === 0 &&
    clearBad === 0 &&
    floorBad === 0
    ? 0
    : 1,
)
