/**
 * quote-app 相片上傳 Worker。
 *
 * 佢只做一件事：**簽一條網址**。
 *
 * ⛔ 一個 byte 都唔會經過佢 —— 部機直接同 R2 講
 * （`docs/P3-現場影相-設計.md` 第三章：bytes 唔准經 Worker 中轉）。
 * ⛔ P3a 呢個版本**零 DB 查詢** —— 唔掂 Supabase 任何一張表。
 *
 * 檔名由呢度砌，唔係由前端講：前端只俾一個影相編號，
 * 用戶 id 係 Worker 自己驗返嚟嘅。所以邊個都改唔到人哋個資料夾。
 */

import {
  MITIGATION_TOKENS,
  photoFilename,
  projectFolderName,
  sitePhotoFilename,
} from './names.mjs'
import { RENAME_BATCH_MAX, needsRename, renamePlan, renameSummary } from './rename.mjs'
import { PURGE_BATCH_MAX, driveGone, purgePlan, purgeSummary, r2Gone } from './purge.mjs'
import { WHERE, driveFailure, redact } from './driveError.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EXPIRES_SECONDS = 900

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'cache-control': 'no-store',
    },
  })
}

function allowedOrigin(request, env) {
  const configured = (env.ALLOWED_ORIGIN ?? '').split(',').map((one) => one.trim()).filter(Boolean)
  const origin = request.headers.get('origin') ?? ''
  return configured.includes(origin) ? origin : (configured[0] ?? '')
}

/** 驗身分。用 publishable key 問 Supabase「呢個 token 係邊個」，冇 secret 落地。 */
async function userIdFrom(request, env) {
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) return null

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY },
  })
  if (!response.ok) return null

  const user = await response.json()
  return typeof user?.id === 'string' && user.id !== '' ? user.id : null
}

const encoder = new TextEncoder()

async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)))
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function encodePath(path) {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

/**
 * AWS SigV4 presigned URL，手寫，冇 dependency。
 * R2 收 S3 API，region 一律 `auto`。
 */
async function presign(method, env, key) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const path = `/${env.R2_BUCKET}/${key}`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/auto/s3/aws4_request`

  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(EXPIRES_SECONDS),
    'X-Amz-SignedHeaders': 'host',
  })
  query.sort()

  const canonicalRequest = [
    method,
    encodePath(path),
    query.toString(),
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  let signingKey = encoder.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`)
  for (const part of [dateStamp, 'auto', 's3', 'aws4_request']) {
    signingKey = await hmac(signingKey, part)
  }
  const signature = [...(await hmac(signingKey, stringToSign))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return `https://${host}${encodePath(path)}?${query.toString()}&X-Amz-Signature=${signature}`
}

/* ─────────────────────────────────────────────────────────────────────────────
 * P3b：鏡像上 Google Drive
 *
 * ⛔ **成條路由頭到尾行用家自己個 token，靠 RLS 攔**（`CLAUDE.md` §2.9）。
 *    **一個 `service_role` key 都冇。**
 *
 *    三個動作用家自己都做得到，所以唔使借權：
 *      - 讀 `quote_photos` 嗰行 —— `select using (true)`
 *      - 讀 `quote_records` / `quote_trees` —— 一樣 `select using (true)`
 *      - 寫返 `drive_file_id` / `drive_synced_at` ——
 *        `update using can_edit_quote_record(record_id)`，即係佢自己開嗰單就過到
 *
 *    ⚠️ RLS 唔會 throw，佢只係令 0 行受影響。所以寫返之後
 *    **一定要 readback 對返有冇行**（`CLAUDE.md` §2.6）。
 * ⛔ 只寫 `quote-photos` 個 bucket 同 quote app 自己個 Drive 資料夾。
 *    tree app 嘅 `tree-photos`、`tree-drive-mirror`、`Sylvan Tree Photos`
 *    一個 byte 都唔准掂。
 * ───────────────────────────────────────────────────────────────────────────── */
const DRIVE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** 剩餘空間跌穿呢個數就要出具名警告（`docs/開發紀錄.md` §九）。 */
const DRIVE_WARN_BYTES = 2 * 1024 * 1024 * 1024

async function googleToken(env) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
    }),
  })
  // ⛔ 唔准淨係報個 status code。2026-09-04 真機中過：畫面出「Drive 登入失敗（400）」，
  //    而 400 可以係「條通行證過咗期」（`invalid_grant`）、又可以係「client id／secret 唔啱」
  //    （`invalid_client`）—— 兩件事嘅修法完全唔同（一個重做授權，一個改 secret）。
  //    掉咗 Google 講嘅原因，就等於逼下一個人靠估，而估錯就會白做十五分鐘授權。
  //
  // ⛔ Google 呢個回覆入面冇 token、冇 secret，所以帶出嚟安全；
  //    ⛔ 但唔准改成連 request body 一齊出 —— 嗰度有 refresh token。
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    let why = ''
    try {
      const body = JSON.parse(raw)
      why = body.error_description || body.error || ''
    } catch {
      why = raw.slice(0, 120)
    }
    // ⛔ 過埋 `redact()` —— ⚠️ 呢個回覆本來就唔應該有 token，
    //    但「應該冇」⛔ 唔係一個保障。規矩喺 `driveError.mjs` 檔頭②。
    throw new Error(redact(`Drive 登入失敗（${res.status}${why ? '：' + why : ''}）`))
  }
  return (await res.json()).access_token
}

