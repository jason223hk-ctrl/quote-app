import { describe, expect, it, vi } from 'vitest'
import { MIRROR_BATCH_SIZE, type QuotePhoto } from './photos'
import type { PendingPhoto, UploadResult } from './photoUpload'
import {
  DRIVE_ATTEMPT_LIMIT,
  MAX_PER_ROUND,
  MIRROR_SWEEP_MS,
  STALE_UPLOADING_MS,
  claimUpload,
  isResumable,
  mirrorOnce,
  releaseUpload,
  resumable,
  resumeOnce,
} from './autoResume'

const NOW = Date.parse('2026-09-06T10:00:00.000Z')

const photo = (p: Partial<PendingPhoto>): PendingPhoto => ({
  operationId: 'op1',
  recordId: 'r1',
  treeId: 't1',
  mitigation: null,
  capturedAt: '2026-09-06T09:00:00.000Z',
  size: 100,
  sha256: 'x',
  blob: new Blob(['x']),
  status: 'local',
  error: '',
  attempts: 0,
  ...p,
})

const okResult = { ok: true, row: {}, alreadyDone: false } as unknown as UploadResult
const failResult: UploadResult = { ok: false, message: '連唔到伺服器。' }

/** 一個記住寫咗啲乜嘅假部機。 */
function fakeStore(items: PendingPhoto[]) {
  const saved: PendingPhoto[] = []
  return {
    saved,
    listAll: () => Promise.resolve(items),
    save: (item: PendingPhoto) => {
      saved.push(item)
      return Promise.resolve()
    },
  }
}

describe('isResumable', () => {
  it('⛔ 上到咗嘅唔會再上一次', () => {
    expect(isResumable(photo({ status: 'uploaded' }), NOW)).toBe(false)
  })

  it('影咗未上（local）要上', () => {
    expect(isResumable(photo({ status: 'local' }), NOW)).toBe(true)
  })

  it('上過失敗（error）要上，⛔ 唔理試過幾多次', () => {
    expect(isResumable(photo({ status: 'error', attempts: 99 }), NOW)).toBe(true)
  })

  it('⭐ uploading 未夠兩分鐘 ＝ 真係上緊，⛔ 唔好搞佢', () => {
    const started = new Date(NOW - (STALE_UPLOADING_MS - 1000)).toISOString()
    expect(isResumable(photo({ status: 'uploading', uploadingSince: started }), NOW)).toBe(false)
  })

  it('⭐ uploading 拖夠兩分鐘 ＝ 當佢死咗（app 中途閂咗），要上返', () => {
    const started = new Date(NOW - STALE_UPLOADING_MS).toISOString()
    expect(isResumable(photo({ status: 'uploading', uploadingSince: started }), NOW)).toBe(true)
  })

  it('⭐ uploading 但冇開始時間 ＝ 上一次開 app 留低嘅，一定當佢死咗', () => {
    expect(isResumable(photo({ status: 'uploading' }), NOW)).toBe(true)
  })

  it('開始時間爛咗都要當佢死咗，⛔ 唔准當佢上緊而永遠唔試', () => {
    expect(isResumable(photo({ status: 'uploading', uploadingSince: '唔係時間' }), NOW)).toBe(true)
  })
})

describe('resumable', () => {
  it('一張相都冇就回空，⛔ 唔會炒', () => {
    expect(resumable([], NOW)).toEqual([])
  })

  it('⭐ 試得少嘅行先', () => {
    const list = resumable(
      [
        photo({ operationId: 'c', attempts: 5 }),
        photo({ operationId: 'a', attempts: 0 }),
        photo({ operationId: 'b', attempts: 2 }),
      ],
      NOW,
    )
    expect(list.map((one) => one.operationId)).toEqual(['a', 'b', 'c'])
  })

  it('試過一樣咁多次就舊嗰張行先', () => {
    const list = resumable(
      [
        photo({ operationId: '新', attempts: 1, capturedAt: '2026-09-06T09:30:00.000Z' }),
        photo({ operationId: '舊', attempts: 1, capturedAt: '2026-09-06T08:00:00.000Z' }),
      ],
      NOW,
    )
    expect(list.map((one) => one.operationId)).toEqual(['舊', '新'])
  })

  it('⛔ 上到咗嘅唔會出現喺清單', () => {
    const list = resumable(
      [photo({ operationId: '上咗', status: 'uploaded' }), photo({ operationId: '未上' })],
      NOW,
    )
    expect(list.map((one) => one.operationId)).toEqual(['未上'])
  })
})

