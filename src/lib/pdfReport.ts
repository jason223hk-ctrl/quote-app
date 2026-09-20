/**
 * 真正砌 PDF 嗰度。client-side，用 pdf-lib ＋ fontkit（同 tree app 一樣）。
 *
 * 版面規格出處：原型 `stage57-autoupload.html` 個 `renderPdf()` ＋ `.pdfpg` 嗰組 CSS。
 * 佢唔係一版畫面（Jason 2026-08-25「冇預覽頁」），佢就係**紙嘅規格**。
 *
 * ⛔⛔ 三條硬規矩：
 *   一、**成本同收客價永遠唔上 PDF**。呢個檔冇一個價錢欄，⛔ 唔准加。
 *   二、**環境相唔入 PDF**（過濾喺 `pdfModel.buildShots`）。
 *   三、**冇簽名格、冇封面、冇預覽頁**。由頭到尾＝抬頭 ＋ 相。
 *
 * ⚠️⚠️ 兩個字型地雷（tree app 撞過，⛔ 唔准「順手簡化」）：
 *   ① `subset: true` 會整爛中文字形 ⇒ ⛔ 一定要 `subset: false`。
 *   ② non-subset 嘅 CID embed 有拉丁字母行寬 bug ⇒ ASCII 要用 WinAnsi 嗰隻畫。
 *      所以每句字都要經 `drawMixedText` 逐段畫，⛔ 唔准 `page.drawText(整句)`。
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontUrl from '../assets/NotoSansTC-Regular.ttf?url'
/**
 * ⛔⛔ 紙上面嘅標誌**唔可以**用 `brand-lockup.png` —— 嗰個係畀深色 app 用嘅，
 *    啲字係白色。印落白紙上面近乎完全睇唔到（2026-09-03 出咗一版真 PDF 先發現）。
 * ⭐ 呢個 `pdf-logo.png` 係原型 `renderPdf()` 個 `LOGO` 原圖（715×140，橄欖綠連字），
 *    Jason 2026-08-28 拍板「用返成個 logo 連字」講嘅就係佢。
 */
import logoUrl from '../assets/pdf-logo.png?url'
import { splitFontRuns } from './fontRuns'
import { paginate, type ExportShot } from './pdfModel'

/** A4 直度，單位 point。 */
const PAGE_W = 595.28
const PAGE_H = 841.89

/** 原型 `.pdfpg{padding:18px 16px 26px}`，照 210mm 闊度換算成 point。 */
const PX = PAGE_W / 210 / (96 / 25.4) // 一個 CSS px 喺 A4 上面等於幾多 point
const pad = (px: number) => px * PX

const MARGIN_X = pad(16)
const MARGIN_TOP = pad(18)
const MARGIN_BOTTOM = pad(26)
const CONTENT_W = PAGE_W - MARGIN_X * 2

const INK = rgb(0x2b / 255, 0x24 / 255, 0x1c / 255)
const MUTED = rgb(0x6e / 255, 0x63 / 255, 0x55 / 255)
const FOOT = rgb(0x8a / 255, 0x7f / 255, 0x71 / 255)
const LINE = rgb(0xe0 / 255, 0xd8 / 255, 0xcb / 255)

const LOGO_H = pad(40)
const HEAD_SIZE = pad(9.5)
const HEAD_LEAD = HEAD_SIZE * 1.45
const CAP_SIZE = pad(10)
/** 相底行高，原型 `.rcell .cp{line-height:1.35}`。 */
const CAP_LINE = 1.35
const NOTE_SIZE = pad(9)
const FOOT_SIZE = pad(10)
const GAP_X = pad(14)
const GAP_Y = pad(12)
/** 相同相底之間 `.rcell{gap:5px}`。 */
const CELL_GAP = pad(5)

export type PdfHead = {
  /** 三行都可以留空 —— ⛔ 留空就唔出嗰行（Jason 2026-08-25）。 */
  name: string
  date: string
  count: string
}

export type PdfPhoto = { photoId: string; bytes: ArrayBuffer }

type Fonts = { cjk: PDFFont; ascii: PDFFont }

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`無法獲取 ${url}（${res.status}）`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * 逐段畫。`x` 對 `left` 嚟講係左邊，對 `center` 嚟講係中線。
 * 回傳成句嘅闊度 —— 量嘅時候一樣要逐段量，⛔ 一隻字型量成句係錯數。
 */
