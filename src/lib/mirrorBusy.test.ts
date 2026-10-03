import { afterEach, describe, expect, it, vi } from 'vitest'
import { mirrorPhoto } from './photoTransport'

/* P10：Worker 回 409 ＋ `busy: true`（另一部裝置攞住租約）⇒ 前端要認得，⛔ 唔准當普通失敗。 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function workerReplies(status: number, body: unknown) {
  vi.stubEnv('VITE_PHOTO_WORKER_URL', 'https://w.example.test')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  )
}

describe('mirrorPhoto：busy', () => {
  it('409 ＋ busy ⇒ { ok: false, busy: true }，原句照傳', async () => {
    workerReplies(409, { ok: false, busy: true, message: '另一部裝置正在把這張相片複製到 Drive' })
    const result = await mirrorPhoto('tok', 'p-busy-1')
    expect(result).toEqual({ ok: false, busy: true, message: '另一部裝置正在把這張相片複製到 Drive' })
  })

  it('409 冇 busy（例如檔名撞）⇒ 照舊當失敗', async () => {
    workerReplies(409, { ok: false, message: 'Drive 上面已經有一個同名檔案' })
    const result = await mirrorPhoto('tok', 'p-busy-2')
    expect(result.ok).toBe(false)
    expect('busy' in result && result.busy).toBeFalsy()
    if (!result.ok) expect(result.message).toContain('無法複製到 Drive')
  })
})
