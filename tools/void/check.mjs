/*
 * 跑法：`npm run voids`（已經入咗 `npm run gate`）。判斷喺 `scan.mjs`。
 *
 * ⭐ 點解有 `baseline.json`，⛔ 唔係「見到就紅」：
 *   今日已經有幾十個 `void`，`docs/void-掃描-2026-09-19.md` 逐個分過類，
 *   ⚠️ 大部分係「內部有 catch，但⛔ 未驗佢真係出字」。
 *   ⛔ 一次過全部改晒會好大、好難覆核；⛔ 當佢哋「冇事」又係講大話。
 * ⇒ 名單逐個寫低，**每行帶住一句 `why`**（照實寫「未驗」就寫「未驗」）。
 *   新加嘅一個都入唔到，修好一個就要剷一行。
 *
 * ⛔⛔ 想加一行入名單 ＝ 喺 PR 度寫明點解呢條 promise 唔會 reject。
 *     證唔到就寫 `.catch`，⛔ 唔好加名單。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compare, scanVoids } from './scan.mjs'

// ⭐ `VOID_ROOT` 淨係俾 `scan.test.mjs` 個反證用（喺一個臨時資料夾度跑成把尺）。
const ROOT = process.env.VOID_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIRS = ['src', 'worker/src']

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name)) out.push(p)
  }
  return out
}

const found = []
for (const dir of DIRS) {
  if (!existsSync(path.join(ROOT, dir))) continue
  for (const abs of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    for (const hit of scanVoids(readFileSync(abs, 'utf8'), rel)) found.push({ ...hit, file: rel })
  }
}

const baseline = JSON.parse(readFileSync(path.join(ROOT, 'tools/void/baseline.json'), 'utf8'))
const missingWhy = baseline.filter((b) => typeof b.why !== 'string' || b.why.trim() === '')
const { added, stale } = compare(found, baseline)

console.log(`void 冇 catch：code 入面 ${found.length} 個，名單 ${baseline.reduce((n, b) => n + (b.count ?? 1), 0)} 個。`)

let bad = 0
for (const one of added) {
  bad += 1
  const where = found.filter((f) => f.file === one.key[0] && f.text === one.key[1]).map((f) => f.line)
  console.log(`  ✗ ⛔ 新嘅 \`void\` 冇 catch：${one.key[0]}:${where.join(',')}  void ${one.key[1]}`)
}
if (added.length > 0) {
  console.log('      ⛔ `void` ＝「我保證唔會 reject」（開發紀錄 附錄 D3）。證唔到就寫 `.catch(…)` 出返句中文。')
}
for (const one of stale) {
  bad += 1
  console.log(`  ✗ 名單有、code 冇（修好咗？）：${one.key[0]}  void ${one.key[1]}  ⇒ 喺 tools/void/baseline.json 剷走`)
}
for (const one of missingWhy) {
  bad += 1
  console.log(`  ✗ 名單一行冇寫 why：${one.file}  void ${one.text}`)
}

if (bad > 0) {
  console.log(`✗ void 尺紅（${bad} 項）。`)
  process.exit(1)
}
console.log('✓ void 尺全綠：冇新嘅 `void` 冇 catch。')