describe('resumeOnce', () => {
  it('⛔ 冇網就唔試 —— 一張都唔會掂，⛔ attempts 亦唔會加', async () => {
    const store = fakeStore([photo({})])
    const upload = vi.fn()
    const report = await resumeOnce({ ...store, upload, online: () => false, now: () => NOW })

    expect(report.skipped).toBe('offline')
    expect(upload).not.toHaveBeenCalled()
    expect(store.saved).toEqual([])
  })

  it('一張相都冇就乜都唔做', async () => {
    const store = fakeStore([])
    const upload = vi.fn()
    const report = await resumeOnce({ ...store, upload, online: () => true, now: () => NOW })

    expect(report).toMatchObject({ tried: 0, sent: 0, failed: 0, skipped: null })
    expect(upload).not.toHaveBeenCalled()
  })

  it('上到就寫返 uploaded，⛔ 但唔會刪部機嗰份', async () => {
    const store = fakeStore([photo({ operationId: 'op1' })])
    const upload = vi.fn().mockResolvedValue(okResult)
    const report = await resumeOnce({ ...store, upload, online: () => true, now: () => NOW })

    expect(report).toMatchObject({ tried: 1, sent: 1, failed: 0 })
    expect(store.saved.map((one) => one.status)).toEqual(['uploading', 'uploaded'])
    expect(store.saved[1].blob).toBeInstanceOf(Blob)
  })

  it('⭐ 失敗唔算放棄：留低錯誤、attempts 加一，等下一輪', async () => {
    const store = fakeStore([photo({ operationId: 'op1', attempts: 3 })])
    const upload = vi.fn().mockResolvedValue(failResult)
    const report = await resumeOnce({ ...store, upload, online: () => true, now: () => NOW })

    expect(report).toMatchObject({ tried: 1, sent: 0, failed: 1 })
    const last = store.saved[store.saved.length - 1]
    expect(last.status).toBe('error')
    expect(last.attempts).toBe(4)
    expect(last.error).toBe('連唔到伺服器。')
  })

  it('⛔ 一輪最多三張，順序嚟', async () => {
    const items = [1, 2, 3, 4, 5].map((n) =>
      photo({ operationId: `op${n}`, attempts: n, capturedAt: `2026-09-06T0${n}:00:00.000Z` }),
    )
    const order: string[] = []
    const upload = vi.fn().mockImplementation((item: PendingPhoto) => {
      order.push(item.operationId)
      return Promise.resolve(okResult)
    })
    const report = await resumeOnce({
      ...fakeStore(items),
      upload,
      online: () => true,
      now: () => NOW,
    })

    expect(report.tried).toBe(MAX_PER_ROUND)
    expect(order).toEqual(['op1', 'op2', 'op3'])
  })

  it('⛔ 有人上緊嗰張就讓開，⛔ 唔會上多次', async () => {
    const store = fakeStore([photo({ operationId: '上緊' }), photo({ operationId: '得閒' })])
    const upload = vi.fn().mockResolvedValue(okResult)

    expect(claimUpload('上緊')).toBe(true)
    try {
      const report = await resumeOnce({ ...store, upload, online: () => true, now: () => NOW })
      expect(report).toMatchObject({ tried: 1, busy: 1 })
      expect(upload).toHaveBeenCalledTimes(1)
      expect(upload.mock.calls[0][0].operationId).toBe('得閒')
    } finally {
      releaseUpload('上緊')
    }
  })

  it('傳完之後個鎖要放返，⛔ 唔可以鎖死一張相', async () => {
    const store = fakeStore([photo({ operationId: 'op1' })])
    const upload = vi.fn().mockResolvedValue(okResult)
    await resumeOnce({ ...store, upload, online: () => true, now: () => NOW })

    expect(claimUpload('op1')).toBe(true)
    releaseUpload('op1')
  })

  it('⛔ 上傳途中炸咗都唔准 throw 上去', async () => {
    const store = fakeStore([photo({ operationId: 'op1' })])
    const upload = vi.fn().mockRejectedValue(new Error('炸咗'))
    const report = await resumeOnce({ ...store, upload, online: () => true, now: () => NOW })

    expect(report).toMatchObject({ tried: 1, failed: 1 })
  })

  it('讀唔到部機嗰份都唔准 throw 上去', async () => {
    const report = await resumeOnce({
      listAll: () => Promise.reject(new Error('IndexedDB 壞咗')),
      save: () => Promise.resolve(),
      upload: vi.fn(),
      online: () => true,
      now: () => NOW,
    })

    expect(report.skipped).toBe('list-failed')
  })
})

