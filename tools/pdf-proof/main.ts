import { buildPdf } from '../../src/lib/pdfReport'
import type { ExportShot } from '../../src/lib/pdfModel'

/** 造一張真 JPEG（純 canvas），⛔ 唔用假 bytes —— 假 bytes embed 唔到就試唔到相位。 */
async function jpeg(label: string, w = 900, h = 1200): Promise<ArrayBuffer> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, '#7C6B52')
  grad.addColorStop(1, '#EFE4D2')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#2B241C'
  g.font = 'bold 90px sans-serif'
  g.fillText(label, 40, h / 2)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))
  return blob.arrayBuffer()
}

const SHOTS: ExportShot[] = [
  { photoId: 'a', treeId: 't1', treeNo: '1', file: '1_Crown Cleaning_01', worksEn: 'Crown Cleaning, Crown Reduction', note: '樹幹有腐朽，傾斜 <15 度，建議下季再睇', whole: false },
  { photoId: 'b', treeId: 't1', treeNo: '1', file: '1_Whole View_01', worksEn: 'Crown Cleaning, Crown Reduction', note: '', whole: true },
  { photoId: 'c', treeId: 't2', treeNo: '彩A2', file: '彩A2_Removal_01', worksEn: 'Removal', note: '近民居，要吊雞', whole: false },
  { photoId: 'd', treeId: 't2', treeNo: '彩A2', file: '彩A2_Whole View_01', worksEn: 'Removal', note: '', whole: true },
  { photoId: 'e', treeId: 't3', treeNo: '3', file: '3_Whole View_01', worksEn: '', note: '未揀工序', whole: true },
]

const bytes = new Map<string, ArrayBuffer>()
for (const shot of SHOTS) bytes.set(shot.photoId, await jpeg(shot.photoId.toUpperCase()))

const blob = await buildPdf(SHOTS, bytes, {
  name: '彩霞邨 彩月樓',
  date: '2026-09-03',
  count: '修剪 1 棵｜移除 1 棵',
})
const buf = new Uint8Array(await blob.arrayBuffer())
let s = ''
for (const b of buf) s += String.fromCharCode(b)
;(window as unknown as { PDF: string }).PDF = btoa(s)
document.getElementById('out')!.textContent = 'ready ' + buf.length
