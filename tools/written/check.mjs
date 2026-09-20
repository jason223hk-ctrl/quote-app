/*
 * 跑法：`npm run written`（已經入咗 `npm run gate`）。
 *
 * ⛔⛔ 呢個檔淨係「行過所有檔、對數、報數」。真正嘅判斷喺 `scan.mjs`。
 *
 * ── 點解要 `baseline.json`，⛔ 唔係「見到廣東話就紅」 ────────────
 *
 * 因為改書面語**唔會一日做完**（worker 嗰邊要 Jason 自己 `wrangler deploy`）。
 * ⚠️ 中間嗰段時間如果把尺一路紅，佢就會變成一個人人 skip 嘅警告 —— 等於冇。
 *
 * ⭐ 所以佢對嘅係**一份寫死嘅名單**：
 *   · 名單有、code 都有  ⇒ 未改，OK
 *   · code 有、名單冇    ⇒ ⛔ 紅（有人補咗句新廣東話入去）
 *   · 名單有、code 冇    ⇒ ⛔ 紅（改好咗但冇喺名單剷走 —— 逼個改動喺 diff 度見得到）
 *
 * ⇒ 即係話「改一句」= 改 code ＋ 剷名單一行，兩樣都會出現喺 PR diff。
 *   ⛔ 冇得靜靜咁改、亦都⛔ 冇得靜靜咁加返。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanFile, userText } from './scan.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIRS = ['src', 'worker/src']

/*
 * ⭐⭐ **第二樣要數嘅嘢 —— ⛔ 唔准淨係數「仲剩幾句」**
 *
 * ⚠️⚠️ 冇咗呢段，一個「將呢幾句安全訊息刪晒」嘅改動會令上面個數
 *      由 187 跌到 0，跟住**全綠** —— 而嗰個改動係全部改動之中最差嗰個。
 *
 * ⇒ 所以每一句「⛔ 唔准弱化」嘅，喺呢度寫明**一定要仲喺度**。
 * ⚠️ 改書面語嗰陣呢度嘅字**要跟住改**，⛔ 但唔准剷走成行 ——
 *    剷走成行同刪咗句嘢喺 diff 度睇落一模一樣，而後果差好遠。
 */
export const REQUIRED = [
  {
    file: 'src/lib/records.ts',
    /* ⚠️ 2026-09-19 書面語（A）：由「⛔ 唔係你做錯嘢」改成呢句。⛔ 改語體，⛔ 唔改意思。 */
    must: '⛔ 不是你操作錯誤',
    why: '權限設定出錯嗰陣，要同現場同事講明⛔ 唔好怪自己、⛔ 唔好一路再試（CLAUDE.md §2.7）',
  },
  {
    file: 'src/lib/sync.ts',
    /* ⚠️ 2026-09-19 書面語（A）：同上，Drive 登入唔到嗰條路。 */
    must: '不是你操作錯誤',
    why: '同上，Drive 登入唔到嗰條路',
  },
  {
    file: 'worker/src/driveError.mjs',
    /* ⚠️ 2026-09-19 書面語（C）：由「⛔ 我唔會估佢係乜」改成呢句。
       ⛔ 改嘅係語體，⛔ 唔係意思 —— 「⛔ 唔准估」照樣講得死死實。
       ⭐ 呢一行就係把尺捉返出嚟嘅：改完 worker 個字串，佢即刻報
         「揾唔到『⛔ 我唔會估佢係乜』」，逼住喺同一條 diff 度改埋。 */
    must: '⛔ 系統不會猜測它的意思',
    why: '⛔ 唔識嘅 error ⛔ 唔准估 —— 估錯一個原因，人會照住個錯解釋去修（§2.7）',
  },
  {
    file: 'src/lib/records.ts',
    /* ⚠️ 2026-09-19 書面語（A）。 */
    must: '此單已經鎖定',
    why: '三句拒絕原因之一：鎖定。⚠️ RLS 拒絕⛔ 唔會 throw，只會 0 行 ⇒ 冇呢句人就唔知發生咗乜',
  },
  {
    file: 'src/lib/records.ts',
    /* ⚠️ 2026-09-19 書面語（A）。 */
    must: '此單不是你建立的',
    why: '三句拒絕原因之二：唔係自己開嗰單',
  },
  {
    file: 'src/lib/records.ts',
    /* ⚠️ 2026-09-19 書面語（A）。 */
    must: '伺服器不允許修改此單',
    why: '三句拒絕原因之三：兩邊唔夾（部機話得、伺服器話唔得）',
  },
]