/**
 * Drive 回咗錯 ⇒ 砌返一句講得出係乜事嘅說話，順手寫低 log。
 *
 * ⛔⛔ **⛔ 唔准繞過呢個 helper 自己寫 `throw new Error(\`…（${res.status}）\`)`。**
 * ⚠️ 2026-09-16 就係因為 `files.list` 嗰句淨係報咗個 `429`，
 *    Jason 部機出咗「Drive 查詢失敗（429）」，而**我哋分唔到係
 *    「打得太密」（修得到）定「今日額度用晒」（修唔到）** ——
 *    而答案本來就喺 Google 回嘅 body 入面，俾我哋自己掉咗。
 *    完整經過同兩條硬規矩喺 `driveError.mjs` 檔頭。
 *
 * ⛔ 傳入去嘅係一個**寫死嘅呼叫名**（`WHERE`），⛔ 唔准傳 URL —— 個 `q` 入面
 *    有工程名同檔名，記落 log 就係漏出去。
 */
async function driveThrow(where, res) {
  // ⛔ `.text()` 可能 throw（連線中途斷）——⚠️ 喺錯誤路上面再 throw 一次，
  //    原本嗰個真原因就會冇咗。
  const raw = await res.text().catch(() => '')
  const { message, log } = driveFailure(where, res.status, raw, res.headers.get('retry-after'))
  console.error(log)
  return new Error(message)
}

function escapeQ(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function driveList(token, q, where) {
  const url = `${DRIVE}/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name)&pageSize=100`
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  // ⛔ `where` 係必須 —— 三個唔同嘅 `files.list` 撞 429 嘅意思唔一樣。
  if (!res.ok) throw await driveThrow(where, res)
  return (await res.json()).files || []
}

/**
 * 揾一個資料夾，冇就開。
 *
 * ⚠️ tree app 中過一次：22 個 webhook 同時開同一個資料夾，Drive 冇 unique 名，
 * 結果開咗三個同名。佢哋嘅解法係**每個人都揀返 id 最細嗰個**，
 * 咁樣唔使夾都會收斂到同一個。呢度照跟。
 */
async function ensureFolder(token, name, parentId) {
  const q = [
    `name = '${escapeQ(name)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false',
    parentId ? `'${parentId}' in parents` : `'root' in parents`,
  ].join(' and ')

  const existing = (await driveList(token, q, WHERE.listFolder)).map((f) => f.id).sort()
  if (existing.length) return existing[0]

  const res = await fetch(`${DRIVE}/files?fields=id`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  })
  if (!res.ok) throw await driveThrow(WHERE.createFolder, res)
  const mine = (await res.json()).id

  const after = (await driveList(token, q, WHERE.listFolder)).map((f) => f.id).sort()
  return after.length ? after[0] : mine
}

/** 同名檔已經喺度就用返佢 —— 上到 Drive 但寫唔返 DB 嗰陣，重試唔會整多一份。 */
/**
 * 揾返「呢一張相自己」上次抄上去嗰個檔。
 *
 * ⛔ **唔准用檔名做判斷。** 2026-08-22 中過（I7）：兩張唔同嘅相算出同一個名，
 * 第二張就**靜靜咁**被當成「已經喺度」，DB 寫咗 `drive_synced_at`、
 * 畫面出「兩份齊」，但**Drive 上面根本冇佢嗰份**。
 *
 * 而家用 `appProperties.quotePhotoId` —— 即係 `quote_photos` 嗰行嘅 id。
 * **一張相一個 id，撞唔到。**
 */
async function findMirroredFile(token, photoId, folderId) {
  const q = [
    `appProperties has { key='quotePhotoId' and value='${escapeQ(photoId)}' }`,
    'trashed = false',
    `'${folderId}' in parents`,
  ].join(' and ')
  const files = await driveList(token, q, WHERE.listMirrored)
  return files.length ? files[0].id : null
}

/**
 * 同名但**唔係同一張相**嘅檔。
 *
 * 有嘅話代表兩張相算出同一個檔名 —— ⛔ **唔准當佢係同一張、亦唔准照上**，
 * 因為 Drive 容許同名，照上就會出兩個一模一樣名嘅檔，之後冇人分得開。
 * **出聲，等人修。**
 */
async function findNameClash(token, name, folderId, photoId, expectedSize) {
  const q = [
    `name = '${escapeQ(name)}'`,
    `mimeType != 'application/vnd.google-apps.folder'`,
    'trashed = false',
    `'${folderId}' in parents`,
  ].join(' and ')

  const url = `${DRIVE}/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,size,appProperties)&pageSize=100`
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw await driveThrow(WHERE.listClash, res)
  const files = (await res.json()).files || []

  for (const file of files) {
    if (file.appProperties?.quotePhotoId === photoId) continue
    // 連大細都一樣都唔算數 —— 冇 quotePhotoId 就係唔知邊張相，⛔ 唔准當佢係。
    return { id: file.id, size: file.size, sameSize: String(file.size) === String(expectedSize) }
  }
  return null
}

/** 攞返一個檔嘅大細，用嚟上完之後對數。攞唔到就回 null（⛔ 唔准當佢啱）。 */
async function driveFileSize(token, fileId) {
  const res = await fetch(`${DRIVE}/files/${fileId}?fields=size`, {
    headers: { authorization: `Bearer ${token}` },
  })
  // ⛔ 照舊回 `null`（＝「唔知」，⛔ 唔當佢啱）—— ⚠️ 但⛔ 唔准再靜靜咁過骨：
  //    呢個位撞 429 係查案嘅線索，冇咗就連「原來上載成功咗但對唔到數」都唔知。
  if (!res.ok) {
    console.error((await driveThrow(WHERE.getSize, res)).message)
    return null
  }
  const size = (await res.json()).size
  return size === undefined ? null : size
}

async function uploadToDrive(token, name, folderId, bytes, photoId) {
  const boundary = 'quoteapp' + name.length + bytes.byteLength
  // ⛔ `appProperties.quotePhotoId` 係之後認返「邊張相」嘅唯一根據，
  //    唔可以靠檔名（I7）。
  const meta = JSON.stringify({ name, parents: [folderId], appProperties: { quotePhotoId: photoId } })
  const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: image/jpeg\r\n\r\n`
  const tail = `\r\n--${boundary}--`
  const enc = new TextEncoder()
  const body = new Blob([enc.encode(head), bytes, enc.encode(tail)])

  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw await driveThrow(WHERE.upload, res)
  return (await res.json()).id
}

/** ⛔ 攞唔到就係「未知」，唔准當佢充足（`docs/開發紀錄.md` §九）。 */
async function driveQuota(token) {
  try {
    const res = await fetch(`${DRIVE}/about?fields=storageQuota`, {
      headers: { authorization: `Bearer ${token}` },
    })
    // ⛔ 照舊回「唔知」，⛔ 唔當佢充足 —— 但一樣要留低點解攞唔到。
    if (!res.ok) {
      console.error((await driveThrow(WHERE.getQuota, res)).message)
      return { known: false }
    }
    const q = (await res.json()).storageQuota || {}
    if (q.limit === undefined || q.usage === undefined) return { known: false }
    const remaining = Number(q.limit) - Number(q.usage)
    return { known: true, remaining, low: remaining < DRIVE_WARN_BYTES }
  } catch {
    return { known: false }
  }
}

/** PostgREST。⛔ 呢個 Worker 永遠只傳用家個 token 入嚟。 */
async function pg(env, token, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`資料庫回覆 ${res.status}`)
  return res.json()
}

