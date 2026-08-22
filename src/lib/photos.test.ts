import { describe, expect, it } from 'vitest'
import {
  PHOTO_STATUS_HINT,
  PHOTO_STATUS_LABEL,
  digestMatches,
  digestMismatchMessage,
  newOperationId,
  photoInsertToRow,
  r2KeyFor,
  statusOfRow,
  type PhotoInsert,
  type QuotePhoto,
} from './photos'

const row: QuotePhoto = {
  id: 'photo-1',
  record_id: 'record-1',
  tree_id: 'tree-1',
  mitigation: null,
  seq: 0,
  operation_id: 'op-1',
  r2_key: 'user-1/op-1.jpg',
  r2_synced_at: null,
  r2_error: '',
  drive_file_id: '',
  drive_synced_at: null,
  drive_error: '',
  size_bytes: 1234,
  sha256: 'abc',
  captured_at: '2026-08-22T01:00:00.000Z',
  remark: '',
  marks: null,
  created_by: 'user-1',
  created_at: '2026-08-22T01:00:01.000Z',
  deleted_at: null,
}

const insert: PhotoInsert = {
  recordId: 'record-1',
  treeId: 'tree-1',
  operationId: 'op-1',
  seq: 0,
  r2Key: 'user-1/op-1.jpg',
  sizeBytes: 1234,
  sha256: 'abc',
  capturedAt: '2026-08-22T01:00:00.000Z',
}

describe('r2KeyFor', () => {
  it('用 用戶id/影相編號.jpg', () => {
    expect(r2KeyFor('user-1', 'op-1')).toBe('user-1/op-1.jpg')
  })
})

describe('newOperationId', () => {
  it('每次唔同，所以兩張相唔會撞檔名', () => {
    expect(newOperationId()).not.toBe(newOperationId())
  })
})

describe('statusOfRow', () => {
  it('上到 R2 就係 r2', () => {
    expect(statusOfRow({ ...row, r2_synced_at: '2026-08-22T01:00:02.000Z' })).toBe('r2')
  })

  it('有錯就係 error', () => {
    expect(statusOfRow({ ...row, r2_error: 'network down' })).toBe('error')
  })

  it('乜都未有就係只喺部機', () => {
    expect(statusOfRow(row)).toBe('local')
  })

  it('⛔ 就算有錯，只要 r2 對咗數就唔可以當失敗', () => {
    expect(statusOfRow({ ...row, r2_synced_at: 'x', r2_error: '舊嗰次嘅錯' })).toBe('r2')
  })
})

describe('狀態文字', () => {
  it('四個狀態都有中文，冇一個係空', () => {
    for (const status of ['local', 'uploading', 'r2', 'error'] as const) {
      expect(PHOTO_STATUS_LABEL[status].trim()).not.toBe('')
      expect(PHOTO_STATUS_HINT[status].trim()).not.toBe('')
    }
  })

  it('⛔ P3a 冇 Drive，所以一個字都唔准講「兩份齊」', () => {
    const all = [...Object.values(PHOTO_STATUS_LABEL), ...Object.values(PHOTO_STATUS_HINT)].join(' ')
    expect(all).not.toContain('兩份齊')
    expect(all).not.toContain('已同步')
  })
})

describe('對數', () => {
  it('size 同 sha 一樣先算過', () => {
    expect(digestMatches({ size: 10, sha256: 'a' }, { size: 10, sha256: 'a' })).toBe(true)
  })

  it('size 唔同就唔算過', () => {
    expect(digestMatches({ size: 10, sha256: 'a' }, { size: 11, sha256: 'a' })).toBe(false)
  })

  it('sha 唔同就唔算過', () => {
    expect(digestMatches({ size: 10, sha256: 'a' }, { size: 10, sha256: 'b' })).toBe(false)
  })

  it('對唔上嘅訊息係中文，而且講到明未算上到', () => {
    const message = digestMismatchMessage({ size: 10, sha256: 'a' }, { size: 11, sha256: 'a' })
    expect(message).toContain('未算上到')
  })
})

describe('photoInsertToRow', () => {
  const values = photoInsertToRow(insert, 'user-1')

  it('文字欄唔會送 null（P1 教訓）', () => {
    expect(values.r2_error).toBe('')
    for (const [key, value] of Object.entries(values)) {
      if (key === 'mitigation') continue
      expect(value, `${key} 唔應該係 null`).not.toBeNull()
    }
  })

  it('mitigation 留空係 null —— 全景相真係冇工序，同空字串唔同意思', () => {
    expect(values.mitigation).toBeNull()
  })

  it('⛔ Drive 三個欄、remark、marks 完全唔會出現喺 payload', () => {
    for (const key of ['drive_file_id', 'drive_synced_at', 'drive_error', 'remark', 'marks']) {
      expect(Object.hasOwn(values, key), `${key} 唔應該喺 payload 入面`).toBe(false)
    }
  })

  it('影相時間用影相嗰刻，唔係寫入嗰刻', () => {
    expect(values.captured_at).toBe(insert.capturedAt)
  })

  it('寫入嗰刻先算上到 R2', () => {
    expect(typeof values.r2_synced_at).toBe('string')
  })
})
