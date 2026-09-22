import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PURGE_ROUTE_MISSING,
  PURGE_WORKER_MISSING,
  purgeRecordPhotos,
} from './photoTransport'

/**
 * P8 步 4：前端叫 `/purge` 嗰條路。
 *
 * ⭐⭐ **呢個檔測嘅重點⛔ 唔係「叫到 Worker」，係「收到嘅嘢點分類」** ——
 *    特別係 CLAUDE.md §2.6 嗰三樣**⛔ 唔准合埋**嘅嘢：
 *      · **俾人拒絕**（有中文 `message`）⇒ 搵開單嗰個／搵管理員
 *      · **根本未安裝**（404 ＋ ⛔ 冇 `message`）⇒ **deploy** 一次 Worker
 *      · **一個睇唔明嘅回覆** ⇒ ⛔ 唔准估，截圖搵 Jason
 */

const REC = '11111111-1111-4111-8111-111111111111'

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  vi.stubEnv('VITE_PHOTO_WORKER_URL', 'https://worker.example')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('purgeRecordPhotos', () => {
  it('順利 ⇒ 原封不動交返 Worker 嗰堆數', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonRes(200, {
          ok: true,
          purged: 3,
          alreadyDone: 1,
          nothingToClear: 2,
          remaining: 0,
          hitLimit: false,
          failed: [],
          message: '雲端相片已經清走：清走了 3 張。',
        }),
      ),
    )
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.ok).toBe(true)
    expect(out.purged).toBe(3)
    expect(out.nothingToClear).toBe(2)
    expect(out.message).toContain('清走了 3 張')
  })

  it('⛔⛔ 404 ＋ ⛔ 冇 message ＝ Worker 未 deploy 呢條路 ⇒ 講「未安裝」，⛔ 唔准講成冇權限', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(404, { error: 'not found' })))
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.ok).toBe(false)
    expect(out.message).toBe(PURGE_ROUTE_MISSING)
    // ⛔ 修法係 deploy，⛔ 唔係搵人開權限 —— 兩句⛔ 唔准調轉。
    expect(out.message).toContain('還未安裝')
    expect(out.message).not.toContain('權限')
  })

  it('⛔⛔ 404 ＋ 有中文 message ＝ 搵唔到嗰單工程 ⇒ ⛔ 唔准當成「未安裝」', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(404, { ok: false, message: '找不到這一單工程，或者你沒有查看權限。' })),
    )
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.message).toBe('找不到這一單工程，或者你沒有查看權限。')
    expect(out.message).not.toContain('還未安裝')
  })

  it('409 母單未刪 ⇒ 原封不動出返 Worker 嗰句中文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonRes(409, { ok: false, message: '這一單工程並未刪除，⛔ 不會清走它的相片。' }),
      ),
    )
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.message).toContain('並未刪除')
  })

  it('502 ＋ Worker 嗰句 not_yours ⇒ 原封不動出返（⛔ 前端⛔ 唔自己判斷邊個刪得）', async () => {
    const why = '這一單不是你建立的，你不能清走它的相片。請找建立這一單的同事幫手，或者找管理員代勞。'
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(502, { ok: false, message: why })))
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.message).toBe(why)
  })

  it('⛔ 401 淨係回一個英文 error ⇒ ⛔ 唔准原封不動彈英文，要出中文', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(401, { error: 'unauthorized' })))
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.message).not.toContain('unauthorized')
    expect(out.message).toContain('401')
    expect(out.message).toContain('重新登入')
  })

  it('⛔ 一個睇唔明嘅 200 ⇒ ⛔ 唔准當成功', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(200, { hello: 'world' })))
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.ok).toBe(false)
    expect(out.message).toContain('看不懂')
  })

  it('打唔到 Worker ⇒ ⛔ 唔 throw，出一句中文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch')
      }),
    )
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.ok).toBe(false)
    expect(out.message).toContain('無法連接相片服務')
  })

  it('⛔ 冇設定 VITE_PHOTO_WORKER_URL ⇒ ⛔ 連 fetch 都唔行', async () => {
    vi.stubEnv('VITE_PHOTO_WORKER_URL', '')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const out = await purgeRecordPhotos('tok', REC)
    expect(spy).not.toHaveBeenCalled()
    expect(out.message).toBe(PURGE_WORKER_MISSING)
  })

  it('⛔ 失敗嗰幾種全部係「一張都冇清」嘅樣 ⇒ 落去會判 refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(401, { error: 'unauthorized' })))
    const out = await purgeRecordPhotos('tok', REC)
    expect(out.purged).toBe(0)
    expect(out.hitLimit).toBe(false)
    expect(out.remaining).toBe(0)
  })
})