/**
 * 匯出 PDF 要攞返張相嘅 bytes。⇒ 出一條**淨係讀**嘅簽名網址。
 *
 * ⛔⛔ 點解唔用 `/sign`：`/sign` 個 key 係 `${呼叫者 userId}/${operationId}.jpg` ——
 *    即係話你淨係簽得到**自己**嗰啲。阿耀影嘅相，Jason 喺辦公室匯出 PDF 就簽唔到，
 *    出嚟嘅 PDF 會靜靜咁少咗幾張相。⇒ 呢度一律用行入面嗰個 `r2_key`。
 *
 * ⭐ 把關全部交返 RLS：由頭到尾用**用家個 token** 去 select。
 *    佢睇唔到嗰行，`rows[0]` 就係 undefined ⇒ 404。
 *    ⛔ 唔准用 service role key，⛔ 唔准喺呢度自己寫一套「邊個睇得」嘅邏輯 ——
 *    兩套講法一定會有一日唔一致，而唔一致嗰邊就係漏。
 *
 * ⛔ 只出 GET。⛔ 唔准喺呢條路徑度順手畀 PUT／DELETE。
 */
async function readUrl(request, env, origin) {
  const auth = request.headers.get('authorization') ?? ''
  const userId = await userIdFrom(request, env)
  if (!userId) return json({ error: 'unauthorized' }, 401, origin)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad json' }, 400, origin)
  }
  if (typeof body?.photoId !== 'string' || !UUID.test(body.photoId)) {
    return json({ error: 'bad photoId' }, 400, origin)
  }

  const userToken = auth.slice('Bearer '.length)

  try {
    const rows = await pg(
      env,
      userToken,
      `quote_photos?id=eq.${body.photoId}&select=r2_key,r2_synced_at`,
    )
    const photo = rows[0]
    if (!photo) return json({ error: 'not found' }, 404, origin)

    // ⛔ 未上到 R2 就冇 bytes 可以讀。⛔ 唔准出條網址扮有 —— 出嚟會係一個 404 圖。
    if (!photo.r2_synced_at || !photo.r2_key) {
      return json({ ok: false, message: '這張相片尚未上傳到雲端，未能讀取。' }, 409, origin)
    }

    return json({ ok: true, get: await presign('GET', env, photo.r2_key) }, 200, origin)
  } catch (caught) {
    return json({ error: String(caught?.message ?? caught).slice(0, 300) }, 502, origin)
  }
}

