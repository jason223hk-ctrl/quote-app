import { describe, expect, it, afterEach, vi } from 'vitest'
import worker from './worker.mjs'
import { MIRROR_STALE_MS, MIRROR_TRASH_MAX, pickWinner, trashable } from './mirrorDedupe.mjs'

/*
 * ══════════════════════════════════════════════════════════════════
 * `/mirror` 撞車收斂（兩部機／兩個 tab 同時抄同一張相）。
 *
 * ⛔ 要測嘅唔係「回咩」，係：
 *   · 大家揀中**同一份**（最早嗰份）
 *   · ⛔ 只掉**自己上嗰份**或者**舊到冇人做緊**嘅 —— 唔准掉別人啱啱上嗰份
 *   · DB 寫嘅係贏嗰份
 *   · 掉唔到唔會令成次失敗
 *   · ⛔ 外呼唔可以超過 Cloudflare 一個 request 50 個
 * ══════════════════════════════════════════════════════════════════
 */

const ENV = {
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_PUBLISHABLE_KEY: 'pk_test',
  ALLOWED_ORIGIN: 'https://sylvan-quote.pages.dev',
  R2_ACCOUNT_ID: 'acct',
  R2_BUCKET: 'quote-photos',
  R2_ACCESS_KEY_ID: 'ak',
  R2_SECRET_ACCESS_KEY: 'sk',
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'csec',
  GOOGLE_REFRESH_TOKEN: 'rt',
  DRIVE_ROOT_FOLDER_NAME: 'Quote Photos',
}

const RECORD = '11111111-1111-4111-8111-111111111111'
const PHOTO = '22222222-2222-4222-8222-222222222222'
const JOB_FOLDER = 'job-folder'
const SIZE = 1234

const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const ago = (ms) => new Date(Date.now() - ms).toISOString()

/**
 * 假 Drive ＋ 假 DB。⭐ 記低每一個外呼。
 *
 * @param before  上傳之前 `files.list` 見到嘅份（`[{ id, createdTime }]`）
 * @param after   上傳之後 `files.list` 見到嘅**別人**份（自己嗰份自動加；`lag: true` 就唔加）
 * @param dbTheirs 上傳之後再讀 DB，`drive_file_id` 係咩（模擬另一個 call 已經寫咗）
 * @param meta    `driveCopyMeta` 嗰個 GET 回咩
 * @param trash   `files.update trashed` 回咩 status
 * @param theirSize 別人份嘅大細
 */
