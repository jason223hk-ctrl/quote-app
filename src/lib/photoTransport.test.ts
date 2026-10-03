import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mirrorPhoto } from './photoTransport'

/**
 * ⛔⛔ 2026-10-03 Drive 出咗 4 份同一張相：幾條路同時叫 `/mirror`。
 *    `mirrorPhoto()` 而家係 single-flight —— 呢度釘住佢。
 */

type Gate = { resolve: (body: unknown) => void }

let calls: { url: string; photoId: string }[] = []
let gates: Gate[] = []

beforeEach(() => {
  calls = []
  gates = []
  vi.stubEnv('VITE_PHOTO_WORKER_URL', 'https://worker.test')
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, photoId: JSON.parse(init.body as string).photoId })
      return new Promise<Response>((resolve) => {
        gates.push({ resolve: (body) => resolve(new Response(JSON.stringify(body), { status: 200 })) })
      })
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('mirrorPhoto —— 同一張相一次只准一個請求', () => {
  it('⛔ 同一張相同時叫三次 ⇒ 淨係一個 fetch，三個人攞同一個結果', async () => {
    const a = mirrorPhoto('tok', 'p1')
    const b = mirrorPhoto('tok', 'p1')
    const c = mirrorPhoto('tok', 'p1')
    expect(b).toBe(a)
    expect(c).toBe(a)
    await flush()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://worker.test/mirror')

    gates[0].resolve({ ok: true, alreadyDone: false })
    expect(await Promise.all([a, b, c])).toEqual([
      { ok: true, alreadyDone: false },
      { ok: true, alreadyDone: false },
      { ok: true, alreadyDone: false },
    ])
  })

  it('⭐ 唔同嘅相照樣並行', async () => {
    const a = mirrorPhoto('tok', 'p1')
    const b = mirrorPhoto('tok', 'p2')
    await flush()
    expect(calls.map((one) => one.photoId).sort()).toEqual(['p1', 'p2'])
    gates.forEach((gate) => gate.resolve({ ok: true, alreadyDone: false }))
    await Promise.all([a, b])
  })

  it('⭐ 行完（成功）之後再叫 ⇒ 會再發一次（⛔ 唔係永久 cache）', async () => {
    const first = mirrorPhoto('tok', 'p1')
    await flush()
    gates[0].resolve({ ok: true, alreadyDone: false })
    await first

    const second = mirrorPhoto('tok', 'p1')
    expect(second).not.toBe(first)
    await flush()
    expect(calls).toHaveLength(2)
    gates[1].resolve({ ok: true, alreadyDone: true })
    expect(await second).toEqual({ ok: true, alreadyDone: true })
  })

  it('⭐ 失敗（冇網）之後一樣會放鎖', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    const first = await mirrorPhoto('tok', 'p1')
    expect(first.ok).toBe(false)
    const second = await mirrorPhoto('tok', 'p1')
    expect(second.ok).toBe(false)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })
})