function drawMixed(
  page: PDFPage,
  s: string,
  o: { x: number; y: number; size: number; fonts: Fonts; color: ReturnType<typeof rgb>; align?: 'left' | 'center' },
): number {
  const runs = splitFontRuns(s)
  const width = measure(s, o.size, o.fonts)
  let cx = o.align === 'center' ? o.x - width / 2 : o.x
  for (const run of runs) {
    const font = run.ascii ? o.fonts.ascii : o.fonts.cjk
    page.drawText(run.text, { x: cx, y: o.y, size: o.size, font, color: o.color })
    cx += font.widthOfTextAtSize(run.text, o.size)
  }
  return width
}

function measure(s: string, size: number, fonts: Fonts): number {
  return splitFontRuns(s).reduce(
    (w, run) => w + (run.ascii ? fonts.ascii : fonts.cjk).widthOfTextAtSize(run.text, size),
    0,
  )
}

/**
 * 一句字塞入指定闊度，摺行。
 * ⛔ 唔准截 —— 截咗個備註就冇咗半句，而備註係現場寫落嘅嘢。
 */
function wrap(s: string, size: number, fonts: Fonts, maxWidth: number): string[] {
  if (s === '') return []
  const lines: string[] = []
  let line = ''
  for (const ch of s) {
    const next = line + ch
    if (line !== '' && measure(next, size, fonts) > maxWidth) {
      lines.push(line)
      line = ch
    } else {
      line = next
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/** 抬頭：左邊標誌，右上角三行齊頭靠左。⛔ 每一頁都出，⛔ 唔止第一頁。 */
function drawHead(page: PDFPage, fonts: Fonts, logo: PDFImage | null, head: PdfHead): number {
  const top = PAGE_H - MARGIN_TOP
  let bottom = top

  if (logo) {
    const w = (logo.width / logo.height) * LOGO_H
    page.drawImage(logo, { x: MARGIN_X, y: top - LOGO_H, width: w, height: LOGO_H })
    bottom = top - LOGO_H
  }

  // 三行齊頭：格仔靠右，但入面啲字靠左，行頭對齊（Jason 2026-08-25）。
  const lines = [head.name, head.date, head.count].map((v) => v.trim()).filter((v) => v !== '')
  if (lines.length) {
    const widest = Math.max(...lines.map((line) => measure(line, HEAD_SIZE, fonts)))
    const left = PAGE_W - MARGIN_X - widest
    let y = top - HEAD_SIZE
    for (const line of lines) {
      drawMixed(page, line, { x: left, y, size: HEAD_SIZE, fonts, color: INK })
      y -= HEAD_LEAD
    }
    bottom = Math.min(bottom, y + HEAD_LEAD - HEAD_SIZE * 0.25)
  }

  const ruleY = bottom - pad(7)
  page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: PAGE_W - MARGIN_X, y: ruleY },
    thickness: 0.5,
    color: LINE,
  })
  return ruleY - pad(9)
}

function drawFoot(page: PDFPage, fonts: Fonts, n: number, total: number) {
  const text = `第 ${n}/${total}`
  const width = measure(text, FOOT_SIZE, fonts)
  // ⛔ 左下角唔寫工程名（2026-08-25 補三）。淨返右下角頁碼。
  drawMixed(page, text, {
    x: PAGE_W - MARGIN_X - width,
    y: pad(9),
    size: FOOT_SIZE,
    fonts,
    color: FOOT,
  })
}

type CapLine = { text: string; size: number; color: ReturnType<typeof rgb> }

/**
 * 相底三行：檔名 ／ 工序（成棵樹，英文）／ 備註。
 * ⛔ 冇備註就唔出 —— 唔留白位、唔出佔位字（Jason 2026-08-25 定稿三）。
 */
function capLinesOf(
  shot: ExportShot,
  fonts: Fonts,
  maxWidth: number,
): { lines: CapLine[]; height: number } {
  const lines: CapLine[] = []
  for (const line of wrap(shot.file, CAP_SIZE, fonts, maxWidth)) {
    lines.push({ text: line, size: CAP_SIZE, color: INK })
  }
  for (const line of wrap(shot.worksEn, CAP_SIZE, fonts, maxWidth)) {
    lines.push({ text: line, size: CAP_SIZE, color: INK })
  }
  for (const line of wrap(shot.note, NOTE_SIZE, fonts, maxWidth)) {
    lines.push({ text: line, size: NOTE_SIZE, color: MUTED })
  }
  return { lines, height: lines.reduce((h, line) => h + line.size * CAP_LINE, 0) }
}