/**
 * Drive 嗰邊。
 *
 * ⚠️ `triedMirror` 係 module-level（一次開 app 一張相試一次），
 * 所以每條測試用**唔同嘅相片 id**，⛔ 唔靠一個「淨係測試用」嘅重置掣。
 */
const dbRow = (p: Partial<QuotePhoto>): QuotePhoto =>
  ({
    id: 'photo1',
    record_id: 'r1',
    tree_id: 't1',
    mitigation: null,
    seq: 1,
    operation_id: 'op1',
    r2_key: 'k',
    r2_synced_at: '2026-09-06T09:10:00.000Z',
    r2_error: '',
    drive_file_id: '',
    drive_synced_at: null,
    drive_error: '',
    size_bytes: 1,
    sha256: 'x',
    captured_at: null,
    created_at: '2026-09-06T09:00:00.000Z',
    deleted_at: null,
    ...p,
  }) as unknown as QuotePhoto

describe('mirrorOnce', () => {
  it('⛔ 冇網就唔試', async () => {
    const mirror = vi.fn()
    const report = await mirrorOnce(
      {
        listRows: () => Promise.resolve([dbRow({ id: 'm-offline' })]),
        listAll: () => Promise.resolve([]),
        save: () => Promise.resolve(),
        mirror,
        online: () => false,
        now: () => NOW,
      },
      { force: true },
    )

    expect(report.skipped).toBe('offline')
    expect(mirror).not.toHaveBeenCalled()
  })

  it('已入 R2、Drive 未做 → 補，然後寫返「試咗零次」', async () => {
    const saved: PendingPhoto[] = []
    const mirror = vi.fn().mockResolvedValue({ ok: true })
    const report = await mirrorOnce(
      {
        listRows: () => Promise.resolve([dbRow({ id: 'm-ok', operation_id: 'op-ok' })]),
        listAll: () =>
          Promise.resolve([photo({ operationId: 'op-ok', status: 'uploaded', driveAttempts: 1 })]),
        save: (item) => {
          saved.push(item)
          return Promise.resolve()
        },
        mirror,
        online: () => true,
        now: () => NOW,
      },
      { force: true },
    )

    expect(report).toMatchObject({ tried: 1, done: 1, failed: 0 })
    expect(mirror).toHaveBeenCalledWith('m-ok')
    expect(saved[0].driveAttempts).toBe(0)
    expect(saved[0].driveError).toBe('')
  })

  it('⛔ Drive 已經做咗嗰啲唔會再補一次', async () => {
    const mirror = vi.fn()
    const report = await mirrorOnce(
      {
        listRows: () =>
          Promise.resolve([dbRow({ id: 'm-done', drive_synced_at: '2026-09-06T09:20:00.000Z' })]),
        listAll: () => Promise.resolve([]),
        save: () => Promise.resolve(),
        mirror,
        online: () => true,
        now: () => NOW,
      },
      { force: true },
    )

    expect(report.tried).toBe(0)
    expect(mirror).not.toHaveBeenCalled()
  })

  it('⛔ 試夠三次嘅唔會再自動試 —— 跟返 MAX_DRIVE_ATTEMPTS，⛔ 唔准另開一套', async () => {
    const mirror = vi.fn()
    const report = await mirrorOnce(
      {
        listRows: () => Promise.resolve([dbRow({ id: 'm-max', operation_id: 'op-max' })]),
        listAll: () =>
          Promise.resolve([
            photo({
              operationId: 'op-max',
              status: 'uploaded',
              driveAttempts: DRIVE_ATTEMPT_LIMIT,
            }),
          ]),
        save: () => Promise.resolve(),
        mirror,
        online: () => true,
        now: () => NOW,
      },
      { force: true },
    )

    expect(report.tried).toBe(0)
    expect(mirror).not.toHaveBeenCalled()
  })

  it('失敗要留低痕跡：試咗幾多次加一、錯誤寫低', async () => {
    const saved: PendingPhoto[] = []
    const mirror = vi.fn().mockResolvedValue({ ok: false, message: '抄唔到去 Drive。' })
    const report = await mirrorOnce(
      {
        listRows: () => Promise.resolve([dbRow({ id: 'm-fail', operation_id: 'op-fail' })]),
        listAll: () =>
          Promise.resolve([photo({ operationId: 'op-fail', status: 'uploaded', driveAttempts: 1 })]),
        save: (item) => {
          saved.push(item)
          return Promise.resolve()
        },
        mirror,
        online: () => true,
        now: () => NOW,
      },
      { force: true },
    )

    expect(report).toMatchObject({ tried: 1, done: 0, failed: 1 })
    expect(saved[0].driveAttempts).toBe(2)
    expect(saved[0].driveError).toBe('抄唔到去 Drive。')
  })

  it('⛔ 一次開 app 一張相試一次 —— 同一張唔會喺第二輪再補', async () => {
    const row = dbRow({ id: 'm-once', operation_id: 'op-once' })
    const mirror = vi.fn().mockResolvedValue({ ok: false, message: '唔得' })
    const deps = {
      listRows: () => Promise.resolve([row]),
      listAll: () => Promise.resolve([photo({ operationId: 'op-once', status: 'uploaded' })]),
      save: () => Promise.resolve(),
      mirror,
      online: () => true,
      now: () => NOW,
    }

    const first = await mirrorOnce(deps, { force: true })
    const second = await mirrorOnce(deps, { force: true })

    expect(first.tried).toBe(1)
    expect(second.tried).toBe(0)
    expect(mirror).toHaveBeenCalledTimes(1)
  })

  it('⛔ 一輪最多三張，舊嘅行先', async () => {
    const rows = [5, 1, 4, 2, 3].map((n) =>
      dbRow({
        id: `m-batch${n}`,
        operation_id: `op-batch${n}`,
        created_at: `2026-09-06T0${n}:00:00.000Z`,
      }),
    )
    const order: string[] = []
    const mirror = vi.fn().mockImplementation((id: string) => {
      order.push(id)
      return Promise.resolve({ ok: true })
    })
    const report = await mirrorOnce(
      {
        listRows: () => Promise.resolve(rows),
        listAll: () => Promise.resolve([]),
        save: () => Promise.resolve(),
        mirror,
        online: () => true,
        now: () => NOW,
      },
      { force: true },
    )

    expect(report.tried).toBe(MIRROR_BATCH_SIZE)
    expect(order).toEqual(['m-batch1', 'm-batch2', 'm-batch3'])
  })

  it('⛔ 五分鐘內唔會掃第二次（force 嗰次除外）', async () => {
    const far = NOW + 10 * MIRROR_SWEEP_MS
    const deps = {
      listRows: () => Promise.resolve([dbRow({ id: 'm-soon', operation_id: 'op-soon' })]),
      listAll: () => Promise.resolve([]),
      save: () => Promise.resolve(),
      mirror: vi.fn().mockResolvedValue({ ok: true }),
      online: () => true,
      now: () => far,
    }

    expect((await mirrorOnce(deps)).skipped).toBe(null)
    expect((await mirrorOnce(deps)).skipped).toBe('too-soon')
  })

  it('攞唔到清單都唔准 throw 上去', async () => {
    const report = await mirrorOnce(
      {
        listRows: () => Promise.reject(new Error('冇網')),
        listAll: () => Promise.resolve([]),
        save: () => Promise.resolve(),
        mirror: vi.fn(),
        online: () => true,
        now: () => NOW,
      },
      { force: true },
    )

    expect(report.skipped).toBe('list-failed')
  })
})