function stub({ before = [], after = [], lag = false, dbTheirs = null, meta = null, trash = 200, theirSize = SIZE } = {}) {
  const calls = []
  const trashed = []
  const patches = []
  let listed = 0
  const fake = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input)
    const method = (init.method || 'GET').toUpperCase()
    const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '')

    if (url.includes('/auth/v1/user')) return calls.push('whoami'), reply({ id: 'user-1' })
    if (url.includes('oauth2.googleapis.com/token')) return calls.push('google-token'), reply({ access_token: 'gtok' })
    if (url.includes('/rest/v1/quote_photos') && method === 'GET') {
      if (url.includes('select=drive_file_id')) {
        calls.push('reread-photo')
        return reply([{ drive_file_id: dbTheirs }])
      }
      calls.push('read-photo')
      return reply([
        {
          id: PHOTO,
          record_id: RECORD,
          tree_id: null,
          seq: 1,
          r2_key: 'user-1/aaa.jpg',
          r2_synced_at: '2026-10-03T00:00:00Z',
          drive_synced_at: null,
          drive_file_id: null,
          size_bytes: SIZE,
        },
      ])
    }
    if (url.includes('/rest/v1/quote_photos') && method === 'PATCH') {
      calls.push('patch-photo')
      patches.push(JSON.parse(init.body))
      return reply([{ id: PHOTO }])
    }
    if (url.includes('/rest/v1/quote_records')) {
      calls.push('read-record')
      return reply([{ record_date: '2026-10-03', name: '測試工程' }])
    }
    if (url.includes('r2.cloudflarestorage.com')) return calls.push('r2-get'), new Response(new Uint8Array(SIZE))
    if (url.includes('/drive/v3/about')) return calls.push('quota'), reply({ storageQuota: { limit: '1e12', usage: '0' } })
    if (url.includes('/upload/drive/v3/files')) return calls.push('upload'), reply({ id: 'mine' })
    if (url.includes('/drive/v3/files?') && method === 'GET') {
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
        calls.push('list-folder')
        return reply({ files: [{ id: q.includes("'root' in parents") ? 'root-folder' : JOB_FOLDER }] })
      }
      if (q.includes('quotePhotoId')) {
        calls.push('list-copies')
        listed += 1
        if (listed === 1) return reply({ files: before })
        const mine = lag ? [] : [{ id: 'mine', createdTime: new Date().toISOString() }]
        return reply({ files: [...after, ...mine] })
      }
      if (q.includes('mimeType !=')) return calls.push('list-clash'), reply({ files: [] })
    }
    if (url.includes('/drive/v3/files/') && method === 'PATCH') {
      const id = decodeURIComponent(url.split('/files/')[1].split('?')[0])
      calls.push('trash')
      if (trash === 200) trashed.push(id)
      return reply({}, trash)
    }
    if (url.includes('/drive/v3/files/') && method === 'GET') {
      if (url.includes('fields=size')) {
        calls.push('get-size')
        return reply({ size: url.includes('/files/mine?') ? String(SIZE) : String(theirSize) })
      }
      if (url.includes('fields=id,createdTime')) {
        calls.push('get-meta')
        return meta ? reply(meta) : reply({}, 404)
      }
    }
    calls.push('⛔ 估唔到嘅外呼：' + method + ' ' + url)
    return new Response('', { status: 500 })
  })
  return { calls, trashed, patches, fake }
}

async function mirror(opts) {
  const s = stub(opts)
  const real = globalThis.fetch
  globalThis.fetch = s.fake
  vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const res = await worker.fetch(
      new Request('https://w.example.test/mirror', {
        method: 'POST',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ photoId: PHOTO }),
      }),
      ENV,
    )
    return { res, body: await res.json(), ...s }
  } finally {
    globalThis.fetch = real
  }
}

afterEach(() => vi.restoreAllMocks())

describe('pickWinner：最早嗰份贏，一樣早就 id 細嗰份', () => {
  it('冇檔 ⇒ null', () => {
    expect(pickWinner([])).toEqual({ winnerId: null, loserIds: [] })
  })
  it('最早贏；次序同輸入無關', () => {
    const a = { id: 'z', createdTime: '2026-10-03T01:00:00.000Z' }
    const b = { id: 'a', createdTime: '2026-10-03T02:00:00.000Z' }
    expect(pickWinner([a, b]).winnerId).toBe('z')
    expect(pickWinner([b, a]).winnerId).toBe('z')
  })
  it('一樣早 ⇒ id 細嗰份', () => {
    const t = '2026-10-03T01:00:00.000Z'
    expect(pickWinner([{ id: 'b', createdTime: t }, { id: 'a', createdTime: t }])).toEqual({
      winnerId: 'a',
      loserIds: ['b'],
    })
  })
  it('冇 createdTime ⇒ 排最尾；重複 id 只計一次', () => {
    const r = pickWinner([{ id: 'x' }, { id: 'y', createdTime: '2026-10-03T01:00:00Z' }, { id: 'y', createdTime: '2026-10-03T01:00:00Z' }])
    expect(r).toEqual({ winnerId: 'y', loserIds: ['x'] })
  })
})