/** 一句嘅身分 ＝ 邊個檔 ＋ 原文。⭐ 同一句喺兩個檔，係兩件事。 */
/*
 * ⛔⛔ **書面語，但特登⛔ 唔准用嘅詞。**
 *
 * ⚠️ 同 `BANNED` 兩件事：`BANNED` 攔廣東話，呢度攔**一個拍咗板嘅決定**。
 *
 * ⭐ 2026-09-19：「校驗失敗」本來係書面語對照表右欄嗰個，
 *   但 CO 捉到同一條流程入面 `photos.ts` 用「校驗失敗」、
 *   `photoUpload.ts` 用「未核對相符」——**同一個人先後見到兩句，
 *   讀落似係兩件事**。Jason 拍板統一用「核對」。
 *
 * ⛔ 冇呢把尺，下一個人照樣會寫返「校驗」，而⛔ 冇嘢會紅。
 *
 * ⛔⛔⛔ **佢一定要睇 `userText()`，⛔ 唔可以睇 `found`。**
 *
 * ⚠️⚠️ 2026-09-20 CO 讀 code 捉到：第一版用 `found`，
 *    而 `found` 係由 `scanFile()` 砌 —— 佢最後一行係
 *    `.filter((o) => o.words.length > 0)`，**即係淨係「仲帶住廣東話」嗰批**。
 *
 * ⭐⭐ 而「校驗」**依定義只會出現喺已經轉完書面語嗰啲句度** ——
 *    嗰啲句冇廣東話 ⇒ ⛔ 入唔到 `found` ⇒ 把尺印「✓ 冇出現過」。
 *    **即係話佢守嗰個情況，就係佢唯一睇唔到嗰個情況。**
 *
 * ⚠️ 我當時「反證跑過」—— 但我插「校驗」入咗一句**仲帶住廣東話**嘅句，
 *    嗰句當然入到 `found`，當然紅。⛔ **個反證由頭到尾冇碰過真個案。**
 *
 * ⭐ 同「一把只識數少咗就好嘅尺，⛔ 守唔住刪走咗」同一個形狀：
 *   **一把只睇得到「未改嘅句」嘅尺，⛔ 守唔住「改咗之後出嘅問題」。**
 *
 * ⚠️ 而且佢會越嚟越綠：（B）轉埋剩低嗰批之後，`found` 會近乎清空。
 */
const FORBIDDEN = [
  { word: '校驗', use: '核對', why: 'Jason 2026-09-19 拍板統一用「核對」——「對數」係呢個 repo 自己嘅語言' },
]

const keyOf = (file, text) => JSON.stringify([file, text])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name)) out.push(p)
  }
  return out
}

const baseline = JSON.parse(readFileSync(path.join(ROOT, 'tools/written/baseline.json'), 'utf8'))
const known = new Set(baseline.map((b) => keyOf(b.file, b.text)))

const found = new Map()
for (const dir of DIRS) {
  for (const abs of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, abs)
    for (const hit of scanFile(readFileSync(abs, 'utf8'))) {
      const key = keyOf(rel, hit.text)
      if (!found.has(key)) found.set(key, { ...hit, file: rel })
    }
  }
}

const isNew = [...found.keys()].filter((k) => !known.has(k))
const gone = [...known].filter((k) => !found.has(k))
const short = (t) => t.replace(/\n/g, '⏎').slice(0, 46)

let bad = 0
console.log('\n══ 書面語：仲剩幾句廣東話 ══')
console.log(`  名單寫住 ${known.size} 句，而家真係揾到 ${found.size} 句。`)

if (isNew.length) {
  bad += isNew.length
  console.log(`\n  ✗ ⛔⛔ 有 ${isNew.length} 句廣東話⛔ 唔喺名單入面 —— 即係新加入去嘅：`)
  for (const k of isNew) {
    const h = found.get(k)
    console.log(`      ${h.file}:${h.line}  「${short(h.text)}」`)
    console.log(`         撞到：${h.words.join('、')}`)
    /* ⛔⛔ 一段中招，就報成個節點 —— ⚠️ 逼人讀成句，⛔ 唔係讀一半。
       （2026-09-20：`TreesScreen` 嗰句前半轉咗後半冇轉，兩段都綠。） */
    if (h.node && h.node !== h.text) console.log(`         成句：「${short(h.node)}」`)
  }
  console.log('      ⚠️ 現場同事睇嘅字要書面語。⛔ 唔好喺呢度補返口語。')
}

if (gone.length) {
  bad += gone.length
  console.log(`\n  ✗ ⛔ 有 ${gone.length} 句名單有、但 code 度已經冇 —— 改好咗就要喺名單一齊剷：`)
  for (const k of gone) {
    const [f, t] = JSON.parse(k)
    console.log(`      ${f}  「${short(t)}」`)
  }
  console.log('      ⚠️ 逼你剷，係為咗令「改咗邊幾句」喺 PR diff 度睇得到。')
}

