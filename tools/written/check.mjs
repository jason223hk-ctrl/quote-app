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
import { scanFile } from './scan.mjs'

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
    must: '⛔ 唔係你做錯嘢',
    why: '權限設定出錯嗰陣，要同現場同事講明⛔ 唔好怪自己、⛔ 唔好一路再試（CLAUDE.md §2.7）',
  },
  {
    file: 'src/lib/sync.ts',
    must: '唔係你做錯嘢',
    why: '同上，Drive 登入唔到嗰條路',
  },
  {
    file: 'worker/src/driveError.mjs',
    must: '⛔ 我唔會估佢係乜',
    why: '⛔ 唔識嘅 error ⛔ 唔准估 —— 估錯一個原因，人會照住個錯解釋去修（§2.7）',
  },
  {
    file: 'src/lib/records.ts',
    must: '呢一單已經鎖定咗',
    why: '三句拒絕原因之一：鎖定。⚠️ RLS 拒絕⛔ 唔會 throw，只會 0 行 ⇒ 冇呢句人就唔知發生咗乜',
  },
  {
    file: 'src/lib/records.ts',
    must: '呢一單唔係你開嘅',
    why: '三句拒絕原因之二：唔係自己開嗰單',
  },
  {
    file: 'src/lib/records.ts',
    must: '伺服器唔俾改呢一單',
    why: '三句拒絕原因之三：兩邊唔夾（部機話得、伺服器話唔得）',
  },
]

/** 一句嘅身分 ＝ 邊個檔 ＋ 原文。⭐ 同一句喺兩個檔，係兩件事。 */
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

console.log('\n══ ⛔ 唔准掃空：呢幾句安全訊息一定要仲喺度 ══')
for (const one of REQUIRED) {
  const src = readFileSync(path.join(ROOT, one.file), 'utf8')
  if (src.includes(one.must)) {
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
