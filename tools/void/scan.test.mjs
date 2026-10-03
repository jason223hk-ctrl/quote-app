import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compare, scanVoids } from './scan.mjs'

const texts = (src, file = 'a.tsx') => scanVoids(src, file).map((h) => h.text)

describe('scanVoids：邊啲算「冇 catch」', () => {
  it('⛔ 淨係 `void x()` ⇒ 中', () => {
    expect(texts('void save()')).toEqual(['save()'])
    expect(texts('const f = () => void reload()')).toEqual(['reload()'])
  })

  it('⛔ `.then(f)`／`.finally(f)` 唔算處理咗（2026-09-19 狀態撳唔到就係 `.finally`）', () => {
    expect(texts('void onStatusChange(to).finally(() => done())')).toEqual([
      'onStatusChange(to).finally(() => done())',
    ])
    expect(texts('void load().then((x) => use(x))')).toEqual(['load().then((x) => use(x))'])
    expect(texts('void p.catch(h).then(g)')).toEqual(['p.catch(h).then(g)'])
  })

  it('✅ `.catch(h)`、`.then(ok, fail)`、`.catch(h).finally(f)` ⇒ 唔中', () => {
    expect(texts('void save().catch((e) => show(e))')).toEqual([])
    expect(texts('void load().then(ok, fail)')).toEqual([])
    expect(texts('void run().catch(h).finally(f)')).toEqual([])
    expect(texts('void (async () => { await x() })().catch(h)')).toEqual([])
  })

  it('✅ 型別入面嘅 void、`void 0`、註解、字串 ⇒ 唔中', () => {
    const src = [
      'type P = { onDelete: () => void; run: () => Promise<void> }',
      'function f(): void {}',
      'const a = void 0',
      '// void save()',
      "const s = 'void save()'",
    ].join('\n')
    expect(texts(src, 'a.ts')).toEqual([])
  })

  it('報返行號', () => {
    expect(scanVoids('\n\nvoid save()', 'a.ts')[0].line).toBe(3)
  })

  it('.mjs（worker）都讀得', () => {
    expect(texts('export function f() { void go() }', 'w.mjs')).toEqual(['go()'])
  })
})

describe('compare：對名單', () => {
  const one = { file: 'src/a.tsx', text: 'save()' }

  it('⛔ code 有、名單冇 ⇒ added', () => {
    expect(compare([one], []).added).toHaveLength(1)
  })

  it('⛔ 名單一行⛔ 包唔晒兩次 —— 同一句多咗一次都要紅', () => {
    expect(compare([one, one], [{ ...one, why: 'x' }]).added).toEqual([
      { key: ['src/a.tsx', 'save()'], extra: 1 },
    ])
    expect(compare([one, one], [{ ...one, count: 2, why: 'x' }]).added).toEqual([])
  })

  it('⛔ 名單有、code 冇 ⇒ stale（修好咗要剷名單）', () => {
    expect(compare([], [{ ...one, why: 'x' }]).stale).toHaveLength(1)
  })

  it('⭐ 同一句喺另一個檔 ⇒ 係另一件事', () => {
    expect(compare([{ file: 'src/b.tsx', text: 'save()' }], [{ ...one, why: 'x' }]).added).toHaveLength(1)
  })
})

/*
 * ⭐⭐ 反證：喺一個臨時資料夾度跑**成把尺**（`check.mjs`），⛔ 唔係淨係試 function。
 *    加一個新 `void` ⇒ 一定要 exit 1；補返 `.catch` ⇒ exit 0。
 */
describe('反證：成把尺真係會紅', () => {
  const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check.mjs')

  function runIn(files, baseline) {
    const root = mkdtempSync(path.join(tmpdir(), 'void-check-'))
    try {
      mkdirSync(path.join(root, 'tools/void'), { recursive: true })
      writeFileSync(path.join(root, 'tools/void/baseline.json'), JSON.stringify(baseline))
      for (const [rel, body] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
        writeFileSync(path.join(root, rel), body)
      }
      try {
        const out = execFileSync(process.execPath, [CHECK], {
          env: { ...process.env, VOID_ROOT: root },
          encoding: 'utf8',
        })
        return { code: 0, out }
      } catch (error) {
        return { code: error.status, out: String(error.stdout) }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('⛔ 新加一個 `void save()` ⇒ 紅', () => {
    const r = runIn({ 'src/a.tsx': 'export const f = () => void save()\n' }, [])
    expect(r.code).toBe(1)
    expect(r.out).toContain('新嘅 `void` 冇 catch')
    expect(r.out).toContain('src/a.tsx:1')
  })

  it('✅ 補返 `.catch` ⇒ 綠', () => {
    const r = runIn({ 'src/a.tsx': 'export const f = () => void save().catch(show)\n' }, [])
    expect(r.code).toBe(0)
  })

  it('⛔ 名單一行冇寫 why ⇒ 紅', () => {
    const r = runIn({ 'src/a.tsx': 'void save()\n' }, [{ file: 'src/a.tsx', text: 'save()' }])
    expect(r.code).toBe(1)
    expect(r.out).toContain('冇寫 why')
  })

  it('⛔ 修好咗但冇剷名單 ⇒ 紅', () => {
    const r = runIn({ 'src/a.tsx': 'save().catch(show)\n' }, [
      { file: 'src/a.tsx', text: 'save()', why: '未驗' },
    ])
    expect(r.code).toBe(1)
    expect(r.out).toContain('名單有、code 冇')
  })
})
