import { describe, expect, it } from 'vitest'
// ⭐ 用 Worker 真嘅 `purgeSummary()` 砌回覆句 —— Worker 改一個字，呢度跟住變。
// @ts-expect-error —— worker 係 .mjs，⛔ 冇 type（同 `syncWorkerContract.test.ts` 一樣）。
import { purgeSummary } from '../../worker/src/purge.mjs'
import type { PendingPhoto } from './photoUpload'
import {
  PURGE_LOGIN_MESSAGE,
  PURGE_NOT_INSTALLED_MESSAGE,
  PURGE_OFFLINE_MESSAGE,
  PURGE_ROUNDS_MAX,
  callPurgeOnce,
  purgeRecordFully,
  type PurgeCallOutcome,
  type PurgeResponse,
} from './purgeRecord'

const NOT_YOURS =
  '這一單不是你建立的，你不能清走它的相片。請找建立這一單的同事幫手，或者找管理員代勞。'

function batch(p: Partial<PurgeResponse>): PurgeCallOutcome {
  const base = { purged: 0, alreadyDone: 0, nothingToClear: 0, remaining: 0, hitLimit: false, failed: [] }
  const merged = { ...base, ...p }
  const failed = merged.failed.length
  return {
    kind: 'batch',
    body: {
      ...merged,
      ok: failed === 0 && !merged.hitLimit,
      message: purgeSummary({ ...merged, failed }),
    },
  }
}

const pending = (operationId: string, recordId = 'r1'): PendingPhoto => ({
  operationId,
  recordId,
  treeId: null,
  mitigation: null,
  capturedAt: '2026-10-03T00:00:00.000Z',
  size: 1,
  sha256: 'x',
  blob: new Blob(['x']),
  status: 'uploaded',
  error: '',
  attempts: 0,
})

/** 記低每一步嘅次序，驗「部機最尾」。 */
function harness(outcomes: PurgeCallOutcome[], local: PendingPhoto[] = [pending('op1'), pending('op2')]) {
  const log: string[] = []
  let calls = 0
  return {
    log,
    calls: () => calls,
    deps: {
      callOnce: async () => {
        calls += 1
        log.push(`purge#${calls}`)
        const next = outcomes.shift()
        if (!next) throw new Error('called too many times')
        return next
      },
      listLocal: async () => {
        log.push('listLocal')
        return local
      },
      removeLocal: async (ids: string[]) => {
        log.push(`removeLocal:${ids.join(',')}`)
        return ids.length
      },
    },
  }
}

describe('purgeRecordFully —— hitLimit 要 loop', () => {
  it('⭐ hitLimit 兩次之後 ok ⇒ 叫三次，全部清完先刪部機', async () => {
    const h = harness([
      batch({ purged: 10, hitLimit: true, remaining: 15 }),
      batch({ purged: 10, hitLimit: true, remaining: 5 }),
      batch({ purged: 5, alreadyDone: 20 }),
    ])
    const result = await purgeRecordFully('r1', h.deps)
    expect(result.ok).toBe(true)
    expect(result.purged).toBe(25)
    expect(result.localRemoved).toBe(2)
    expect(h.log).toEqual(['purge#1', 'purge#2', 'purge#3', 'listLocal', 'removeLocal:op1,op2'])
  })

  it('⛔ 撞到上限就停，⛔ 唔准報成功、⛔ 唔刪部機', async () => {
    const outcomes = Array.from({ length: PURGE_ROUNDS_MAX + 5 }, () =>
      batch({ purged: 10, hitLimit: true, remaining: 999 }),
    )
    const h = harness(outcomes)
    const result = await purgeRecordFully('r1', h.deps)
    expect(result.ok).toBe(false)
    expect(h.calls()).toBe(PURGE_ROUNDS_MAX)
    expect(result.localRemoved).toBe(0)
    expect(h.log.some((step) => step.startsWith('removeLocal'))).toBe(false)
    expect(result.message).toContain('繼續清')
  })

  it('⛔ hitLimit 但一張都冇清到 ⇒ 停（唔准死 loop）', async () => {
    const h = harness([batch({ purged: 0, hitLimit: true, remaining: 3 }), batch({})])
    const result = await purgeRecordFully('r1', h.deps)
    expect(result.ok).toBe(false)
    expect(h.calls()).toBe(1)
  })
})

