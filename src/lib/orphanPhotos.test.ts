import { describe, expect, it } from 'vitest'
import {
  hasCloudCopy,
  isOrphan,
  liveRecordIds,
  orphanNote,
  orphanPhotoCount,
  pendingHasCloudCopy,
  splitOrphanPending,
  splitOrphanRows,
} from './orphanPhotos'
import { pendingCount } from './pendingCount'
import type { QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'
import { syncCounts } from './sync'

/** 一張已經入咗 R2 嘅相（有雲端副本）。 */
const row = (p: Partial<QuotePhoto>): QuotePhoto =>
  ({
    id: 'p1',
    record_id: 'r1',
    tree_id: 't1',
    mitigation: null,
    seq: 1,
    operation_id: 'op1',
    r2_key: 'k',
    r2_synced_at: '2026-09-11T00:00:00Z',
    r2_error: '',
    drive_file_id: '',
    drive_synced_at: null,
    drive_error: '',
    size_bytes: 1,
    sha256: 'x',
    captured_at: null,
    created_at: '2026-09-11T00:00:00Z',
    deleted_at: null,
    ...p,
  }) as unknown as QuotePhoto

const photo = (p: Partial<PendingPhoto>): PendingPhoto => ({
  operationId: 'op1',
  recordId: 'r1',
  treeId: 't1',
  mitigation: null,
  capturedAt: '2026-09-11T00:00:00Z',
  size: 100,
  sha256: 'x',
  blob: new Blob(['x']),
  status: 'local',
  error: '',
  attempts: 0,
  ...p,
})

const LIVE = liveRecordIds([{ id: 'r1' }])

describe('isOrphan', () => {
  it('母單仲喺清單度 ＝ 唔係孤兒', () => {
    expect(isOrphan('r1', LIVE)).toBe(false)
  })

  it('母單唔喺清單度 ＝ 孤兒', () => {
    expect(isOrphan('已刪嘅單', LIVE)).toBe(true)
  })

  it('⛔⛔ 唔知（null）⇒ 一律當唔係孤兒', () => {
    // ⚠️ 呢條係救命嘅：清單未載完／攞唔到嗰陣都係一個空 array，
    //    當咗佢係「一單都冇」，成部機所有相就會一次過被當成孤兒。
    expect(isOrphan('乜都得', null)).toBe(false)
  })
})

describe('hasCloudCopy', () => {
  it('R2 對咗數 ＝ 有雲端副本', () => {
    expect(hasCloudCopy(row({ r2_synced_at: '2026-09-11T00:00:00Z' }))).toBe(true)
  })

  it('淨係 Drive 有都算有', () => {
    expect(
      hasCloudCopy(row({ r2_synced_at: null, drive_synced_at: '2026-09-11T00:00:00Z' })),
    ).toBe(true)
  })

  it('⛔ 淨係有 r2_key 唔算 —— 「打算擺喺邊」唔等於「已經擺咗」', () => {
    expect(hasCloudCopy(row({ r2_key: 'k', r2_synced_at: null, drive_synced_at: null }))).toBe(
      false,
    )
  })

  it('部機嗰邊：uploaded 先算有，其餘一律當冇', () => {
    expect(pendingHasCloudCopy(photo({ status: 'uploaded' }))).toBe(true)
    expect(pendingHasCloudCopy(photo({ status: 'local' }))).toBe(false)
    expect(pendingHasCloudCopy(photo({ status: 'uploading' }))).toBe(false)
    expect(pendingHasCloudCopy(photo({ status: 'error' }))).toBe(false)
  })
})

/* ══════════════════════════════════════════════════════════════
   ⛔⛔ 下面兩條係 Jason 2026-09-13 講明要釘死嘅，⛔ 缺一不可。
   ══════════════════════════════════════════════════════════════ */

describe('⛔ 釘死一：母單刪咗 ＋ 有雲端副本 ⇒ 唔入失敗數', () => {
  it('同步失敗個數唔會計佢', () => {
    const rows = [
      // 母單刪咗、但 R2 有咗 —— 甲類，收得埋。
      row({ id: '甲', record_id: '已刪嘅單', r2_error: '', drive_error: '抄唔到去 Drive' }),
      // 母單仲喺 —— 照計。
      row({ id: '仲喺', record_id: 'r1', drive_error: '抄唔到去 Drive' }),
    ]

    const before = syncCounts(rows)
    expect(before.failed).toBe(2)

    const { kept, hidden } = splitOrphanRows(rows, LIVE)
    expect(hidden.map((one) => one.id)).toEqual(['甲'])
    expect(syncCounts(kept).failed).toBe(1)
  })

  it('⭐ 但收埋咗嘅一定要數得返 —— 設定頁嗰行個 N', () => {
    const rows = [row({ id: '甲', operation_id: 'op-甲', record_id: '已刪嘅單' })]
    expect(orphanPhotoCount(rows, [], LIVE)).toBe(1)
    expect(orphanNote(1)).toBe('另有 1 張相屬於已刪工程')
  })
})

describe('⛔⛔ 釘死二：母單刪咗 ＋ 一份雲端副本都冇 ⇒ 仍然要入「未上載 N 張」', () => {
  it('⛔ 唔准收埋 —— 呢張相全世界唯一一份喺阿耀部機度', () => {
    const items = [photo({ operationId: 'op-危', recordId: '已刪嘅單', status: 'local' })]

    const { kept, hidden } = splitOrphanPending(items, LIVE)
    expect(hidden).toEqual([])
    expect(kept).toHaveLength(1)
    // ⭐ 呢句就係「未上載 N 張」個 N。
    expect(pendingCount(kept)).toBe(1)
  })

  it('⛔ 上載失敗過都一樣要數 —— error 唔等於有雲端副本', () => {
    const items = [
      photo({ operationId: 'op-error', recordId: '已刪嘅單', status: 'error', attempts: 9 }),
    ]
    expect(pendingCount(splitOrphanPending(items, LIVE).kept)).toBe(1)
  })

  it('⛔ 亦都唔准入設定頁嗰行 —— 佢仲喺「未上載 N 張」度企硬，⛔ 唔准數兩次', () => {
    const items = [photo({ operationId: 'op-危', recordId: '已刪嘅單', status: 'local' })]
    expect(orphanPhotoCount([], items, LIVE)).toBe(0)
    expect(orphanNote(0)).toBe(null)
  })

  it('⭐ DB 有行但兩個時間戳都係 null ⇒ 一樣當冇副本，照出', () => {
    const rows = [
      row({ id: '未對到數', record_id: '已刪嘅單', r2_synced_at: null, drive_synced_at: null }),
    ]
    expect(splitOrphanRows(rows, LIVE).hidden).toEqual([])
  })
})

describe('⛔ 唔知嗰陣（null）乜都唔准收埋', () => {
  it('DB 嗰邊全部照出', () => {
    const rows = [row({ record_id: '已刪嘅單' })]
    expect(splitOrphanRows(rows, null).hidden).toEqual([])
    expect(splitOrphanRows(rows, null).kept).toHaveLength(1)
  })

  it('部機嗰邊全部照出', () => {
    const items = [photo({ recordId: '已刪嘅單', status: 'uploaded' })]
    expect(splitOrphanPending(items, null).hidden).toEqual([])
  })

  it('⛔ 亦都唔准報一個數出嚟', () => {
    expect(orphanPhotoCount([row({ record_id: '已刪嘅單' })], [], null)).toBe(0)
  })
})

describe('orphanPhotoCount 去重', () => {
  it('同一張相 DB 同部機都有 ⇒ 只數一次', () => {
    const rows = [row({ operation_id: 'same', record_id: '已刪嘅單' })]
    const items = [photo({ operationId: 'same', recordId: '已刪嘅單', status: 'uploaded' })]
    expect(orphanPhotoCount(rows, items, LIVE)).toBe(1)
  })
})

describe('orphanNote', () => {
  it('零就成行唔出', () => {
    expect(orphanNote(0)).toBe(null)
    expect(orphanNote(-1)).toBe(null)
  })

  it('⛔ 句嘢唔准讀落似一個要人處理嘅警告', () => {
    const text = orphanNote(3) ?? ''
    expect(text).toBe('另有 3 張相屬於已刪工程')
    expect(text).not.toContain('需要處理')
    expect(text).not.toContain('失敗')
    expect(text).not.toContain('⚠️')
  })
})

describe('P8：已經清走咗嘅孤兒相', () => {
  it('⭐ 仍然收埋（⛔ 唔准走返入同步頁），但⛔ 唔再數落「另有 N 張」', () => {
    const live = new Set<string>()
    const purged = row({ operation_id: 'gone', purged_at: '2026-10-03T09:00:00Z' })
    const notYet = row({ operation_id: 'still' })
    expect(splitOrphanRows([purged, notYet], live).hidden).toHaveLength(2)
    expect(orphanPhotoCount([purged, notYet], [], live)).toBe(1)
  })
})