async function embedPhoto(doc: PDFDocument, bytes: ArrayBuffer): Promise<PDFImage | null> {
  const view = new Uint8Array(bytes)
  try {
    return await doc.embedJpg(view)
  } catch {
    try {
      return await doc.embedPng(view)
    } catch {
      return null
    }
  }
}

/**
 * 砌成份 PDF，回一份 `Blob`。
 *
 * ⚠️ `photos` 攞唔到嘅相⛔ 唔會靜靜咁跳過 —— 呼叫嗰邊要事前講清楚幾多張攞唔到。
 *    呢度收到幾多張就排幾多張。
 */
export async function buildPdf(
  shots: ExportShot[],
  photos: Map<string, ArrayBuffer>,
  head: PdfHead,
): Promise<Blob> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  // ⛔⛔ `subset: true` 會整爛中文字形（pdf-lib／fontkit subsetter bug）。⛔ 唔准改。
  const cjk = await doc.embedFont(await fetchBytes(fontUrl), { subset: false })
  const ascii = await doc.embedFont(StandardFonts.Helvetica)
  const fonts: Fonts = { cjk, ascii }

  let logo: PDFImage | null = null
  try {
    logo = await doc.embedPng(await fetchBytes(logoUrl))
  } catch {
    // ⛔ 冇標誌都要出到份 PDF —— 但⛔ 唔准用文字扮個標誌（Jason 2026-08-28 拍板用真圖）。
    logo = null
  }

  // ⛔ 相一定要喺開頁之前 embed 好 —— `embedJpg` 係 async，畫嗰個 loop 唔可以 await。
  const embedded = new Map<string, PDFImage>()
  for (const [id, bytes] of photos) {
    const image = await embedPhoto(doc, bytes)
    if (image) embedded.set(id, image)
  }

  const pages = paginate(shots)
  const total = Math.max(pages.length, 1)

  if (pages.length === 0) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    drawHead(page, fonts, logo, head)
    drawMixed(page, '未有可用相片', {
      x: PAGE_W / 2,
      y: PAGE_H / 2,
      size: CAP_SIZE,
      fonts,
      color: MUTED,
      align: 'center',
    })
    drawFoot(page, fonts, 1, 1)
  }

  pages.forEach((chunk, index) => {
    const page = doc.addPage([PAGE_W, PAGE_H])
    const gridTop = drawHead(page, fonts, logo, head)
    const gridBottom = MARGIN_BOTTOM
    const colW = (CONTENT_W - GAP_X) / 2
    const rowH = (gridTop - gridBottom - GAP_Y) / 2

    // ⭐ 成頁四張相**同一個高度** —— ⛔ 唔准每格自己計。
    //    每格嘅相底行數唔同（有啲有備註有啲冇），逐格計嘅話同一行嘅兩張相
    //    會高高低低，睇落似排錯版。原型嗰邊 `.rcell .im{aspect-ratio:3/4}`
    //    本身就係固定高度，⇒ 呢度攞成頁最矮嗰個做準。
    const capHeights = chunk.map((shot) => capLinesOf(shot, fonts, colW).height)
    const tallestCap = Math.max(...capHeights, 0)
    const imgH = Math.min(Math.max(rowH - tallestCap - CELL_GAP, 0), (colW * 4) / 3)
    const imgW = Math.min(colW, (imgH * 3) / 4)

    chunk.forEach((shot, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = MARGIN_X + col * (colW + GAP_X)
      const cellTop = gridTop - row * (rowH + GAP_Y)

      const capLines = capLinesOf(shot, fonts, colW).lines
      const imgTop = cellTop
      const image = embedded.get(shot.photoId)
      if (image) {
        page.drawImage(image, {
          x: x + (colW - imgW) / 2,
          y: imgTop - imgH,
          width: imgW,
          height: imgH,
        })
      }

      let y = imgTop - imgH - CELL_GAP - CAP_SIZE
      for (const line of capLines) {
        drawMixed(page, line.text, {
          x: x + colW / 2,
          y,
          size: line.size,
          fonts,
          color: line.color,
          align: 'center',
        })
        y -= line.size * CAP_LINE
      }
    })

    drawFoot(page, fonts, index + 1, total)
  })

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
