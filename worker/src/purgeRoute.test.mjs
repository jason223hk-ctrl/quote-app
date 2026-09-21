import { describe, expect, it, afterEach, vi } from 'vitest'
import worker from './worker.mjs'

/*
 * ══════════════════════════════════════════════════════════════════
 * ⛔⛔ `/purge` 係全個 app 唯一一條**救唔返**嘅路。
 *
 * ⚠️ 其餘所有「刪除」都係寫一個 `deleted_at`，撳錯咗改返個欄就有返。
 *    ⭐ 呢條唔係：R2 嗰份 bytes 刪咗就冇,而 Drive 嗰份30 日後自己消失。
 *
 * ⇒ 所以呢一組⛔ 唔係測「個 function 回咩」，係測**次序同閘**：
 *     · 母單未刪 ⇒ ⛔ 一個 byte 都唔准掂
 *     · RLS 拒絕 ⇒ ⛔ 一個 byte 都唔准掂
 *     · 刪唔乾淨 ⇒ ⛔ 唔准 stamp（stamp 咗就冇人再執佢）
 *
 * ⚠️ 呢啲嘢**淨係睇 code ⛔ 睇唔出次序啱唔啱** —— 所以要真係行一次，
 *    把每一個 fetch 記落嚟，再對佢哋嘅**先後**。
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
}

const RECORD = '11111111-1111-4111-8111-111111111111'
const PHOTO = '22222222-2222-4222-8222-222222222222'

const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * 假 fetch。⭐ 記低**每一個**外呼，等測試對得返次序。
 *
 * `over` 入面每一 key 覆寫一種外呼：
 *   record / photos / probe / stamp / r2 / drive
 */
function stub(over = {}) {
  const calls = []
  const fake = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input)
    const method = (init.method || 'GET').toUpperCase()

    if (url.includes('/auth/v1/user')) {
      calls.push('whoami')
      return reply({ id: 'user-1' })
    }
    if (url.includes('oauth2.googleapis.com/token')) {
      calls.push('google-token')
      return reply({ access_token: 'gtok' })
    }
    if (url.includes('/rest/v1/quote_records')) {
      calls.push('read-record')
      return over.record ? over.record() : reply([{ id: RECORD, deleted_at: '2026-09-20T00:00:00Z' }])
    }
    if (url.includes('/rest/v1/quote_photos') && method === 'GET') {
      calls.push('read-photos')
      return over.photos
        ? over.photos()
        : reply([{ id: PHOTO, r2_key: 'user-1/aaa.jpg', drive_file_id: 'drv-1', purged_at: null }])
    }
    if (url.includes('/rest/v1/rpc/quote_purge_stamp')) {
      const body = JSON.parse(init.body)
      const isProbe = body.p_dry_run === true
      calls.push(isProbe ? 'probe' : 'stamp')
      const hook = isProbe ? over.probe : over.stamp
      return hook ? hook() : reply('ok')
    }
    if (url.includes('r2.cloudflarestorage.com')) {
      calls.push('r2-delete')
      return over.r2 ? over.r2() : new Response(null, { status: 204 })
    }
    if (url.includes('googleapis.com/drive/v3/files/')) {
      calls.push('drive-trash')
      return over.drive ? over.drive() : reply({ id: 'drv-1', trashed: true })
    }
    calls.push('⛔ 估唔到嘅外呼：' + method + ' ' + url)
    return new Response('', { status: 500 })
  })
  return { calls, fake }
}

async function purge({ over = {}, recordId = RECORD } = {}) {
  const { calls, fake } = stub(over)
  const real = globalThis.fetch
  globalThis.fetch = fake
  try {
    const res = await worker.fetch(
      new Request('https://w.example.test/purge', {
        method: 'POST',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ recordId }),
      }),
      ENV,
    )
    return { res, body: await res.json(), calls }
  } finally {
    globalThis.fetch = real
  }
}

afterEach(() => vi.restoreAllMocks())

