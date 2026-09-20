/*
 * 書面語尺 —— 量「用家睇得到嘅中文，仲剩幾句廣東話」。
 *
 * ⛔⛔ **點解要一把尺 —— ⛔ 唔准淨係記住結論**
 *
 * 2026-09-17 量過一次（`docs/書面語-對照表.md`）：
 * 用家睇得到嘅中文字串去重 466 句，帶廣東話嘅 164 句。
 * ⚠️ 而嗰 164 句入面，**得 10 句有 unit test 釘住、1 句有 ui:check 釘住,
 *    154 句兩樣都冇**。
 *
 * ⇒ 即係話改書面語嘅風險 ⛔ **唔係「測試會紅」，係「測試唔會紅」** ——
 *   改錯咗、改漏咗、甚至將來有人補一句「搵 Jason」返去，gate 照樣全綠。
 *   ⭐ 所以要一把**數得出**嘅尺，⛔ 唔係靠人 review 記得。
 *
 * ── 呢把尺量兩樣，⛔ 缺一不可 ──────────────────────────────
 *
 *   ① **仲剩幾句廣東話** —— 同 `baseline.json` 逐句對。
 *      ⛔ 唔係「少過 N 句就算」：係**逐句對得返**。
 *      · 有新嘅廣東話出現（唔喺 baseline 入面）⇒ 紅
 *      · 改好咗一句但冇喺 baseline 剷走 ⇒ 紅（逼個改動喺 diff 度見得到）
 *
 *   ② **⛔ 唔准掃空** —— `REQUIRED` 嗰幾句安全訊息一定要仲喺度。
 *      ⚠️⚠️ **點解要呢樣**：冇咗②，一個「將嗰幾句刪晒」嘅改動
 *      會令①由 164 跌到 0，然後**全綠**。
 *      ⭐ 同「擋得太少／擋得太多」係同一個道理：
 *        一把淨係識「數少咗就好」嘅尺，⛔ 守唔住「刪走咗」。
 */


/*
 * 一個 `/` 係除號定係 regex 開頭？睇返前面最後一個唔係空白嘅字。
 * ⛔ 呢個係**啱夠用**嘅判斷，⛔ 唔係一個完整 JS parser ——
 *   但佢守住咗真正會出事嗰個形狀（`.replace(/…/g, '_')`）。
 */
function isRegexStart(before) {
  const t = before.replace(/\s+$/, '')
  if (t === '') return true
  const last = t[t.length - 1]
  if ('([{,;:=!&|?+-*%~^<>'.includes(last)) return true
  return /\b(return|typeof|case|in|of|new|delete|void|do|else)$/.test(t)
}

/** ⛔ 註解⛔ 唔喺範圍 —— 開發者睇嘅，同 `CLAUDE.md` 一樣照留廣東話。 */
export function stripComments(src) {
  const clean0 = src
  let out = ''
  let i = 0
  const n = src.length
  const blank = (s) => s.replace(/[^\n]/g, ' ')
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i)
      out += blank(src.slice(i, e < 0 ? n : e))
      i = e < 0 ? n : e
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2)
      out += blank(src.slice(i, e < 0 ? n : e + 2))
      i = e < 0 ? n : e + 2
      continue
    }
    if (c === '{' && src[i + 1] === '/' && src[i + 2] === '*') {
      const e = src.indexOf('*/}', i)
      out += blank(src.slice(i, e < 0 ? n : e + 3))
      i = e < 0 ? n : e + 3
      continue
    }
    /* ⛔⛔ Regex 字面值要當佢唔存在 —— 唔係「順手」，係一個**捉返出嚟嘅錯**。
       2026-09-17 第一版掃描器冇處理佢，於是 `/[<>|\x00-\x1f]/g` 入面嗰個
       `'`（其實係後面 `'_'` 嗰個）被當成「字串開始」，
       ⚠️ 一路食到成段 code 落去，變成一句「假嘅用家文字」。
       ⇒ 咁樣會有兩種後果：報一句根本唔存在嘅廣東話，
         同埋**食咗後面真嘅字串**（漏報）。⛔ 兩種都唔可以接受。 */
    if (c === '/' && isRegexStart(out)) {
      let j = i + 1
      let inClass = false
      while (j < n) {
        if (clean0[j] === '\\') {
          j += 2
          continue
        }
        if (clean0[j] === '[') inClass = true
        else if (clean0[j] === ']') inClass = false
        else if (clean0[j] === '/' && !inClass) break
        else if (clean0[j] === '\n') break
        j++
      }
      out += blank(src.slice(i, Math.min(j + 1, n)))
      i = j + 1
      continue
    }
    /* 字串照抄（入面可能有 `//`，⛔ 唔可以當註解剷走）。 */
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      let j = i + 1
      while (j < n) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === q) break
        j++
      }
      out += src.slice(i, Math.min(j + 1, n))
      i = j + 1
      continue
    }
    out += c
    i++
  }
  return out
}