/*
 * ⛔ 所有**用家睇得到嘅字**，⛔ 唔理佢仲有冇廣東話。
 * ⚠️ 同 `found` 兩件事 —— 見上面 `FORBIDDEN` 個註解。
 */
const everyUserLine = []
for (const dir of DIRS) {
  for (const abs of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, abs)
    for (const t of userText(readFileSync(abs, 'utf8'))) everyUserLine.push({ ...t, file: rel })
  }
}

/*
 * ⛔⛔ 呢把尺自己都要有個下限 —— ⭐ 同 `ui:check` 嗰個 `FLOORS` 同一條規矩。
 * ⚠️ 冇咗佢，`userText()` 有日靜靜咁抽少咗，下面就會印「✓ 冇出現過」
 *    而其實**佢乜都冇掃過**。
 * ⭐ 651 係 2026-09-20 **修完 JSX 插值之後**實測。⛔ 呢個數**淨係可以加**。
 *
 * ⚠️⚠️ 本來寫住 625（修之前嗰個數）—— CO 捉到：
 *    今日最大嗰個修正就係 JSX 插值（625 → 651）。
 *    **下限留住 625 ⇒ 將來有人把 `NODE` 條 regex 改返舊樣，
 *    抽到嘅句數跌返 625，而個下限照樣過** ⇒ 今日個窿靜靜咁返嚟，⛔ 冇嘢會紅。
 *
 * ⭐ 同「拆開 `tapChecked`」同一條規矩：**下限只准加。**
 *   ⛔ 唔准因為一個 run 跌咗就調低 —— ⚠️ 而**數目升咗而下限冇跟上，
 *   係同一個毛病嘅另一面**。
 */
const USER_LINE_FLOOR = 651

console.log('\n══ ⛔ 拍咗板⛔ 唔准用嘅詞 ══')
console.log(`  （掃緊 ${everyUserLine.length} 句用家睇得到嘅字，⛔ 唔係淨係未改嗰批）`)
if (everyUserLine.length < USER_LINE_FLOOR) {
  bad += 1
  console.log(`  ✗ ⛔⛔ 只掃到 ${everyUserLine.length} 句，至少要 ${USER_LINE_FLOOR}`)
  console.log('      ⚠️ ⛔ 唔係「冇問題」—— 係把尺根本冇掃到嘢。')
}
for (const one of FORBIDDEN) {
  const hits = everyUserLine.filter((h) => h.text.includes(one.word))
  if (hits.length === 0) {
    console.log(`  ✓ 「${one.word}」冇出現過（要用「${one.use}」）`)
  } else {
    bad += hits.length
    console.log(`  ✗ ⛔⛔ 「${one.word}」出現咗 ${hits.length} 次 —— 要用「${one.use}」`)
    for (const h of hits) console.log(`      ${h.file}:${h.line}  「${short(h.text)}」`)
    console.log(`      ⚠️ ${one.why}`)
  }
}

console.log('\n══ ⛔ 唔准掃空：呢幾句安全訊息一定要仲喺度 ══')
for (const one of REQUIRED) {
  /*
   * ⛔⛔ 只查**用家睇得到嘅字**，⛔ 唔查成個檔。
   *
   * ⚠️ 2026-09-19 捉到：「伺服器唔俾改呢一單」呢句喺畫面已經改晒，
   *    但佢**仲喺一段註解入面出現**（records.ts:273 講緊「點解要呢句」）——
   *    ⇒ 舊版用 `src.includes()` 就**照樣 ✓**，而現場其實已經冇咗嗰句。
   *
   * ⭐ 即係話把尺當時守緊嘅係「有冇人提過呢句」，
   *   ⛔ 唔係「現場同事仲睇唔睇得到呢句」。差好遠。
   */
  const seen = userText(readFileSync(path.join(ROOT, one.file), 'utf8'))
  if (seen.some((t) => t.text.includes(one.must))) {
    console.log(`  ✓ ${one.file}：「${one.must}」`)
  } else {
    bad += 1
    console.log(`  ✗ ⛔⛔ ${one.file}：揾唔到「${one.must}」`)
    console.log(`      ⚠️ ${one.why}`)
    console.log('      ⛔ 改文字要連呢度一齊改；⛔ 但唔准剷走成行。')
  }
}

console.log(
  `\n書面語：名單 ${known.size} 句，未入名單 ${isNew.length} 句，名單剩低 ${gone.length} 句，` +
    `必須仲喺度嘅 ${REQUIRED.length} 句全部揾到${bad === 0 ? '' : '（上面有唔到嘅）'}。`,
)
if (bad > 0) {
  console.log('⛔ 書面語尺唔過。')
  process.exit(1)
}
console.log('✓ 書面語尺全綠。')
