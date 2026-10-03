/*
 * `void <promise>` 冇 catch 嘅掃描器。⛔ 呢個檔淨係判斷，行檔同對名單喺 `check.mjs`。
 *
 * ⭐⭐ **點解要有 —— ⛔ 唔准淨係記住結論**
 *
 * `docs/開發紀錄.md` 附錄 D3：喺呢個 repo，`void x()` ＝ 一句承諾
 * 「我保證呢條 promise 唔會 reject」。⛔ 證唔到就唔准用 `void`，要 `.catch` 出返句嘢。
 *
 * 同一個病已經中過幾次，次次都係「撳咗冇反應」：
 *   · 2026-09-16 加成格 `void onMarkupSave(n)`
 *   · 2026-09-19 轉狀態 `void onStatusChange(…).finally(…)`（Jason 真機報）
 *   · 2026-10-03 樹木頁刪樹 `void afterWrite(…)`（PR #80）、
 *                相片格「再試一次」`void retry(…)`（PR #81）
 * ⇒ 「一次係巧合，兩次係圖案」，而第三、四次都係**人讀 code 先捉到** ——
 *    ⛔ 冇一把尺會紅。呢個就係嗰把尺。
 *
 * ⭐ 用 TypeScript 自己個 parser 讀 AST，⛔ 唔用 regex：
 *   · `() => void`、`Promise<void>` 呢啲**型別**入面嘅 `void` 唔係 `VoidExpression`，
 *     AST 自然唔會當佢；regex 就會。
 *   · 字串、註解入面嘅 `void` 一樣唔會中。
 */
import ts from 'typescript'

/**
 * 呢條 expression 自己有冇處理 reject。
 *
 * 當「有處理」：
 *   · `x.catch(h)`
 *   · `x.then(ok, fail)`（兩個參數）
 *   · `x.finally(f)`，而 `x` 本身有處理（`p.catch(h).finally(f)`）
 * ⛔ 其餘一律當冇：`p.then(f)`、`p.finally(f)`、`p.catch(h).then(g)`
 *    （最後嗰個 `g` throw 咗就冇人接）。
 */
export function handlesRejection(expr) {
  let node = expr
  while (ts.isParenthesizedExpression(node)) node = node.expression
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  if (!ts.isPropertyAccessExpression(callee)) return false
  const name = callee.name.text
  if (name === 'catch') return true
  if (name === 'then') return node.arguments.length >= 2
  if (name === 'finally') return handlesRejection(callee.expression)
  return false
}

/** `void 0`、`void undefined` 呢類唔係 promise，唔使理。 */
function isTrivial(expr) {
  let node = expr
  while (ts.isParenthesizedExpression(node)) node = node.expression
  return (
    ts.isLiteralExpression(node) ||
    ts.isIdentifier(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  )
}

/** 名單用嘅「身分」：個 expression 嘅原文，壓埋空白。⛔ 唔用行號（一郁就變）。 */
export function normalise(text) {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * 搵晒一個檔入面冇處理 reject 嘅 `void`。
 * @returns {{ line: number, text: string }[]}
 */
export function scanVoids(source, fileName = 'x.tsx') {
  const kind = fileName.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : fileName.endsWith('.ts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const out = []
  const visit = (node) => {
    if (ts.isVoidExpression(node) && !isTrivial(node.expression) && !handlesRejection(node.expression)) {
      out.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        text: normalise(node.expression.getText(sf)).slice(0, 120),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/**
 * 對名單。同 `tools/written` 一樣嘅三種情況：
 *   · 名單有、code 都有 ⇒ OK（已知、已寫低）
 *   · code 有、名單冇   ⇒ ⛔ 紅（有人加咗個新嘅 `void`）
 *   · 名單有、code 冇   ⇒ ⛔ 紅（修好咗但冇剷名單 —— 逼個改動喺 diff 度見得到）
 * ⭐ 同一個檔同一句出現幾次，要數埋次數（⛔ 唔准「名單一行包晒十個」）。
 */
export function compare(found, baseline) {
  const key = (f, t) => JSON.stringify([f, t])
  const count = (list) => {
    const m = new Map()
    for (const one of list) {
      const k = key(one.file, one.text)
      m.set(k, (m.get(k) ?? 0) + (one.count ?? 1))
    }
    return m
  }
  const have = count(found)
  const allowed = count(baseline)
  const added = []
  const stale = []
  for (const [k, n] of have) {
    const ok = allowed.get(k) ?? 0
    if (n > ok) added.push({ key: JSON.parse(k), extra: n - ok })
  }
  for (const [k, n] of allowed) {
    const now = have.get(k) ?? 0
    if (now < n) stale.push({ key: JSON.parse(k), gone: n - now })
  }
  return { added, stale }
}