describe('purgeRecordFully —— 清咗一半 ⛔ 唔准講成功', () => {
  it('⛔ 第二批有一張失敗 ⇒ 即刻停、ok false、部機一張都唔刪', async () => {
    const h = harness([
      batch({ purged: 10, hitLimit: true, remaining: 3 }),
      batch({ purged: 2, failed: [{ photoId: 'p9', why: 'Google Drive 回覆 500，未能確認相片已經掉進垃圾桶。' }] }),
      batch({ purged: 1 }),
    ])
    const result = await purgeRecordFully('r1', h.deps)
    expect(result.ok).toBe(false)
    expect(h.calls()).toBe(2)
    expect(result.purged).toBe(12)
    expect(result.localRemoved).toBe(0)
    expect(h.log).not.toContain('listLocal')
    expect(result.message).toContain('只清走了一部分')
    expect(result.message).toContain('Google Drive 回覆 500')
    expect(result.message).toContain('本裝置的相片副本仍然保留')
    expect(result.message).not.toContain('已經清走：')
  })

  it('⛔ not_yours ⇒ 照出 Worker 嗰句（搵開單嗰個／管理員），⛔ 唔刪部機', async () => {
    const h = harness([
      batch({
        purged: 0,
        failed: [
          { photoId: 'p1', why: NOT_YOURS },
          { photoId: 'p2', why: NOT_YOURS },
        ],
      }),
    ])
    const result = await purgeRecordFully('r1', h.deps)
    expect(result.ok).toBe(false)
    // ⭐ 去重：兩張相同一個原因，淨係講一次。
    expect(result.message.split(NOT_YOURS).length - 1).toBe(1)
    expect(result.message).toContain('管理員')
    expect(h.log).toEqual(['purge#1'])
  })

  it('⛔ 冇網（stop）⇒ ok false，部機唔郁', async () => {
    const h = harness([{ kind: 'stop', message: PURGE_OFFLINE_MESSAGE }])
    const result = await purgeRecordFully('r1', h.deps)
    expect(result).toEqual({ ok: false, purged: 0, localRemoved: 0, message: PURGE_OFFLINE_MESSAGE })
    expect(h.log).toEqual(['purge#1'])
  })

  it('⛔ Worker 回 ok:false 但冇 failed 又冇 hitLimit ⇒ 唔識 ⇒ ⛔ 唔准估做成功', async () => {
    const weird: PurgeCallOutcome = {
      kind: 'batch',
      body: { ok: false, purged: 1, alreadyDone: 0, nothingToClear: 0, remaining: 0, hitLimit: false, failed: [], message: '' },
    }
    const h = harness([weird])
    const result = await purgeRecordFully('r1', h.deps)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Jason')
    expect(h.log).not.toContain('listLocal')
  })
})

describe('purgeRecordFully —— ⑤ 部機最尾', () => {
  it('⭐ 淨係刪呢一單嘅部機相', async () => {
    const h = harness([batch({ purged: 1 })], [pending('a'), pending('b', 'other'), pending('c')])
    const result = await purgeRecordFully('r1', h.deps)
    expect(result.ok).toBe(true)
    expect(h.log).toEqual(['purge#1', 'listLocal', 'removeLocal:a,c'])
  })

  it('⛔ 部機刪唔到 ⇒ ok false（雲端清咗，但⛔ 唔准講全部搞掂）', async () => {
    const h = harness([batch({ purged: 2 })])
    const result = await purgeRecordFully('r1', {
      ...h.deps,
      removeLocal: async () => {
        throw new Error('boom')
      },
    })
    expect(result.ok).toBe(false)
    expect(result.purged).toBe(2)
    expect(result.message).toContain('雲端相片已經清走')
  })

  it('⭐ 本來就冇相 ⇒ ok，Worker 句照出', async () => {
    const h = harness([batch({})], [])
    const result = await purgeRecordFully('r1', h.deps)
    expect(result.ok).toBe(true)
    expect(result.message).toBe('這一單沒有相片需要清走。')
  })
})

function fakeFetch(status: number, body: unknown) {
  const seen: { url: string; init: RequestInit }[] = []
  const fn = async (url: string, init: RequestInit) => {
    seen.push({ url, init })
    return new Response(body === undefined ? 'not json' : JSON.stringify(body), { status })
  }
  return { fn, seen }
}