async function mirror(request, env, origin) {
  const auth = request.headers.get('authorization') ?? ''
  const userId = await userIdFrom(request, env)
  if (!userId) return json({ error: 'unauthorized' }, 401, origin)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad json' }, 400, origin)
  }
  if (typeof body?.photoId !== 'string' || !UUID.test(body.photoId)) {
    return json({ error: 'bad photoId' }, 400, origin)
  }

  const userToken = auth.slice('Bearer '.length)

  try {
    // ⛔ 由頭到尾都係用家個 token。
    const rows = await pg(env, userToken, `quote_photos?id=eq.${body.photoId}&select=*`)
    const photo = rows[0]
    if (!photo) return json({ error: 'not found' }, 404, origin)

    // 已經上咗就當成功 —— 同 P3a 個 23505 一樣，重試唔會整多一份。
    if (photo.drive_synced_at) {
      return json({ ok: true, alreadyDone: true, driveFileId: photo.drive_file_id }, 200, origin)
    }
    if (!photo.r2_synced_at) {
      return json({ ok: false, message: '這張相片尚未上傳到 R2，未輪到複製去 Drive。' }, 409, origin)
    }

    const records = await pg(
      env,
      userToken,
      `quote_records?id=eq.${photo.record_id}&select=record_date,name`,
    )
    const record = records[0]
    if (!record) {
      return json({ ok: false, message: '無法檢索這張相片屬於哪個工程，或者你沒有查看權限。' }, 403, origin)
    }

    // ⭐ 冇樹 ＝ 環境相（成個工程一份）。檔名另一套：`Site_01.jpg`（Jason 2026-08-24 拍板）。
    // ⛔ 唔可以行返樹相嗰條路 —— `safeFilename('')` 會出 `untitled`，
    //    Drive 上面就會見到 `untitled_Whole View_01_Before.jpg`。
    let filename
    if (photo.tree_id) {
      const trees = await pg(env, userToken, `quote_trees?id=eq.${photo.tree_id}&select=tree_no`)
      const treeNo = trees[0]?.tree_no ?? ''
      const token = photo.mitigation ? MITIGATION_TOKENS[photo.mitigation] : 'Whole View'
      filename = photoFilename(treeNo, token, photo.seq)
    } else {
      filename = sitePhotoFilename(photo.seq)
    }

    if (!filename) {
      // 砌唔到檔名有兩個原因，兩個都要講到明，⛔ 唔好靜靜跳過、更加唔准靠估。
      const why =
        photo.seq < 1
          ? `這張相片的次序是 ${photo.seq}，並不正確（要由 1 開始數），無法組合 Drive 檔名。請截圖並聯絡 Jason。`
          : '這個工序沒有對應的類別名，無法組合 Drive 檔名。請在「修剪」勾選一個細項。'
      await patchPhoto(env, userToken, photo.id, { drive_error: why })
      return json({ ok: false, message: why }, 409, origin)
    }

    const gtoken = await googleToken(env)
    const quota = await driveQuota(gtoken)

    const rootId = await ensureFolder(gtoken, env.DRIVE_ROOT_FOLDER_NAME, null)
    const folderId = await ensureFolder(
      gtoken,
      projectFolderName(record.record_date, record.name),
      rootId,
    )

    // ⛔ 「已經抄咗」淨係認呢一行自己個 id，唔認檔名（I7）。
    let fileId = await findMirroredFile(gtoken, photo.id, folderId)

    if (!fileId) {
      const clash = await findNameClash(gtoken, filename, folderId, photo.id, photo.size_bytes)
      if (clash) {
        const why =
          `Drive 上面已經有一個叫「${filename}」的檔案，但它不是這張相片` +
          `（${clash.sameSize ? '大小相同但無法辨認是哪一張' : '連大小都不同'}）。` +
          `不會覆蓋，亦不會當作是同一張。請截圖並聯絡 Jason。`
        await patchPhoto(env, userToken, photo.id, { drive_error: why })
        return json({ ok: false, message: why }, 409, origin)
      }

      const getUrl = await presign('GET', env, photo.r2_key)
      const r2 = await fetch(getUrl)
      if (!r2.ok) throw new Error(`R2 無法取回（${r2.status}）`)
      const bytes = await r2.arrayBuffer()
      // ⛔ 原封不動上去。唔准喺呢度再壓一次 —— 再壓 sha256 就唔同，
      //    「仲剩幾多份」個契約即刻驗唔到（docs/開發紀錄.md §九）。
      fileId = await uploadToDrive(gtoken, filename, folderId, bytes, photo.id)

      // ⛔ 上完即刻讀返出嚟對大細 —— 對唔到就唔准寫「抄咗」。
      const check = await driveFileSize(gtoken, fileId)
      if (check !== null && photo.size_bytes !== null && String(check) !== String(photo.size_bytes)) {
        const why = `複製上 Drive 之後核對不符：R2 ${photo.size_bytes} bytes，Drive ${check} bytes。這張相片未算複製成功。`
        await patchPhoto(env, userToken, photo.id, { drive_error: why })
        return json({ ok: false, message: why }, 502, origin)
      }
    }

    await patchPhoto(env, userToken, photo.id, {
      drive_file_id: fileId,
      drive_synced_at: new Date().toISOString(),
      drive_error: '',
    })

    return json({ ok: true, alreadyDone: false, driveFileId: fileId, filename, quota }, 200, origin)
  } catch (caught) {
    const message = String(caught?.message ?? caught).slice(0, 300)
    // ⛔ 失敗一定要留低痕跡，唔准靜靜過骨。
    try {
      await patchPhoto(env, userToken, body.photoId, { drive_error: message })
    } catch {
      /* 連寫錯誤都寫唔入，就只可以靠回覆講 */
    }
    return json({ ok: false, message }, 502, origin)
  }
}

/**
 * 改樹牌 ⇒ 連 Drive 檔名一齊改（Jason 2026-08-24 拍板，P3f §4）。
 *
 * ⛔⛔ **由頭到尾用家自己個 token**（CLAUDE.md §2.9）—— ⛔ 冇 `service_role`。
 *    ⚠️ 即係話呢條路**淨係喺人仲登住入嗰陣行得**，⛔ 唔可以有 cron 幫手補。
 *
 * ⭐ 呼叫嗰邊**要先改好 `quote_trees.tree_no`**，先至叫呢條 —— 呢度讀返 DB
 *   嗰個**新**樹牌，⛔ 唔收呼叫者傳入嚟嘅名。
 *   ⚠️ 收就會出現「DB 一個名、Drive 另一個名」而兩邊都以為自己啱。
 *
 * ⛔ 一次最多改 `RENAME_BATCH_MAX` 個，改唔晒回 `hitLimit: true`，
 *    ⛔ 唔准靜靜咁改一半就報成功。
 */