describe('⛔⛔ 閘一：母單未刪 ⇒ 一個 byte 都唔准掂', () => {
  it('`deleted_at` 係 null ⇒ 409，⛔ 冇掂過 R2、⛔ 冇掂過 Drive', async () => {
    const { res, body, calls } = await purge({
      over: { record: () => reply([{ id: RECORD, deleted_at: null }]) },
    })
    expect(res.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(body.message).toContain('並未刪除')
    expect(calls).not.toContain('r2-delete')
    expect(calls).not.toContain('drive-trash')
    expect(calls).not.toContain('stamp')
  })

  it('揾唔到母單 ⇒ 404，⛔ 一樣乜都唔掂', async () => {
    const { res, calls } = await purge({ over: { record: () => reply([]) } })
    expect(res.status).toBe(404)
    expect(calls).not.toContain('r2-delete')
    expect(calls).not.toContain('drive-trash')
  })
})

describe('⛔⛔ 閘二：RLS 拒絕 ⇒ 一個 byte 都唔准掂', () => {
  /*
   * ⭐⭐ 呢條係成組最緊要嗰條。
   * ⚠️ `quote_photos` 條 select policy 係 `using (true)` ⇒ **人人讀得晒** ——
   *    即係「讀到呢行相」⛔ 完全唔代表你有權刪佢。
   * ⇒ 冇「問准」呢一步，就會變成 **bytes 已經冇咗，到 stamp 先俾人拒絕**。
   */
  it('問准俾人拒 ⇒ ⛔ 冇 R2 DELETE、⛔ 冇 Drive trash、⛔ 冇 stamp', async () => {
    const { body, calls } = await purge({ over: { probe: () => reply('not_yours') } })
    expect(calls).toContain('probe')
    expect(calls).not.toContain('r2-delete')
    expect(calls).not.toContain('drive-trash')
    expect(calls).not.toContain('stamp')
    expect(body.ok).toBe(false)
    expect(body.purged).toBe(0)
    expect(body.failed).toHaveLength(1)
    expect(body.failed[0].why).toContain('不是你建立的')
    expect(body.message).toContain('只清走了一部分')
  })

  /*
   * ⛔⛔ CO 2026-09-20 明文要求：`not_found` ⛔ 唔准同「拒絕」合埋。
   * ⚠️ 佢係一個**⛔ 唔應該發生**嘅情況（Worker 啱啱先由 DB 讀返嗰個 id 出嚟）
   *    ⇒ 合埋咗就變成「拒絕」嘅一種，而之後**冇人會再問點解**。
   */
  it('⛔ `not_found` 出嘅話⛔ 唔准講成「你冇權」—— 要講明佢唔應該發生', async () => {
    const { body } = await purge({ over: { probe: () => reply('not_found') } })
    expect(body.failed[0].why).toContain('不應該發生')
    expect(body.failed[0].why).not.toContain('不是你建立的')
  })

  /*
   * ⛔ 條 function 未跑（SQL 未 deploy）⇒ PostgREST 回 404。
   * ⚠️ ⛔ 唔准當佢係「拒絕」—— 兩件事嘅修法完全唔同（一個係跑 SQL，一個係搵人）。
   */
  it('⛔ 條 function 未安裝（404）⇒ 要講到明，⛔ 唔准當拒絕', async () => {
    const { body, calls } = await purge({
      over: { probe: () => new Response('{}', { status: 404 }) },
    })
    expect(calls).not.toContain('r2-delete')
    expect(body.failed[0].why).toContain('還未安裝')
    expect(body.failed[0].why).toContain('⛔ 沒有清走任何東西')
  })
})

describe('⛔⛔ 次序：問准 → R2 → Drive → stamp', () => {
  it('順住行，而且 stamp 一定喺最後', async () => {
    const { body, calls } = await purge()
    expect(calls).toEqual([
      'whoami',
      'read-record',
      'read-photos',
      'google-token',
      'probe',
      'r2-delete',
      'drive-trash',
      'stamp',
    ])
    expect(body.ok).toBe(true)
    expect(body.purged).toBe(1)
  })

  /*
   * ⭐ 點解 R2 要行喺 Drive **之前**（抄返 tree app 嗰段理由）：
   *   掉咗入垃圾桶嘅 Drive 檔⛔ 唔算一份生存中嘅副本（30 日就冇）。
   *   ⇒ 「R2 最後刪」嗰個次序，喺刪 R2 嗰一刻 R2 係唯一一份生存中嘅副本。
   */
  it('R2 嗰下一定喺 Drive 之前', async () => {
    const { calls } = await purge()
    expect(calls.indexOf('r2-delete')).toBeLessThan(calls.indexOf('drive-trash'))
  })
})

describe('⛔⛔ 清唔乾淨 ⇒ 唔准 stamp', () => {
  /* ⚠️ stamp 咗就冇人再撳得返呢張相 ⇒ bytes 會永遠留喺雲端，⛔ 冇人會再去清。 */
  it('R2 回 403 ⇒ ⛔ 唔 stamp，而且要報返個 status', async () => {
    const { body, calls } = await purge({
      over: { r2: () => new Response('', { status: 403 }) },
    })
    expect(calls).not.toContain('stamp')
    expect(body.ok).toBe(false)
    expect(body.failed[0].why).toContain('403')
  })

  it('Drive 回 500 ⇒ ⛔ 唔 stamp（R2 已經刪咗，嗰行留喺「未清完」等下次）', async () => {
    const { body, calls } = await purge({
      over: { drive: () => new Response('', { status: 500 }) },
    })
    expect(calls).toContain('r2-delete')
    expect(calls).not.toContain('stamp')
    expect(body.ok).toBe(false)
  })

  /* ⭐ 404 ＝「嗰份 bytes 唔喺度」⇒ 目的已經達到 ⇒ 照 stamp。 */
  it('R2 回 404 ⇒ 照樣行落去同 stamp', async () => {
    const { body, calls } = await purge({
      over: { r2: () => new Response('', { status: 404 }) },
    })
    expect(calls).toContain('stamp')
    expect(body.ok).toBe(true)
  })
})

describe('重試係安全嘅', () => {
  it('已經有 purged_at ⇒ ⛔ 唔再刪一次，亦⛔ 唔攞 Google token', async () => {
    const { body, calls } = await purge({
      over: {
        photos: () =>
          reply([
            { id: PHOTO, r2_key: 'user-1/aaa.jpg', drive_file_id: 'drv-1', purged_at: '2026-09-20T01:00:00Z' },
          ]),
      },
    })
    expect(calls).not.toContain('r2-delete')
    expect(calls).not.toContain('drive-trash')
    expect(calls).not.toContain('google-token')
    expect(body.ok).toBe(true)
    expect(body.alreadyDone).toBe(1)
    expect(body.purged).toBe(0)
  })

  /*
   * ⚠️ 只剩部機一份嗰啲（雲端兩邊都冇）——
   * ⛔ 冇嘢好刪，⭐ 但**照樣要 stamp**，唔係就永遠留喺「未清完」。
   * ⛔ 亦唔准攞 Google token：一單全部都係咁嘅工程⛔ 唔應該因為 Google 出事而清唔到。
   */
  it('雲端兩邊都冇 ⇒ 照 stamp，⛔ 唔攞 Google token', async () => {
    const { body, calls } = await purge({
      over: {
        photos: () => reply([{ id: PHOTO, r2_key: '', drive_file_id: '', purged_at: null }]),
      },
    })
    expect(calls).not.toContain('google-token')
    expect(calls).not.toContain('r2-delete')
    expect(calls).toContain('stamp')
    expect(body.ok).toBe(true)
    expect(body.nothingToClear).toBe(1)
  })
})

describe('⛔ 一批做唔晒 ⇒ 要講', () => {
  it('11 張相 ⇒ 做 10 張，hitLimit true，⛔ 唔准回 ok', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      id: `3333333${i}-3333-4333-8333-333333333333`,
      r2_key: `user-1/${i}.jpg`,
      drive_file_id: `drv-${i}`,
      purged_at: null,
    }))
    const { body, calls } = await purge({ over: { photos: () => reply(many) } })
    expect(body.hitLimit).toBe(true)
    expect(body.ok).toBe(false)
    expect(body.purged).toBe(10)
    expect(body.remaining).toBe(1)
    expect(calls.filter((c) => c === 'r2-delete')).toHaveLength(10)
    expect(body.message).toContain('尚有未處理的')
  })

  /*
   * ⛔⛔ CO 2026-09-20 明文要求：`patchPhoto` 兩下換成兩下 RPC 之後，
   *    **要數返**每張相仲係唔係 4 個 subrequest。
   * ⚠️ ⛔ 唔准假設一換一 —— `PURGE_BATCH_MAX = 10` 係計住 `4 + 10×4 = 44 ≤ 50` 嘅,
   *    變咗就要重計。
   */
  it('⛔ 每張相⛔ 仲係 4 個 subrequest（問准 ＋ R2 ＋ Drive ＋ stamp）', async () => {
    const { calls } = await purge()
    const setup = ['whoami', 'read-record', 'read-photos', 'google-token']
    expect(calls.slice(0, 4)).toEqual(setup)
    expect(calls.slice(4)).toEqual(['probe', 'r2-delete', 'drive-trash', 'stamp'])
    expect(calls.length - setup.length).toBe(4)
    // ⭐ 換算返：setup 4 ＋ 10 張 × 4 ＝ 44 ≤ 50
    expect(4 + 10 * 4).toBeLessThanOrEqual(50)
  })

  /*
   * ⛔⛔ **`nothing` 嗰批（雲端兩邊都冇）⛔ 唔准另開一疊行。**
   *
   * ⚠️ CO 2026-09-21 問：一單有 30 張「只剩部機一份」嘅工程，
   *    會唔會變成 `4 + 30×1 + 10×4 = 74` ⇒ 爆 Cloudflare 個 50 subrequest 上限？
   *
   * ⭐⭐ 呢兩條測試就係去**量**佢，⛔ 唔係讀 code 講「應該唔會」。
   *    ⚠️ 上面嗰條「逐個外呼對」嘅 fixture **全部係 `todo`**
   *    ⇒ 佢由頭到尾**冇碰過呢個情況**（CO 捉返）。
   */
  it('⛔ 30 張全部係「雲端兩邊都冇」⇒ 一樣封頂 10 張，⛔ 唔爆', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `4444${String(i).padStart(4, '0')}-4444-4444-8444-444444444444`,
      r2_key: '',
      drive_file_id: '',
      purged_at: null,
    }))
    const { body, calls } = await purge({ over: { photos: () => reply(many) } })

    // ⭐ 一個 request 掂 10 張，⛔ 唔理佢哋係邊一疊。
    expect(body.hitLimit).toBe(true)
    expect(body.remaining).toBe(20)
    expect(body.nothingToClear).toBe(30)

    // ⛔ 冇 bytes 好清 ⇒ ⛔ 唔掂 R2、⛔ 唔掂 Drive、⛔ 連 Google token 都唔攞。
    expect(calls).not.toContain('r2-delete')
    expect(calls).not.toContain('drive-trash')
    expect(calls).not.toContain('google-token')

    // ⭐ 每張 2 個（問准 ＋ 打剔）—— ⛔ 唔係 1 個：問准嗰下照行。
    expect(calls.filter((c) => c === 'probe')).toHaveLength(10)
    expect(calls.filter((c) => c === 'stamp')).toHaveLength(10)

    // ⛔⛔ 最緊要嗰句：成個 request 嘅外呼⛔ 唔准爆 50。
    expect(calls.length).toBeLessThanOrEqual(50)
    expect(calls.length).toBe(3 + 10 * 2) // setup 3（冇攞 google token）＋ 10×2
  })

  it('⛔ 混住（20 張要清 ＋ 20 張雲端冇）⇒ 一樣封頂 10 張，⛔ 唔爆', async () => {
    const mk = (i, empty) => ({
      id: `5555${String(i).padStart(4, '0')}-5555-4555-8555-555555555555`,
      r2_key: empty ? '' : `user-1/${i}.jpg`,
      drive_file_id: empty ? '' : `drv-${i}`,
      purged_at: null,
    })
    const many = [
      ...Array.from({ length: 20 }, (_, i) => mk(i, false)),
      ...Array.from({ length: 20 }, (_, i) => mk(100 + i, true)),
    ]
    const { body, calls } = await purge({ over: { photos: () => reply(many) } })

    expect(body.hitLimit).toBe(true)
    expect(body.remaining).toBe(30)
    // ⭐ `todo` 排喺 `nothing` 前面 ⇒ 呢一批 10 張全部要清雲端。
    expect(calls.filter((c) => c === 'r2-delete')).toHaveLength(10)
    expect(calls.length).toBeLessThanOrEqual(50)
    expect(calls.length).toBe(4 + 10 * 4) // ⭐ 最壞情況個算式本人：44
  })

  /* ⛔ subrequest ⛔ 唔准爆 50（Cloudflare 一個 request 嘅上限）。 */
  it('最壞情況一個 request 嘅外呼⛔ 唔可以超過 50', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      id: `3333333${i}-3333-4333-8333-333333333333`,
      r2_key: `user-1/${i}.jpg`,
      drive_file_id: `drv-${i}`,
      purged_at: null,
    }))
    const { calls } = await purge({ over: { photos: () => reply(many) } })
    expect(calls.length).toBeLessThanOrEqual(50)
  })
})

describe('⛔ 入面嘅嘢唔啱就要擋', () => {
  it('recordId 唔係 UUID ⇒ 400，⛔ 乜都唔掂', async () => {
    const { res, calls } = await purge({ recordId: '../../etc' })
    expect(res.status).toBe(400)
    expect(calls).not.toContain('read-record')
  })
})
