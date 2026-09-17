import { describe, expect, it } from 'vitest'
import { BANNED, hitWords, scanFile, stripComments, userText } from './scan.mjs'

/*
 * ⛔⛔ 呢啲測試唔係「補齊 coverage」—— 每一個都對應一個**真係出過事嘅形狀**。
 */

describe('stripComments', () => {
  it('⛔ 註解入面嘅廣東話⛔ 唔算 —— 佢係寫俾開發者睇嘅', () => {
    const src = ['// 呢度係註解，寫廣東話冇問題', "const a = '沒有問題'"].join('\n')
    expect(scanFile(src)).toEqual([])
  })

  it('⛔ 區塊註解同 JSX 註解都要剷', () => {
    const src = ['/* 呢度都係註解，撳咗就冇咗 */', '{/* JSX 註解，睇唔到嘅 */}'].join('\n')
    expect(scanFile(src)).toEqual([])
  })

  it('字串入面嘅 // ⛔ 唔可以當註解剷走', () => {
    const src = "const url = 'https://例子.com 呢個唔係註解'"
    expect(scanFile(src).map((h) => h.text)).toEqual(['https://例子.com 呢個唔係註解'])
  })

  it('剷完之後行數對得返（報位要準）', () => {
    const src = ['// 註解', '', "const a = '唔得'"].join('\n')
    expect(scanFile(src)[0].line).toBe(3)
  })
})

/*
 * ⭐⭐ 2026-09-17 真係中過：`/[<>|\x00-\x1f]/g` 入面冇引號，但後面
 * `.replace(…, '_')` 嗰個 `'` 令掃描器以為「字串開始咗」，
 * ⚠️ 於是佢一路食落去，**食咗成段 code**：
 *   · 報咗一句根本唔存在嘅「用家文字」；
 *   · 而且**食埋後面真嘅字串** ⇒ `worker.mjs` 由 209 行之後全部漏報，
 *     14 句真廣東話一句都冇捉到。
 * ⇒ 所以 regex 字面值要當佢唔存在。
 */
describe('regex 字面值', () => {
  it('⛔ 唔可以當 regex 入面嘅引號係字串開頭', () => {
    const src = [
      "export const safe = (s) => s.replace(/[<>|\\x00-\\x1f]/g, '_')",
      "const msg = '呢句先係真嘅用家文字'",
    ].join('\n')
    expect(scanFile(src).map((h) => h.text)).toEqual(['呢句先係真嘅用家文字'])
  })

  it('除號⛔ 唔可以當 regex —— 唔係見到 / 就跳', () => {
    const src = ["const half = total / 2", "const msg = '唔夠位'"].join('\n')
    expect(scanFile(src).map((h) => h.text)).toEqual(['唔夠位'])
  })

  it('regex 入面嘅 / 喺 [] 入面⛔ 唔算收尾', () => {
    const src = ["const re = /[/]/g", "const msg = '仲有嘢未做'"].join('\n')
    expect(scanFile(src).map((h) => h.text)).toEqual(['仲有嘢未做'])
  })
})

/*
 * ⛔⛔ 「返」「仲」「耐」「埋」「影」「添」喺書面語都用得 ——
 *    2026-09-17 第二版掃描器用單字「返」，即刻把粒**「返回」掣**當咗廣東話。
 */
describe('⛔ 唔可以禁單字嘅字', () => {
  it.each([
    ['返回', '返'],
    ['仲裁', '仲'],
    ['耐用', '耐'],
    ['埋設', '埋'],
    ['陰影', '影'],
    ['影響', '影'],
    ['添加', '添'],
  ])('「%s」係書面語，⛔ 唔准因為有個「%s」就當佢廣東話', (word) => {
    expect(hitWords(word)).toEqual([])
  })

  it('但成個詞就要捉到', () => {
    expect(hitWords('揀返一個')).toContain('揀返')
    expect(hitWords('仲未上到雲端')).toContain('仲未')
    expect(hitWords('等太耐')).toContain('太耐')
    expect(hitWords('影相照影得')).toContain('影相')
  })
})

describe('捉得到', () => {
  it.each(['嘅', '咗', '喺', '唔', '冇', '啲', '撳', '攞', '搵', '揾', '睇', '揀', '嘢'])(
    '「%s」一出現就要紅',
    (ch) => {
      expect(BANNED).toContain(ch)
      expect(hitWords(`一句有${ch}嘢`).length).toBeGreaterThan(0)
    },
  )

  it('JSX 文字節點都要捉到（⛔ 唔止字串字面值）', () => {
    expect(userText('<p>仲未有工程</p>').map((h) => h.text)).toEqual(['仲未有工程'])
  })

  it('書面語⛔ 唔准誤報', () => {
    const src = ["const msg = '這個工程已經鎖定，不能修改，亦不能刪除。'"]
    expect(scanFile(src.join('\n'))).toEqual([])
  })
})
