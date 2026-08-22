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

import { MITIGATION_TOKENS, photoFilename, projectFolderName } from './names.mjs'

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
  if (!res.ok) throw new Error(`Drive 登入失敗（${res.status}）`)
  return (await res.json()).access_token
}

function escapeQ(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function driveList(token, q) {
  const url = `${DRIVE}/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name)&pageSize=100`
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Drive 查詢失敗（${res.status}）`)
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

  const existing = (await driveList(token, q)).map((f) => f.id).sort()
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
  if (!res.ok) throw new Error(`Drive 開資料夾失敗（${res.status}）`)
  const mine = (await res.json()).id

  const after = (await driveList(token, q)).map((f) => f.id).sort()
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
  const files = await driveList(token, q)
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
  if (!res.ok) throw new Error(`Drive 查詢失敗（${res.status}）`)
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
  if (!res.ok) return null
  const size = (await res.json()).size
  return size === undefined ? null : size
}

async function uploadToDrive(token, name, folderId, bytes, photoId, compressFallback) {
  const boundary = 'quoteapp' + name.length + bytes.byteLength
  // ⛔ `appProperties.quotePhotoId` 係之後認返「邊張相」嘅唯一根據，
  //    唔可以靠檔名（I7）。
  //
  // ⛔ `compressFallback` 有值 = **呢張係原相，唔係 2400/0.80**。
  //    留低係因為 fallback 唔准靜靜咁發生：張原相會同其他相混埋一齊，
  //    冇呢個記號就冇人知邊張係。⚠️ 佢淨係喺 Drive metadata 度，
  //    **阿耀喺現場完全睇唔到**。
  const appProperties = { quotePhotoId: photoId }
  if (compressFallback) appProperties.compressFallback = String(compressFallback).slice(0, 120)
  const meta = JSON.stringify({ name, parents: [folderId], appProperties })
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
  if (!res.ok) throw new Error(`Drive 上載失敗（${res.status}）`)
  return (await res.json()).id
}

/** ⛔ 攞唔到就係「未知」，唔准當佢充足（`docs/開發紀錄.md` §九）。 */
async function driveQuota(token) {
  try {
    const res = await fetch(`${DRIVE}/about?fields=storageQuota`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { known: false }
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
      return json({ ok: false, message: '呢張相仲未上到 R2，未輪到抄去 Drive。' }, 409, origin)
    }

    const records = await pg(
      env,
      userToken,
      `quote_records?id=eq.${photo.record_id}&select=record_date,name`,
    )
    const record = records[0]
    if (!record) {
      return json({ ok: false, message: '揾唔到呢張相屬邊一單，或者你冇權睇。' }, 403, origin)
    }

    let treeNo = ''
    if (photo.tree_id) {
      const trees = await pg(env, userToken, `quote_trees?id=eq.${photo.tree_id}&select=tree_no`)
      treeNo = trees[0]?.tree_no ?? ''
    }

    const token = photo.mitigation ? MITIGATION_TOKENS[photo.mitigation] : 'Whole View'
    const filename = photoFilename(treeNo, token, photo.seq)
    if (!filename) {
      // 砌唔到檔名有兩個原因，兩個都要講到明，⛔ 唔好靜靜跳過、更加唔准靠估。
      const why =
        photo.seq < 1
          ? `呢張相嘅次序係 ${photo.seq}，唔啱（要由 1 數起），砌唔到 Drive 檔名。請截圖搵 Jason。`
          : '呢個工序冇對應嘅類別名，砌唔到 Drive 檔名。請喺「修剪」揀返一個細項。'
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
          `Drive 上面已經有一個叫「${filename}」嘅檔，但佢唔係呢張相` +
          `（${clash.sameSize ? '大細啱但認唔到係邊張' : '連大細都唔同'}）。` +
          `唔會覆蓋、亦唔會當佢係同一張。請截圖搵 Jason。`
        await patchPhoto(env, userToken, photo.id, { drive_error: why })
        return json({ ok: false, message: why }, 409, origin)
      }

      const getUrl = await presign('GET', env, photo.r2_key)
      const r2 = await fetch(getUrl)
      if (!r2.ok) throw new Error(`R2 讀唔返出嚟（${r2.status}）`)
      const bytes = await r2.arrayBuffer()
      // ⛔ 原封不動上去。唔准喺呢度再壓一次 —— 再壓 sha256 就唔同，
      //    「仲剩幾多份」個契約即刻驗唔到（docs/開發紀錄.md §九）。
      fileId = await uploadToDrive(
        gtoken,
        filename,
        folderId,
        bytes,
        photo.id,
        typeof body.compressFallback === 'string' ? body.compressFallback : '',
      )

      // ⛔ 上完即刻讀返出嚟對大細 —— 對唔到就唔准寫「抄咗」。
      const check = await driveFileSize(gtoken, fileId)
      if (check !== null && photo.size_bytes !== null && String(check) !== String(photo.size_bytes)) {
        const why = `抄上 Drive 之後對唔到數：R2 ${photo.size_bytes} bytes，Drive ${check} bytes。呢張相未算抄到。`
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
    throw new Error('資料庫唔俾改呢張相嘅紀錄。可能母單已經鎖定，或者唔係你開嘅單。')
  }
  return rows[0]
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

    if (url.pathname === '/mirror' && request.method === 'POST') {
      return mirror(request, env, origin)
    }

    if (url.pathname !== '/sign' || request.method !== 'POST') {
      return json({ error: 'not found' }, 404, origin)
    }

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
  },
}
