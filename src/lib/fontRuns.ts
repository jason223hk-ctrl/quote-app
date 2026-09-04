/**
 * 將一句字拆成 ASCII ／ 非 ASCII 兩種段落。
 *
 * ⛔⛔ 呢個唔係「靚啲」，係**唔拆就出錯字**。tree app 用真嘢中過（2026-07-30 Jason 份報告）：
 *
 *     A0 2 1 _垂葉榕_Whole View_0 1 _Before
 *
 * 每個數字被推開咗，中文就啱。原因：Noto 嗰隻字要用 `subset:false` 落去
 * （`subset:true` 會整爛啲中文字形），而 non-subset 嘅 CID embed 喺 pdf-lib
 * 有個**拉丁字母行寬**嘅 bug。⇒ ASCII 段落一律用 WinAnsi 嗰隻畫。
 *
 * 而 `1_Crown Cleaning_01` 呢種相底，係一句**中英夾雜**（樹牌可以係中文）——
 * 一隻字型畫成句就一定有一半錯，連置中都會錯（量成句嘅闊度本身就係錯數）。
 *
 * ⚠️ 一個字一個字行（`for…of`，跟 code point），⛔ 唔准用 index ——
 * 用 index 會將一對 surrogate 拆成兩橛。
 *
 * ⛔ 自成一個檔：`pdfReport.ts` 會 import 個 `.ttf`，測呢段邏輯唔應該拖埋隻 7MB 字型入嚟。
 */
export function splitFontRuns(s: string): { text: string; ascii: boolean }[] {
  const out: { text: string; ascii: boolean }[] = []
  for (const ch of String(s ?? '')) {
    const isAscii = (ch.codePointAt(0) ?? 0) <= 127
    const last = out[out.length - 1]
    if (last && last.ascii === isAscii) last.text += ch
    else out.push({ text: ch, ascii: isAscii })
  }
  return out
}
