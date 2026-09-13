import { describe, expect, it, vi } from 'vitest'
import { claimUpload, isResumable, releaseUpload, resumable } from './autoResume'
import { refreshPhotos, uploadingNow } from './photoRefresh'
import type { QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'

const NOW = Date.parse('2026-09-14T10:00:00.000Z')

const photo = (p: Partial<PendingPhoto>): PendingPhoto => ({
  operationId: 'op1',
  recordId: 'r1',
  treeId: 't1',
  mitigation: null,
  capturedAt: '2026-09-14T09:00:00.000Z',
  size: 100,
  sha256: 'x',
  blob: new Blob(['x']),
  status: 'local',
  error: '',
  attempts: 0,
  ...p,
})

const row = (p: Partial<QuotePhoto>): QuotePhoto =>
  ({ id: 'p1', record_id: 'r1', operation_id: 'op1', ...p }) as unknown as QuotePhoto

/** 一張**而家真係上緊**嘅相：狀態 uploading、開始時間就係啱啱。 */
const uploadingItem = photo({
  operationId: 'op-上緊',
  status: 'uploading',
  uploadingSince: new Date(NOW - 5_000).toISOString(),
})

/* ══════════════════════════════════════════════════════════════════
   ⛔⛔ Jason 2026-09-14 講明，下拉刷新絕對唔准做嘅四樣。
       下面逐條釘死，⛔ 四條缺一不可。
   ══════════════════════════════════════════════════════════════════ */

describe('⛔ 釘死一：唔准取消上載中嗰張', () => {
  it('刷新之後，個 in-flight 鎖仲喺度', async () => {
    expect(claimUpload('op-上緊')).toBe(true)
    try {
      await refreshPhotos({
        listLocal: () => Promise.resolve([uploadingItem]),
        listRows: () => Promise.resolve([]),
      })
      // ⭐ 個鎖冇俾人放走 ⇒ 冇任何嘢「叫停」咗嗰個上載。
      expect(uploadingNow('op-上緊')).toBe(true)
    } finally {
      releaseUpload('op-上緊')
    }
  })

  it('⭐ 刷新本身冇任何寫入能力 —— 佢兩個 dep 都係「攞」', async () => {
    const listLocal = vi.fn().mockResolvedValue([uploadingItem])
    const listRows = vi.fn().mockResolvedValue([])
    await refreshPhotos({ listLocal, listRows })

    // ⛔ 冇 save、冇 upload、冇 abort 可以叫 —— 呢個係型別上嘅保證，
    //    呢度再證實佢真係淨係叫咗嗰兩個「攞」。
    expect(listLocal).toHaveBeenCalledTimes(1)
    expect(listRows).toHaveBeenCalledTimes(1)
  })
})

describe('⛔ 釘死二：唔准令佢重頭再傳', () => {
  it('刷新之後，背景重傳仍然當佢「上緊」，⛔ 唔會揀返佢', async () => {
    const { local } = await refreshPhotos({
      listLocal: () => Promise.resolve([uploadingItem]),
      listRows: () => Promise.resolve([]),
    })

    // ⭐ `uploadingSince` 冇俾人重設 ⇒ 未夠兩分鐘 ⇒ ⛔ 唔算「死咗」。
    expect(local[0].uploadingSince).toBe(uploadingItem.uploadingSince)
    expect(isResumable(local[0], NOW)).toBe(false)
    expect(resumable(local, NOW)).toEqual([])
  })

  it('⛔ 亦都唔會將 attempts 或者 status 改返', async () => {
    const { local } = await refreshPhotos({
      listLocal: () => Promise.resolve([photo({ status: 'error', attempts: 3, error: '死咗' })]),
      listRows: () => Promise.resolve([]),
    })
    expect(local[0]).toMatchObject({ status: 'error', attempts: 3, error: '死咗' })
  })
})

describe('⛔ 釘死三：唔准令佢喺畫面消失', () => {
  it('上載中嗰張刷新完仲喺清單度', async () => {
    const { local } = await refreshPhotos({
      listLocal: () => Promise.resolve([uploadingItem, photo({ operationId: '第二張' })]),
      listRows: () => Promise.resolve([]),
    })
    expect(local.map((one) => one.operationId)).toEqual(['op-上緊', '第二張'])
  })

  it('⭐ 雲端攞唔到都要出返部機嗰份（2026-09-05 真機中過嗰個 bug）', async () => {
    const { local, rows, stale } = await refreshPhotos({
      listLocal: () => Promise.resolve([uploadingItem]),
      listRows: () => Promise.reject(new Error('冇網')),
    })
    expect(local).toHaveLength(1)
    expect(stale).toBe(true)
    // ⛔ `null` 唔係空 array —— 「問唔到」同「一張都冇」係兩件事。
    expect(rows).toBe(null)
  })

  it('⛔ 兩邊都死都唔准 throw —— 下拉係背景做嘢，冇人接得住', async () => {
    const result = await refreshPhotos({
      listLocal: () => Promise.reject(new Error('IndexedDB 壞咗')),
      listRows: () => Promise.reject(new Error('冇網')),
    })
    expect(result).toEqual({ local: [], rows: null, stale: true })
  })
})

describe('⛔ 釘死四：唔准令佢傳兩次', () => {
  it('刷新之後再想上同一張 ⇒ ⛔ 霸唔到位', async () => {
    expect(claimUpload('op-上緊')).toBe(true)
    try {
      await refreshPhotos({
        listLocal: () => Promise.resolve([uploadingItem]),
        listRows: () => Promise.resolve([row({ operation_id: 'op-上緊' })]),
      })
      // ⭐ 刷新完個鎖冇鬆過 ⇒ 第二條路照樣入唔到。
      expect(claimUpload('op-上緊')).toBe(false)
    } finally {
      releaseUpload('op-上緊')
    }
  })

  it('⭐ 刷新完之後，冇人上緊嗰張仍然霸得到位（⛔ 唔會鎖死）', async () => {
    await refreshPhotos({
      listLocal: () => Promise.resolve([photo({ operationId: 'op-得閒' })]),
      listRows: () => Promise.resolve([]),
    })
    expect(claimUpload('op-得閒')).toBe(true)
    releaseUpload('op-得閒')
  })
})

describe('攞得到嗰陣', () => {
  it('兩邊都攞到 ⇒ 唔算 stale', async () => {
    const result = await refreshPhotos({
      listLocal: () => Promise.resolve([photo({})]),
      listRows: () => Promise.resolve([row({})]),
    })
    expect(result.stale).toBe(false)
    expect(result.rows).toHaveLength(1)
  })
})