async function renameTree(request, env, origin) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'no token' }, 401, origin)
  const userToken = auth.slice('Bearer '.length)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad json' }, 400, origin)
  }
  if (!body?.treeId) return json({ error: 'treeId 沒有傳入' }, 400, origin)

  try {
    // ⛔ 讀返 DB 嗰個新樹牌，⛔ 唔信呼叫者傳入嚟嘅名。
    const trees = await pg(env, userToken, `quote_trees?id=eq.${body.treeId}&select=tree_no`)
    const tree = trees[0]
    if (!tree) return json({ ok: false, message: '無法檢索這棵樹，或者你沒有查看權限。' }, 404, origin)

    const photos = await pg(
      env,
      userToken,
      // ⛔ 冇 `drive_name` 呢個欄（得 drive_file_id / drive_synced_at / drive_error）——
      //    「而家叫乜」問 Drive 攞，見下面。
      `quote_photos?tree_id=eq.${body.treeId}&select=id,seq,mitigation,drive_file_id`,
    )

    const plan = renamePlan(tree.tree_no, photos)
    const batch = plan.todo.slice(0, RENAME_BATCH_MAX)
    const hitLimit = plan.todo.length > batch.length

    let renamed = 0
    let alreadyOk = 0
    const failed = []

    if (batch.length > 0) {
      const gtoken = await googleToken(env)
      for (const item of batch) {
        try {
          /* ⭐ 一個請求攞埋「而家叫乜」同「喺邊個資料夾」—— ⛔ 唔使兩個來回。
             ⚠️ Drive 自己先係「個檔叫乜」嘅真相；DB 冇呢個欄，⛔ 亦唔應該有一份副本。 */
          const now = await driveNameAndParent(gtoken, item.fileId)

          // ⭐ 已經叫啱 ⇒ ⛔ 唔郁。呢個就係「重試係安全嘅」嗰個保證。
          if (!needsRename(now?.name ?? null, item.name)) {
            alreadyOk += 1
            continue
          }

          /* ⛔⛔ 撞名保護（I7）—— ⛔ 改名之前一定要查。
             ⚠️ Drive 容許同名：兩棵樹改到撞埋，兩個檔就會一模一樣名，
                之後冇人分得開邊個係邊個。⭐ 寧願唔改、出聲等人修。
             ⚠️ `findNameClash` 會跳過 `quotePhotoId` 等於自己嗰個。 */
          if (now?.parent) {
            const clash = await findNameClash(gtoken, item.name, now.parent, item.photoId, null)
            if (clash) {
              failed.push({
                photoId: item.photoId,
                why: `Drive 上已經有另一個檔案叫「${item.name}」，⛔ 不會冒險修改（改了兩個檔案就會同名）。請截圖並聯絡 Jason。`,
              })
              continue
            }
          }

          await driveRename(gtoken, item.fileId, item.name)
          renamed += 1
        } catch (err) {
          failed.push({ photoId: item.photoId, why: String(err?.message || err) })
        }
      }
    }

    const message = renameSummary({
      renamed,
      failed: failed.length,
      cannot: plan.cannot.length,
      hitLimit,
    })

    return json(
      {
        // ⛔ 有任何一樣未搞掂就⛔ 唔准回 ok: true —— 呼叫嗰邊靠佢決定出唔出橫幅。
        ok: failed.length === 0 && plan.cannot.length === 0 && !hitLimit,
        treeNo: tree.tree_no,
        renamed,
        alreadyOk,
        notMirrored: plan.notMirrored,
        hitLimit,
        failed,
        cannot: plan.cannot,
        message,
      },
      200,
      origin,
    )
  } catch (err) {
    return json({ ok: false, message: String(err?.message || err) }, 502, origin)
  }
}

/**
 * 一個檔**而家叫乜**、**喺邊個資料夾** —— 一個請求攞晒。
 *
 * ⛔ 攞唔到回 `null` ⇒ 上面會**照改**（⛔ 唔當佢已經啱），
 *    同時**跳過撞名檢查**（⛔ 唔係當佢冇撞，係查唔到）。
 * ⚠️ 兩邊都揀咗「寧願多做一次」—— ⭐ 改成同一個名冇後果，漏咗一個舊名先係真問題。
 */
async function driveNameAndParent(token, fileId) {
  const res = await fetch(`${DRIVE}/files/${fileId}?fields=name,parents`, {
    headers: { authorization: `Bearer ${token}` },
  })
  // ⛔ 照舊回 `null`（＝「查唔到」）—— ⚠️ 但⛔ 唔准靜靜過骨。
  //    ⭐ 呢個位撞 429 特別緊要：回 null ⇒ 上面會**跳過撞名檢查照改**，
  //       即係一個限流錯誤會靜靜咁令一道保險失效。
  if (!res.ok) {
    console.error((await driveThrow(WHERE.getName, res)).message)
    return null
  }
  const body = await res.json()
  const parents = body.parents
  return {
    name: body.name ?? null,
    parent: Array.isArray(parents) && parents.length ? parents[0] : null,
  }
}

