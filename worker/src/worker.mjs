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