describe('trashable：只掉自己嗰份、或者舊到冇人做緊嘅', () => {
  const now = Date.parse('2026-10-03T12:00:00Z')
  it('別人啱啱上 ⇒ ⛔ 唔掉；自己 ⇒ 掉；舊 ⇒ 掉；冇時間 ⇒ ⛔ 唔掉', () => {
    const files = [
      { id: 'recent', createdTime: new Date(now - 1000).toISOString() },
      { id: 'old', createdTime: new Date(now - MIRROR_STALE_MS).toISOString() },
      { id: 'mine', createdTime: null },
      { id: 'unknown' },
    ]
    expect(trashable(files, ['recent', 'old', 'mine', 'unknown'], 'mine', now)).toEqual(['mine', 'old'])
  })
  it(`一次最多 ${MIRROR_TRASH_MAX} 份`, () => {
    const files = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, createdTime: new Date(now - MIRROR_STALE_MS - i).toISOString() }))
    expect(trashable(files, files.map((f) => f.id), null, now)).toHaveLength(MIRROR_TRASH_MAX)
  })
})

describe('/mirror 收斂', () => {
  it('冇撞車 ⇒ 同以前一樣：上一份、寫自己個 id、⛔ 冇掉任何嘢', async () => {
    const { res, body, calls, patches } = await mirror()
    expect(res.status).toBe(200)
    expect(body.driveFileId).toBe('mine')
    expect(body.dedupe).toEqual({ trashed: 0, extra: 0 })
    expect(calls).not.toContain('trash')
    expect(patches.at(-1).drive_file_id).toBe('mine')
    expect(calls.filter((c) => c.startsWith('⛔'))).toEqual([])
  })

  it('另一個 call 早幾秒上咗 ⇒ 佢贏；掉**自己**嗰份；⛔ 唔掂佢嗰份；DB 寫佢個 id', async () => {
    const { body, trashed, patches, calls } = await mirror({ after: [{ id: 'theirs', createdTime: ago(3000) }] })
    expect(body.ok).toBe(true)
    expect(body.driveFileId).toBe('theirs')
    expect(trashed).toEqual(['mine'])
    expect(patches.at(-1).drive_file_id).toBe('theirs')
    expect(calls).toContain('get-size') // ⛔ 別人份都要對大細
  })

  it('自己最早、另一個 call 遲啲上 ⇒ 自己贏；⛔ 唔掉佢嗰份（佢自己會收返）', async () => {
    const later = new Date(Date.now() + 60_000).toISOString()
    const { body, trashed, patches } = await mirror({ after: [{ id: 'theirs', createdTime: later }] })
    expect(body.driveFileId).toBe('mine')
    expect(trashed).toEqual([])
    expect(patches.at(-1).drive_file_id).toBe('mine')
    expect(body.dedupe.extra).toBe(1)
  })

  it('⭐ 兩邊各自計 ⇒ 揀中同一份（模擬兩個 call 見到同一張清單）', () => {
    const files = [
      { id: 'b-file', createdTime: '2026-10-03T03:00:01.000Z' },
      { id: 'a-file', createdTime: '2026-10-03T03:00:00.500Z' },
    ]
    expect(pickWinner(files).winnerId).toBe(pickWinner([...files].reverse()).winnerId)
  })

  it('Drive 清單慢咗（見唔到別人份）⇒ 讀返 DB 個 id，佢早就佢贏', async () => {
    const { body, trashed, patches, calls } = await mirror({
      dbTheirs: 'theirs',
      meta: { id: 'theirs', createdTime: ago(5000), trashed: false, parents: [JOB_FOLDER], appProperties: { quotePhotoId: PHOTO } },
    })
    expect(calls).toContain('get-meta')
    expect(body.driveFileId).toBe('theirs')
    expect(trashed).toEqual(['mine'])
    expect(patches.at(-1).drive_file_id).toBe('theirs')
  })

  it('DB 個 id 唔喺呢個資料夾／唔係呢張相 ⇒ ⛔ 唔計佢', async () => {
    const { body, trashed } = await mirror({
      dbTheirs: 'elsewhere',
      meta: { id: 'elsewhere', createdTime: ago(5000), trashed: false, parents: ['other-folder'], appProperties: { quotePhotoId: PHOTO } },
    })
    expect(body.driveFileId).toBe('mine')
    expect(trashed).toEqual([])
  })

  it('Drive 清單慢咗連自己份都見唔到 ⇒ 照計埋自己嗰份', async () => {
    const { body, trashed } = await mirror({ lag: true })
    expect(body.driveFileId).toBe('mine')
    expect(trashed).toEqual([])
  })

  it('別人份大細唔啱 ⇒ ⛔ 唔准寫入 DB 當成功', async () => {
    const { body, patches } = await mirror({ after: [{ id: 'theirs', createdTime: ago(3000) }], theirSize: 99 })
    expect(body.ok).toBe(false)
    expect(patches.some((p) => p.drive_synced_at)).toBe(false)
  })

  it('掉唔到（Drive 500）⇒ 照樣成功，DB 寫贏嗰份', async () => {
    const { body, patches } = await mirror({ after: [{ id: 'theirs', createdTime: ago(3000) }], trash: 500 })
    expect(body.ok).toBe(true)
    expect(body.driveFileId).toBe('theirs')
    expect(body.dedupe.trashed).toBe(0)
    expect(patches.at(-1).drive_file_id).toBe('theirs')
  })
})