/** 淨係改個名。⛔ 唔郁 parents、⛔ 唔郁 appProperties（`quotePhotoId` 係認人嘅根據）。 */
async function driveRename(token, fileId, name) {
  const res = await fetch(`${DRIVE}/files/${fileId}?fields=id,name`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw await driveThrow(WHERE.rename, res)
  return res.json()
}

/**
 * 寫返 `quote_photos`。
 *
 * ⛔ 用 `return=representation` 唔用 `return=minimal` ——
 * RLS 唔會 throw，佢只係令 0 行受影響。攞返行出嚟先知係咪真係寫到
 * （`CLAUDE.md` §2.6：0 行一定要當被拒絕）。
 */
async function patchPhoto(env, token, id, values) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/quote_photos?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(values),
  })
  if (!res.ok) throw new Error(`寫返資料庫失敗（${res.status}）`)
  const rows = await res.json()
  if (!rows.length) {
    throw new Error('資料庫不允許修改這張相片的紀錄。可能所屬工程已經鎖定，或者不是你建立的工程。')
  }
  return rows[0]
}

/**
 * 喺一張相度打個「清咗」嘅剔。**⛔ 佢刪唔到任何嘢。**
 *
 * ⭐⭐ **Jason 2026-09-20 批嘅就係呢一道門，⛔ 逐字記住：**
 *   > 「一道好窄嘅後門，得一個用途：喺張相度打個『清咗』嘅剔，⛔ 刪唔到任何嘢。」
 *   ⛔ 佢批嘅**⛔ 唔係**「一個 `SECURITY DEFINER` 隨便點寫都得」。
 *   ⚠️⚠️ 將來有人想加第二個 `SECURITY DEFINER`，⛔ 唔准攞今次當先例。
 *
 * ⛔⛔ **點解唔可以直接 `PATCH quote_photos`**（我本來就係咁寫）：
 *   `quote_photos` 條 update policy 係 `can_edit_quote_record(record_id)`，
 *   而嗰條 function 入面有 `r.deleted_at is null`，**而且喺 OR 括號外面**
 *   ⇒ 連 `is_quote_admin()` 都繞唔到 ⇒ **一單已刪工程，冇任何人改得到佢啲相**
 *   ⇒ 直接 PATCH **一定 0 行，而且⛔ 唔會報錯**（CLAUDE.md §2.6）。
 *   （Jason 2026-09-20 跑只讀查詢攞返原文，見 `docs/P8-purge-權限-選項表.md` §0。）
 *
 * ⭐ `dryRun` 就係 CLAUDE.md §2.13 個「問准」：**同一條 function、同一段判斷**，
 *   ⛔ 唔係第二套「邊個刪得」嘅講法。
 *
 * ⛔⛔ 回四個值，⛔ 唔准合埋（`not_found` ⛔ 唔係「拒絕」嘅一種）：
 *   `ok` / `record_not_deleted` / `not_yours` / `not_found`
 *
 * ⚠️⚠️ **`ok` ⛔ 唔等於「今次係我打嘅剔」。**
 *    條 function 入面個 `update` 有 `and purged_at is null` —— 已經打咗剔就
 *    **影響 0 行，但照樣回 `ok`**（特登嘅：保住「第一次清走係幾時」）。
 *    ⇒ ⛔ **唔准靠個回值去數「今次清咗幾多張」。**
 *    ⭐ 呢度個 `purged` 數得準，係因為**上面 `purgePlan()` 已經把
 *      `purged_at` 有值嗰啲隔咗去 `done`** —— ⛔ 唔係因為個回值分得開。
 *    ⚠️ 邊日有人拆走嗰個隔篩，呢個數就會靜靜咁變成「掃過幾多張」。
 */
const PURGE_STAMP_WHY = {
  record_not_deleted:
    '這一單工程並未刪除，⛔ 不會清走它的相片。如果確實要刪除，請先在工程頁刪除這一單。',
  /*
   * ⛔⛔ **呢句要指名**（CLAUDE.md §2.7：搵邊個 ＋ 做乜）。
   *
   * ⚠️⚠️ 2026-09-22 CO 捉到：本來寫「請找建立這一單的人，或者截圖聯絡 Jason」——
   *    ⛔ 少咗最重要嗰半：**點樣先做得到**。
   *
   * ⭐ 閘二係 `v_mine or is_quote_admin()` ⇒ 清得到嘅只有
   *   **開單嗰個人** 或者 **`quote_admins` 入面嘅人**。
   *   2026-09-22 實況（Jason 自己跑 `join auth.users` 確認）：
   *     `quote_admins` 有 **2 個人：Jason、Anna**。
   *     ⚠️ **阿耀同阿聰⛔ 唔係 admin** —— 而阿耀係主力開單嗰個，
   *        阿聰主力做工程 ⇒ **阿聰清一單阿耀開嘅工程就會撞到呢句**。
   *        ⛔ 呢個⛔ 唔係理論情況。
   *
   * ⛔⛔ **呢句寫死咗兩個名，佢會同 `quote_admins` 飄開。**
   *    ⇒ 改 `quote_admins`（加人／減人）嗰陣，**⛔ 要返嚟改埋呢一行**。
   *    ⚠️ ⛔ 冇尺守得住呢樣 —— 一個 Worker 嘅字串⛔ 對唔到 DB 一張表。
   *      ⭐ 所以 `docs/P8-purged_at-草稿.sql` 第 0 段 ③-2 都寫咗同一句。
   */
  not_yours:
    '這一單不是你建立的，你不能清走它的相片。請找建立這一單的同事幫手，或者找管理員（Jason 或 Anna）代勞。',
  not_found:
    '⛔ 在資料庫找不到這張相片的紀錄 —— ⛔ 這不應該發生（剛才才從資料庫讀到它）。⛔ 沒有清走任何東西。請截圖並聯絡 Jason。',
}