/*
 * ⛔⛔ **點解係「詞」⛔ 唔係「字」—— 唔准淨係記住結論**
 *
 * 2026-09-17 第二版掃描器用單字「返」，即刻把 `RecordFormPage` 嗰粒
 * **「返回」掣**當咗廣東話 —— ⚠️ 而「返回」本身就係書面語。
 *
 * ⇒ 所以凡係「喺書面語都揾得到」嘅字，一律只可以**成個詞**咁禁：
 *     · 返 → 返回、返還（正字）⇒ 只禁 返嚟／揀返／改返／…
 *     · 仲 → 仲裁（正字）      ⇒ 只禁 仲未／仲有／仲係／…
 *     · 耐 → 耐用、忍耐（正字）⇒ 只禁 太耐／等耐
 *     · 埋 → 埋設、埋單（正字）⇒ 只禁 收埋
 *     · 影 → 陰影、影響（正字）⇒ 只禁 影相／影多／影一次／…
 *     · 添 → 添加（正字）      ⇒ ⛔ 一律唔禁
 */

/*
 * ⛔⛔ **書面語入面真係有呢個字嘅詞** —— 對之前先剷走。
 *
 * ⭐ 2026-09-17 CO 審 `BANNED` 嗰陣帶出嘅問題：
 *   「喇」同「咪」係語氣詞（好喇／咪住），禁單字最乾淨；
 *   ⚠️ 但「喇叭」「咪高峰」係正正經經嘅書面語詞。
 *
 * ⇒ 與其因為一個詞就唔敢禁成隻字（結果全部「好喇」走甩），
 *   不如**寫明例外**。呢個做法比「淨係禁詞」捉得多，
 *   而且例外係**列得出、review 得到**嘅，⛔ 唔係一句「應該冇事」。
 */
const ALLOW = [
  '喇叭', '喇嘛', '咪錶', '咪高峰', '咪表',
  /* ⭐ 2026-09-20：禁咗「緊」同「呢」之後要放生嘅書面語詞。 */
  '緊急', '要緊', '緊記', '收緊', '緊張', '加緊', '抓緊', '緊密', '緊接', '緊貼', '緊守', '吃緊',
  '呢喃',
]

export const BANNED = [
  // ── 淨係喺廣東話出現嘅字，禁單字冇風險 ──
  '嘅', '咗', '喺', '唔', '冇', '啲', '咁', '嗰', '佢', '撳', '攞', '搵', '揾',
  '晒', '咩', '乜', '俾', '睇', '揀', '嘢', '郁', '哋', '嚟', '喎', '嘞', '囉', '黐',
  /* ⭐ 2026-09-17 CO 補：頭兩隻我自己寫嘢嗰陣都用緊。
     · 啱 —— 書面語根本冇呢隻字（現有 code 就有「數字唔啱」）
     · 諗 —— 諗清楚 ⇒ 書面語「想清楚」
     · 靚 / 咪 / 喇 —— 語氣詞同口語形容詞（例外見 ALLOW） */
  '啱', '諗', '靚', '咪', '喇',
  /* ⭐⭐ 2026-09-20 CO 捉到：呢兩隻字之前⛔ 冇禁，而佢哋係最常見嗰兩隻。
     · 緊 —— 進行式（上緊／清緊／改緊／存緊／刪緊／砌緊）。
       ⚠️ 書面語有「緊急」「要緊」「收緊」⇒ 放咗入 ALLOW，⛔ 唔係唔禁。
     · 呢 —— 指示詞（呢個／呢棵／呢一單）。書面語得「呢喃」一個詞，入咗 ALLOW。
     ⇒ ⭐ 照「喇／咪」同一個做法：**禁單字 ＋ 列明例外**，
       因為漏一個詞係靜靜哋漏，而誤報係當場叫。 */
  '緊', '呢',
  // ── 要成個詞先禁得（見上面） ──
  '返嚟', '返出', '揀返', '改返', '補返', '搵返', '查返', '開返', '記低', '留低',
  '仲未', '仲有', '仲係', '仲喺', '仲剩', '仲要',
  '太耐', '等耐', '收埋',
  '影相', '影多', '影一次', '影得', '影過', '影嗰',
  // ── 詞語 ──
  '幾多', '而家', '多過', '部機', '好返', '唔好', '點解', '點樣', '邊個', '邊一',
  '即係', '同埋', '一陣', '等陣', '大細', '行去', '開一開', '唔該', '慳', '爆咗',
  /* ⭐ 2026-09-17 CO 補（呢批一定要成個詞）。 */
  '幾時', '邊度', '梗係', '成日', '識得', '企喺', '鍾意',
  /* ⛔⛔ **特登冇「點算」** —— ⛔ 唔係漏咗。
     「點算」喺書面語係**盤點**嘅意思（點算存貨），而我哋自己譯出嚟嘅
     「正在點算這個工程有多少棵樹和相片」就係用緊佢。
     ⚠️ 禁咗佢，把尺就會告自己嘅定稿。
     口語嗰個「點算」（＝點做好）實會同時帶住第二個口語字，捉得返。 */
]