describe('/mirror 本身已經有幾份（之前撞車留低）', () => {
  it('舊份 ⇒ 揀最早嗰份、掉其餘、⛔ 唔再上', async () => {
    const before = [
      { id: 'c2', createdTime: ago(MIRROR_STALE_MS + 1000) },
      { id: 'c1', createdTime: ago(MIRROR_STALE_MS + 5000) },
      { id: 'c3', createdTime: ago(MIRROR_STALE_MS + 500) },
    ]
    const { body, trashed, calls, patches } = await mirror({ before })
    expect(body.driveFileId).toBe('c1')
    expect(trashed.sort()).toEqual(['c2', 'c3'])
    expect(calls).not.toContain('upload')
    expect(patches.at(-1).drive_file_id).toBe('c1')
  })

  it('新份（可能仲有人做緊）⇒ 揀最早嗰份，⛔ 唔掉', async () => {
    const before = [
      { id: 'n2', createdTime: ago(2000) },
      { id: 'n1', createdTime: ago(4000) },
    ]
    const { body, trashed } = await mirror({ before })
    expect(body.driveFileId).toBe('n1')
    expect(trashed).toEqual([])
  })
})

describe('⛔ 外呼額度（Cloudflare 一個 request 50 個）', () => {
  it('最差情況（上傳 ＋ 好多舊份 ＋ DB 重讀 ＋ 別人份對大細）都唔超過 50', async () => {
    const after = Array.from({ length: 30 }, (_, i) => ({ id: `old${i}`, createdTime: ago(MIRROR_STALE_MS + i * 1000) }))
    const { body, calls, trashed } = await mirror({
      after,
      dbTheirs: 'theirs',
      meta: { id: 'theirs', createdTime: ago(MIRROR_STALE_MS * 3), trashed: false, parents: [JOB_FOLDER], appProperties: { quotePhotoId: PHOTO } },
    })
    expect(body.ok).toBe(true)
    expect(body.driveFileId).toBe('theirs')
    expect(calls.filter((c) => c === 'trash')).toHaveLength(MIRROR_TRASH_MAX)
    expect(trashed[0]).toBe('mine') // ⭐ 額度唔夠都先收返自己嗰份
    // 實測 22 個；兩個資料夾都要新開都只係多 4 個。
    expect(calls.length).toBeLessThanOrEqual(50)
    expect(calls.filter((c) => c.startsWith('⛔'))).toEqual([])
  })

  it('已經有好多舊份（唔上傳）都唔超過 50', async () => {
    const before = Array.from({ length: 40 }, (_, i) => ({ id: `old${i}`, createdTime: ago(MIRROR_STALE_MS + i * 1000) }))
    const { calls } = await mirror({ before })
    expect(calls.filter((c) => c === 'trash')).toHaveLength(MIRROR_TRASH_MAX)
    expect(calls.length).toBeLessThanOrEqual(50)
  })
})