async function purgeStamp(env, token, photoId, dryRun) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/quote_purge_stamp`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_photo_id: photoId, p_dry_run: dryRun }),
  })
  if (!res.ok) {
    /* ⛔ 條 function 未跑（`docs/P8-purged_at-草稿.sql` 第 2 段）就會 404。
       ⛔ 唔准靜靜當佢係「拒絕」—— 兩件事嘅修法完全唔同。 */
    if (res.status === 404) {
      throw new Error(
        '伺服器還未安裝清走相片的功能（quote_purge_stamp）。⛔ 沒有清走任何東西。請截圖並聯絡 Jason。',
      )
    }
    throw new Error(`資料庫回覆 ${res.status}，未能確認可否清走這張相片。⛔ 沒有清走任何東西。`)
  }
  const out = await res.json()
  if (out === 'ok') return
  throw new Error(PURGE_STAMP_WHY[out] ?? `資料庫回覆了一個看不懂的結果「${String(out).slice(0, 60)}」。請截圖並聯絡 Jason。`)
}

/**
 * 掉一個 Drive 檔入垃圾桶。⛔ **唔係真刪**（Jason 2026-09-19 拍板）。
 *
 * ⭐ 多一道 30 日嘅網 —— 而「無法還原」呢句喺 **app 層面**仍然係真嘅：
 *   app 攞唔返，⛔ 只有人手入 Drive 垃圾桶先撈得返。
 *
 * ⚠️ 對一個**已經喺垃圾桶**嘅檔再 trash 一次會回 200 ⇒ ⭐ 重試係安全嘅。
 * ⛔ 回個 status 出去，⛔ 唔喺呢度判斷「算唔算掉咗」——
 *   嗰個判斷喺 `purge.mjs` 個 `driveGone()`，有測試釘住。
 */
async function driveTrash(token, fileId) {
  const res = await fetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  return res.status
}

/**
 * P8 步 3：一單工程刪咗之後，**真係清走雲端嗰兩份相**。
 *
 * ⛔⛔ 次序、點解、同埋三種相點分，全部喺 `worker/src/purge.mjs` 檔頭。
 *    ⛔ 唔好喺呢度再寫一次 —— 兩份講法一定會有一日唔一致。
 *
 * ⛔⛔ **兩道閘喺掂任何 bytes 之前：**
 *
 *   閘一 · **母單一定要真係刪咗**（`quote_records.deleted_at` 有值）。
 *     ⚠️ 冇呢道閘，一個 `recordId` 就可以清走一單**仲用緊**嘅工程所有相。
 *     ⭐ 而 `quote_records` 條 select policy 係 `using (true)` ⇒ 人人讀得晒
 *       ⇒ ⛔ 「攞到個 recordId」完全唔係一個權限。
 *
 *   閘二 · **問准**（見 `purge.mjs` 檔頭 ①）—— `quote_purge_stamp(id, true)`。
 *     ⛔ 唔准就掟錯 ⇒ ⛔ 一個 byte 都唔掂。
 *
 * ⚠️ 閘一喺呢度（Worker），閘二喺 DB 條 function 入面 —— ⭐ **兩個地方係特登嘅**：
 *   Worker 嗰道擋得早（慳 subrequest、出到中文原因），DB 嗰道**繞唔過**
 *   （就算有人直接叫 RPC 都一樣要過）。⛔ 唔准因為「重複咗」而拆走任何一道。
 *
 * ⛔ 呢條路由頭到尾行**用家自己個 token**，靠 RLS 攔（CLAUDE.md §2.9）。
 *   ⛔ 一個 `service_role` key 都冇。
 */
async function purgeRecord(request, env, origin) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'no token' }, 401, origin)
  const userToken = auth.slice('Bearer '.length)

  const userId = await userIdFrom(request, env)
  if (!userId) return json({ error: 'unauthorized' }, 401, origin)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad json' }, 400, origin)
  }
  if (typeof body?.recordId !== 'string' || !UUID.test(body.recordId)) {
    return json({ error: 'bad recordId' }, 400, origin)
  }

  try {
    // ── 閘一：母單真係刪咗未 ──────────────────────────────────────
    const records = await pg(
      env,
      userToken,
      `quote_records?id=eq.${body.recordId}&select=id,deleted_at`,
    )
    const record = records[0]
    if (!record) {
      return json({ ok: false, message: '找不到這一單工程，或者你沒有查看權限。' }, 404, origin)
    }
    if (!record.deleted_at) {
      /* ⛔⛔ 呢個⛔ 唔係一個「順手檢查」—— 佢係最後一道擋住「清走一單仲用緊嘅工程」
         嘅嘢。⚠️ 出中文，而且要講得出下一步（CLAUDE.md §2.7）。 */
      return json(
        {
          ok: false,
          message: '這一單工程並未刪除，⛔ 不會清走它的相片。如果確實要刪除，請先在工程頁刪除這一單。',
        },
        409,
        origin,
      )
    }

    const photos = await pg(
      env,
      userToken,
      `quote_photos?record_id=eq.${body.recordId}&select=id,r2_key,drive_file_id,purged_at`,
    )

    const plan = purgePlan(photos)
    /* ⭐ `nothing`（雲端兩邊都冇）一樣要 stamp —— ⛔ 唔 stamp 就會永遠留喺
       「未清完」，設定頁嗰行永遠出一個減唔落嘅數。 */
    const queue = [...plan.todo, ...plan.nothing.map((id) => ({ photoId: id, r2Key: null, driveFileId: null }))]
    const batch = queue.slice(0, PURGE_BATCH_MAX)
    const hitLimit = queue.length > batch.length

    /* ⛔ 冇 Drive 檔要掉就⛔ 唔好攞 token —— 慳一個 subrequest，
       而且一單全部都係「只剩部機一份」嘅工程唔應該因為 Google 出事而清唔到。 */
    const needDrive = batch.some((item) => item.driveFileId)
    const gtoken = needDrive ? await googleToken(env) : null

    let purged = 0
    const failed = []

    for (const item of batch) {
      try {
        /* ── 閘二：問准 ──────────────────────────────────────────
           ⛔⛔ 行**同一條 function**，淨係 `dryRun = true` ⇒ 一個字都唔寫。
           ⭐ 同一段判斷、同一個出口（CLAUDE.md §2.13）——
              ⛔ 唔另外寫一套「邊個刪得」嘅判斷。
           俾人拒就喺呢度掟錯，bytes 一個都唔掂。 */
        await purgeStamp(env, userToken, item.photoId, true)

        // ── ② R2 ──────────────────────────────────────────────
        if (item.r2Key) {
          const res = await fetch(await presign('DELETE', env, item.r2Key), { method: 'DELETE' })
          if (!r2Gone(res.status)) {
            throw new Error(`雲端儲存（R2）回覆 ${res.status}，未能確認相片已經清走。`)
          }
        }

        // ── ③ Drive（掉垃圾桶，⛔ 唔係真刪）────────────────────
        if (item.driveFileId && gtoken) {
          const status = await driveTrash(gtoken, item.driveFileId)
          if (!driveGone(status)) {
            throw new Error(`Google Drive 回覆 ${status}，未能確認相片已經掉進垃圾桶。`)
          }
        }

        /* ── ④ stamp ──────────────────────────────────────────
           ⛔⛔ 一定要喺 ②③ 之後。⚠️ 上面任何一步掟錯，就行唔到落嚟
           ⇒ `purged_at` 留空 ⇒ ⭐ 嗰行就係「未清完」呢個狀態本身，
             ⛔ 唔使另開一張表、⛔ 唔使另外記帳，下次撳「繼續清」會再執佢。 */
        await purgeStamp(env, userToken, item.photoId, false)
        purged += 1
      } catch (err) {
        failed.push({ photoId: item.photoId, why: String(err?.message || err).slice(0, 300) })
      }
    }

    const message = purgeSummary({
      purged,
      alreadyDone: plan.done.length,
      nothingToClear: plan.nothing.length,
      failed: failed.length,
      hitLimit,
    })

    return json(
      {
        // ⛔ 有任何一樣未搞掂就⛔ 唔准回 ok: true —— 前端靠佢決定出唔出「繼續清」。
        ok: failed.length === 0 && !hitLimit,
        recordId: body.recordId,
        purged,
        alreadyDone: plan.done.length,
        nothingToClear: plan.nothing.length,
        remaining: queue.length - batch.length,
        hitLimit,
        failed,
        message,
      },
      200,
      origin,
    )
  } catch (err) {
    return json({ ok: false, message: String(err?.message || err) }, 502, origin)
  }
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
        },
      })
    }

    const url = new URL(request.url)

    if (url.pathname === '/read' && request.method === 'POST') {
      return readUrl(request, env, origin)
    }

    if (url.pathname === '/rename-tree' && request.method === 'POST') {
      return renameTree(request, env, origin)
    }

    if (url.pathname === '/mirror' && request.method === 'POST') {
      return mirror(request, env, origin)
    }

    if (url.pathname === '/purge' && request.method === 'POST') {
      return purgeRecord(request, env, origin)
    }

    if (url.pathname !== '/sign' || request.method !== 'POST') {
      return json({ error: 'not found' }, 404, origin)
    }

    // ⛔⛔ 由呢度落去一定要有 try/catch。
    //
    // ⚠️ 2026-09-05 查一單「Failed to fetch」查咗成粒鐘先發現：呢段本來冇 catch。
    //    `userIdFrom` 會打 Supabase，`presign` 會做 HMAC —— 任何一個掟錯，
    //    Cloudflare 就會出一版**佢自己嘅錯誤頁**，而嗰版⛔ 冇 CORS header。
    //    ⇒ 瀏覽器唔會話你知伺服器出咗咩事，佢只會話 `Failed to fetch`，
    //      同「部機冇網」一模一樣。⛔ 兩件完全唔同嘅事，出同一句嘢。
    //
    // ⭐ 有咗 catch，出嘅係一個帶 CORS header 嘅 JSON ⇒ 前端睇得到真原因。
    try {
      const userId = await userIdFrom(request, env)
      if (!userId) return json({ error: 'unauthorized' }, 401, origin)

      let body
      try {
        body = await request.json()
      } catch {
        return json({ error: 'bad json' }, 400, origin)
      }

      // 影相編號一定要係 UUID：唔係就有得砌出 `../` 咁嘅檔名。
      if (typeof body?.operationId !== 'string' || !UUID.test(body.operationId)) {
        return json({ error: 'bad operationId' }, 400, origin)
      }

      const key = `${userId}/${body.operationId}.jpg`

      return json(
        {
          key,
          put: await presign('PUT', env, key),
          get: await presign('GET', env, key),
        },
        200,
        origin,
      )
    } catch (caught) {
      // ⛔ 唔准靜靜過骨。⛔ 亦唔准當佢係「冇網」—— 呢個係伺服器側出事。
      const message = String(caught?.message ?? caught).slice(0, 300)
      return json({ error: `簽名服務出錯：${message}` }, 502, origin)
    }
  },
}