/** 抽「用家睇得到嘅中文」：字串字面值 ＋ JSX 文字節點。 */
export function userText(src) {
  const clean = stripComments(src)
  const han = /[一-鿿]/
  const out = []
  const push = (text, index) => {
    if (han.test(text)) out.push({ text, line: clean.slice(0, index).split('\n').length })
  }
  let i = 0
  const n = clean.length
  while (i < n) {
    const c = clean[i]
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      let j = i + 1
      let buf = ''
      while (j < n) {
        if (clean[j] === '\\') {
          buf += clean[j] + clean[j + 1]
          j += 2
          continue
        }
        if (clean[j] === q) break
        buf += clean[j]
        j++
      }
      push(buf, i)
      i = j + 1
      continue
    }
    i++
  }
  /*
   * ⛔⛔ **JSX 文字一帶插值，⛔ 唔可以成段丟埋。**
   *
   * ⚠️⚠️ 2026-09-20 CO 讀 code 捉到：舊版條 regex 排除咗 `{` 同 `}`
   *   ⇒ 一個 `<p>` 只要入面有一對大括號，**整段文字一個字都入唔到 `userText()`**。
   *
   *   真個案：`SyncScreen.tsx`
   *     238  <div …>仍在本裝置，未寫入資料庫</div>              ← 冇插值 ⇒ 掃到 ⇒ 轉咗
   *     241  <p …>呢 {stuck.length} 張相仲喺部機度，…</p>       ← 有插值 ⇒ 掃唔到 ⇒ 冇轉
   *   ⭐ **兩行嘅分別⛔ 唔係意思，係有冇一對大括號。**
   *
   * ⇒ 而家：成個文字節點照樣⛔ 唔准過 `<` `>`（免得食咗
   *   `{list.map(x => <li>…` 嗰類），但**容許簡單插值**，再**逐段拆開** ——
   *   `{…}` 做分隔，每一段獨立抽。
   *   ⭐ 咁樣抽出嚟嘅每一段**喺原始碼度都揾得返一模一樣**，
   *     所以 baseline 對數同取代照樣行得。
   */
  const NODE = />((?:[^<>'"`{}]|\{[^{}<>]*\})*)</g
  for (const m of clean.matchAll(NODE)) {
    let at = m.index + 1
    for (const piece of m[1].split(/\{[^{}<>]*\}/)) {
      const t = piece.trim()
      if (t && han.test(t)) push(t, at + piece.indexOf(t))
      at += piece.length
    }
  }
  return out
}

/** 一句入面撞到嘅廣東話詞。⛔ 先剷走 `ALLOW` 嗰啲書面語詞。 */
export function hitWords(text) {
  let t = String(text)
  for (const ok of ALLOW) t = t.split(ok).join('')
  return BANNED.filter((w) => t.includes(w))
}

/** 一個檔入面所有仲係廣東話嘅用家文字。 */
export function scanFile(src) {
  return userText(src)
    .map((o) => ({ ...o, words: hitWords(o.text) }))
    .filter((o) => o.words.length > 0)
}
