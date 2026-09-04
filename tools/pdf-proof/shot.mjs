/**
 * 出一份真 PDF 出嚟睇。
 *
 * ⛔⛔ 呢個係唯一驗得到 PDF 嘅方法 —— 單元測試驗得到「邊幾張相入 PDF」，
 *    ⛔ 但驗唔到「印出嚟係咩樣」。2026-09-03 就係靠佢捉到兩件事：
 *      ① 標誌用錯咗 `brand-lockup.png`（白字），印落白紙近乎睇唔到；
 *      ② 每格自己計相高，同一行兩張相高高低低。
 *
 * 跑法：`npm run pdf:proof`，之後開 `/home/claude/dark/proof.pdf`
 *      （或者用 `pdftoppm -png -r 90 proof.pdf proof` 出返圖睇）。
 *
 * ⛔ 輸出寫喺 repo 入面（`tools/pdf-proof/proof.pdf`），⛔ 唔准寫死一個絕對路徑 ——
 *    2026-09-03 就係寫死咗個 container 路徑，Jason 部機根本冇嗰個資料夾。
 */
import { chromium } from 'playwright'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root='tools/pdf-proof/dist'
const OUT = process.env.PDF_OUT ?? path.join('tools', 'pdf-proof', 'proof.pdf')
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png'}
const s=http.createServer((q,r)=>{let f=path.join(root,q.url.split('?')[0]); if(f.endsWith('/'))f=path.join(f,'index.html')
 let b=null;try{b=fs.readFileSync(f)}catch{};if(b){r.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'});r.end(b)}else{r.writeHead(404);r.end()}}).listen(8362)
/**
 * 開瀏覽器。三條路順住試 —— ⛔ 同 `tools/ui-check/measure.mjs` 一樣，
 * ⛔ 唔准寫死一個路徑：`/opt/pw-browsers/chromium` 係 Cowork 個 Linux VM 嘅位，
 * Jason 部 Mac 冇（2026-09-03 中過）。
 *   1. CHROMIUM_PATH —— 自己指實個 binary
 *   2. Playwright 自己下載嗰個（Mac：`npx playwright install chromium` 一次）
 *   3. 部機裝咗嘅 Chrome／Edge
 */
async function openBrowser() {
  const tries = [
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : null,
    {},
    { channel: 'chrome' },
    { channel: 'msedge' },
  ].filter(Boolean)
  let last
  for (const opt of tries) {
    try { return await chromium.launch(opt) } catch (e) { last = e }
  }
  console.error('開唔到瀏覽器。喺 Terminal 跑一次 `npx playwright install chromium` 就得。')
  throw last
}

const br = await openBrowser()
const p=await br.newPage()
p.on('pageerror',e=>console.log('ERR',e.message))
// ⛔ favicon 個 404 唔算 —— 佢每次都響，響到你之後見到真嘅 404 都唔會望。
p.on('requestfailed', r => { if (!r.url().endsWith('/favicon.ico')) console.log('攞唔到', r.url()) })
p.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) console.log('HTTP', r.status(), r.url()) })
// ⚠️ console 個 404 message 唔會講係邊條 url ⇒ 靠上面 `response` 嗰條認。
//    所以呢度淨係出唔關 404 事嘅 console 錯（真 JS 出錯）。
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('CONSOLE', m.text()) })
await p.goto('http://localhost:8362/')
await p.waitForFunction(()=>window.PDF, null, {timeout:60000})
const b64=await p.evaluate(()=>window.PDF)
fs.writeFileSync(OUT, Buffer.from(b64,'base64'))
console.log('出咗', OUT, Buffer.from(b64,'base64').length, 'bytes')
await br.close(); s.close()
