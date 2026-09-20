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

  /*
   * ⭐⭐ 2026-09-20 第三個窿，而且係**我自己補上面兩個窿嗰陣整出嚟**嘅：
   *    舊版將 `<` 同 `>` 都當咗運算子 ⇒ JSX 收尾標籤 `</strong>` 前面嗰個 `<`
   *    令後面個 `/` 變咗「regex 開頭」，**由嗰度一路剷到落一個 `/` 或者行尾**。
   *
   * ⚠️ 真個案 `TreeFormPage.tsx:224`：`</strong>` 之後成行
   *    「如要寫明是哪一種修剪⋯」（20 個中文字元）入唔到 `userText()`
   *    ⇒ 書面語尺由頭到尾**睇唔到佢**，而三把尺（baseline、下限、REQUIRED）全部報綠。
   *
   * ⭐ ⛔ 唔係人讀出嚟 —— 係 `check.mjs` 個字元覆蓋差指住一張檔（分母 5339 vs 分子 5319）。
   */
  it('⛔ JSX 收尾標籤個 `<` ⛔ 唔係運算子 —— `</strong>` 之後嘅字要抽得返', () => {
    const src = [
      '<p className="notice">',
      '  屬於舊格式。<strong>會保留，不會消失。</strong>',
      '  如果要寫明係邊一種修剪，請喺上面揀返一項。',
      '</p>',
    ].join('\n')
    expect(userText(src).map((h) => h.text)).toContain(
      '如果要寫明係邊一種修剪，請喺上面揀返一項。',
    )
  })

  /*
   * ⚠️⚠️ 2026-09-20 CO 讀 diff 捉到：修上面嗰條嗰陣我**順手連 `>` 一齊由
   *    `isRegexStart` 拆走** —— 而嗰下即刻把**最早嗰個窿重新打開**。
   *
   *    箭頭函數 `(x) => /["]/.test(x)`：個 `/` 前面係 `=>` 嘅 `>`
   *    ⇒ 冇咗 `>` 就唔當 regex ⇒ 條 regex 字面值⛔ 唔再剷走
   *    ⇒ 入面個 `"` 又當咗「字串開始」，**食埋後面真嘅字串**。
   *
   * ⭐ 即係 2026-09-17 第一代掃描器嗰個錯本人（見上面嗰段註解）。
   *   ⚠️ 而嗰陣**書面語尺全綠、字元覆蓋差都係 0** —— 因為俾人食咗嗰段
   *   分子分母一齊跌。⛔ 所以呢條測試⛔ 唔可以靠把尺頂替。
   */
  it('⛔ 箭頭函數個 `>` 之後嘅 `/` 仍然係 regex —— ⛔ 唔准食咗後面嗰句', () => {
    const src = [
      'const f = (x) => /["]/.test(x)',
      "const msg = '呢句先係真嘅用家文字'",
    ].join('\n')
    expect(userText(src).map((h) => h.text)).toEqual(['呢句先係真嘅用家文字'])
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

/*
 * ⭐⭐ 2026-09-17 CO 審 `BANNED` 補返嘅。
 * ⚠️ 頭兩隻（啱、諗）係**我自己寫嘢嗰陣都用緊**嘅字 ——
 *    即係話寫把尺嗰個人，自己就係漏網嘅來源。
 */
describe('CO 補返嗰批', () => {
  it.each(['啱', '諗', '靚', '咪', '喇', '幾時', '邊度', '梗係', '成日', '識得', '企喺', '鍾意'])(
    '「%s」要捉到',
    (w) => {
      expect(hitWords(`一句有${w}嘅嘢`).length).toBeGreaterThan(0)
      expect(hitWords(w).length).toBeGreaterThan(0)
    },
  )

  it.each([
    ['喇叭', '喇'],
    ['喇嘛', '喇'],
    ['咪錶', '咪'],
    ['咪高峰', '咪'],
  ])('「%s」係書面語，⛔ 唔准因為有個「%s」就誤報', (word) => {
    expect(hitWords(word)).toEqual([])
  })

  it('但語氣詞本身照樣捉到（ALLOW ⛔ 唔准放生佢）', () => {
    expect(hitWords('好喇')).toContain('喇')
    expect(hitWords('咪住')).toContain('咪')
    expect(hitWords('喇叭壞咗，唔好喇')).toContain('喇')
  })

  /*
   * ⛔⛔ **「點算」特登冇入 BANNED —— ⛔ 唔係漏咗。**
   * 書面語嘅「點算」＝ 盤點；而我哋自己譯出嚟嗰句
   * 「正在點算這個工程有多少棵樹和相片」就係用緊佢。
   * ⚠️ 禁咗佢，把尺就會告自己嘅定稿。
   */
  it('「點算」（＝盤點）⛔ 唔准當廣東話', () => {
    expect(hitWords('正在點算這個工程有多少棵樹和相片')).toEqual([])
  })
})