describe('callPurgeOnce —— 每種回覆一句唔同嘅中文（CLAUDE.md §2.6）', () => {
  it('⭐ 200 ⇒ batch，帶 token、POST recordId', async () => {
    const body = { ok: true, purged: 1, alreadyDone: 0, nothingToClear: 0, remaining: 0, hitLimit: false, failed: [], message: 'x' }
    const f = fakeFetch(200, body)
    const out = await callPurgeOnce('r1', { base: 'https://w', token: 'tok', fetch: f.fn })
    expect(out).toEqual({ kind: 'batch', body })
    expect(f.seen[0].url).toBe('https://w/purge')
    expect(f.seen[0].init.method).toBe('POST')
    expect((f.seen[0].init.headers as Record<string, string>).authorization).toBe('Bearer tok')
    expect(JSON.parse(f.seen[0].init.body as string)).toEqual({ recordId: 'r1' })
  })

  it('⛔⛔ 404 `{error:"not found"}`（條路未 deploy）≠ 404 揾唔到工程', async () => {
    const route = await callPurgeOnce('r1', { base: 'https://w', token: 't', fetch: fakeFetch(404, { error: 'not found' }).fn })
    expect(route).toEqual({ kind: 'stop', message: PURGE_NOT_INSTALLED_MESSAGE })

    const record = await callPurgeOnce('r1', {
      base: 'https://w',
      token: 't',
      fetch: fakeFetch(404, { ok: false, message: '找不到這一單工程，或者你沒有查看權限。' }).fn,
    })
    expect(record.kind).toBe('stop')
    if (record.kind === 'stop') {
      expect(record.message).toContain('找不到這一單工程')
      expect(record.message).not.toBe(PURGE_NOT_INSTALLED_MESSAGE)
    }
  })

  it('⛔ 409 record_not_deleted ⇒ 照出 Worker 句', async () => {
    const out = await callPurgeOnce('r1', {
      base: 'https://w',
      token: 't',
      fetch: fakeFetch(409, { ok: false, message: '這一單工程並未刪除，⛔ 不會清走它的相片。' }).fn,
    })
    expect(out.kind === 'stop' && out.message.includes('並未刪除')).toBe(true)
  })

  it('⛔ 401 ⇒ 登入過期', async () => {
    const out = await callPurgeOnce('r1', { base: 'https://w', token: 't', fetch: fakeFetch(401, { error: 'unauthorized' }).fn })
    expect(out).toEqual({ kind: 'stop', message: PURGE_LOGIN_MESSAGE })
  })

  it('⛔ 冇 token ⇒ 一個請求都唔發', async () => {
    const f = fakeFetch(200, {})
    const out = await callPurgeOnce('r1', { base: 'https://w', token: null, fetch: f.fn })
    expect(out).toEqual({ kind: 'stop', message: PURGE_LOGIN_MESSAGE })
    expect(f.seen).toHaveLength(0)
  })

  it('⛔ 冇網（fetch throw）⇒ offline 句', async () => {
    const out = await callPurgeOnce('r1', {
      base: 'https://w',
      token: 't',
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    expect(out).toEqual({ kind: 'stop', message: PURGE_OFFLINE_MESSAGE })
  })

  it('⛔ 200 但內容唔識 ⇒ ⛔ 唔准估，截圖搵 Jason', async () => {
    const out = await callPurgeOnce('r1', { base: 'https://w', token: 't', fetch: fakeFetch(200, { hello: 1 }).fn })
    expect(out.kind === 'stop' && out.message.includes('看不懂')).toBe(true)
  })

  it('⛔ 500 冇 message ⇒ 唔識嘅回覆', async () => {
    const out = await callPurgeOnce('r1', { base: 'https://w', token: 't', fetch: fakeFetch(500, undefined).fn })
    expect(out.kind === 'stop' && out.message.includes('500') && out.message.includes('Jason')).toBe(true)
  })

  it('⛔ 未設定 Worker 網址 ⇒ 講明', async () => {
    const out = await callPurgeOnce('r1', { base: '', token: 't', fetch: fakeFetch(200, {}).fn })
    expect(out.kind === 'stop' && out.message.includes('VITE_PHOTO_WORKER_URL')).toBe(true)
  })
})
