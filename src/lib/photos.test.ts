import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DUPLICATE_NOT_FOUND_MESSAGE,
  MAX_DRIVE_ATTEMPTS,
  pickMirrorBatch,
  PHOTO_STATUS_HINT,
  PHOTO_STATUS_LABEL,
  createPhotosApi,
  digestMatches,
  digestMismatchMessage,
  isSlotSeqViolation,
  isUniqueViolation,
  SlotSeqTakenError,
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
  mitigation: null,
  operationId: 'op-1',
  seq: 1,
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

  it('兩份齊先至係 synced', () => {
    expect(statusOfRow({ ...row, r2_synced_at: 'x', drive_synced_at: 'y' })).toBe('synced')
  })

  it('⛔ Drive 未做只係過渡，唔係出事', () => {
    expect(statusOfRow({ ...row, r2_synced_at: 'x' }, 0)).toBe('r2')
    expect(statusOfRow({ ...row, r2_synced_at: 'x' }, 2)).toBe('r2')
  })

  it('⛔ 試夠三次先轉「有事要人睇」', () => {
    expect(statusOfRow({ ...row, r2_synced_at: 'x' }, MAX_DRIVE_ATTEMPTS)).toBe('error')
  })

  it('⛔ 就算試爆咗，只要 Drive 真係上到就係 synced', () => {
    expect(statusOfRow({ ...row, r2_synced_at: 'x', drive_synced_at: 'y' }, 9)).toBe('synced')
  })
})

describe('pickMirrorBatch', () => {
  function make(id: string, created: string, r2 = 'x', drive: string | null = null): QuotePhoto {
    return { ...row, id, created_at: created, r2_synced_at: r2, drive_synced_at: drive }
  }

  it('⛔ 一次最多三張 —— 唔准一次過發成個工程', () => {
    const rows = ['1', '2', '3', '4', '5'].map((n) => make(n, `2026-08-22T0${n}:00:00Z`))
    expect(pickMirrorBatch(rows, () => 0).map((r) => r.id)).toEqual(['1', '2', '3'])
  })

  it('舊嘅行先', () => {
    const rows = [make('b', '2026-08-22T02:00:00Z'), make('a', '2026-08-22T01:00:00Z')]
    expect(pickMirrorBatch(rows, () => 0).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('已經上咗 Drive 嘅唔會再揀', () => {
    expect(pickMirrorBatch([make('a', 'x', 'x', 'done')], () => 0)).toHaveLength(0)
  })

  it('仲未入 R2 嘅唔會揀 —— 未輪到佢', () => {
    expect(pickMirrorBatch([{ ...make('a', 'x'), r2_synced_at: null }], () => 0)).toHaveLength(0)
  })

  it('⛔ 試夠三次嘅唔會再自動試', () => {
    expect(pickMirrorBatch([make('a', 'x')], () => MAX_DRIVE_ATTEMPTS)).toHaveLength(0)
  })

  it('試過但未夠三次嘅照試', () => {
    expect(pickMirrorBatch([make('a', 'x')], () => 2)).toHaveLength(1)
  })
})

describe('狀態文字', () => {
  it('五個狀態都有中文，冇一個係空', () => {
    for (const status of ['local', 'uploading', 'r2', 'synced', 'error'] as const) {
      expect(PHOTO_STATUS_LABEL[status].trim()).not.toBe('')
      expect(PHOTO_STATUS_HINT[status].trim()).not.toBe('')
    }
  })

  it('⛔ 「兩份齊」淨係屬於 synced —— 其他狀態一個字都唔准咁講', () => {
    for (const status of ['local', 'uploading', 'r2', 'error'] as const) {
      expect(PHOTO_STATUS_LABEL[status]).not.toContain('兩份齊')
      expect(PHOTO_STATUS_LABEL[status]).not.toContain('已同步')
      expect(PHOTO_STATUS_HINT[status]).not.toContain('兩份齊')
    }
    expect(PHOTO_STATUS_LABEL.synced).toContain('兩份齊')
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

  it('seq 照原樣送落去 —— ⛔ 由 1 數起係呼叫嗰邊嘅責任（見 photoUpload）', () => {
    expect(values.seq).toBe(insert.seq)
    expect(values.seq).toBeGreaterThanOrEqual(1)
  })
})

describe('isUniqueViolation', () => {
  it('認得 Postgres 個 code', () => {
    expect(isUniqueViolation({ code: '23505', message: 'whatever' })).toBe(true)
  })

  it('冇 code 都認得返段字', () => {
    expect(
      isUniqueViolation({
        message: 'duplicate key value violates unique constraint "quote_photos_operation_id_uidx"',
      }),
    ).toBe(true)
  })

  it('唔關事嘅錯唔會當佢係撞 unique', () => {
    expect(isUniqueViolation({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})

/**
 * 假 Supabase client。只做 create / findByOperationId 兩條路用到嗰幾個 method。
 * `insertResult` 係 insert 嗰下回咩，`existing` 係跟住 select 揾唔揾到行。
 */
function fakeClient(options: {
  insertResult: { data: unknown; error: { code?: string; message: string } | null }
  existing: QuotePhoto | null
}) {
  const inserts: unknown[] = []
  const selects: string[] = []

  const client = {
    from() {
      return {
        insert(values: unknown) {
          inserts.push(values)
          return {
            select: () => ({ maybeSingle: async () => options.insertResult }),
          }
        },
        select() {
          const chain = {
            eq(_column: string, value: string) {
              selects.push(value)
              return chain
            },
            is: () => chain,
            order: () => chain,
            maybeSingle: async () => ({ data: options.existing, error: null }),
          }
          return chain
        },
      }
    },
  }

  return { client: client as unknown as SupabaseClient, inserts, selects }
}

const duplicateError = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "quote_photos_operation_id_uidx"',
}

/** 同一格撞號 —— ⛔ 同上面嗰個係兩件唔同嘅事，雖然兩個都係 23505。 */
const slotSeqError = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "quote_photos_slot_seq_uidx"',
}

describe('create 撞到 unique（重試、或者兩部機一齊上）', () => {
  it('當成功，回返本身嗰行', async () => {
    const existing = { ...row, operation_id: 'op-1' }
    const { client, selects } = fakeClient({
      insertResult: { data: null, error: duplicateError },
      existing,
    })

    await expect(createPhotosApi(client, 'user-1').create(insert)).resolves.toBe(existing)
    // 一定要真係揾返嗰行出嚟先算成功，唔准淨係見到 23505 就當然。
    expect(selects).toContain('op-1')
  })

  it('⛔ 唔會插第二行', async () => {
    const { client, inserts } = fakeClient({
      insertResult: { data: null, error: duplicateError },
      existing: { ...row },
    })

    await createPhotosApi(client, 'user-1').create(insert)
    expect(inserts).toHaveLength(1)
  })

  it('⛔ 唔會彈英文出嚟 —— 根本唔會 throw', async () => {
    const { client } = fakeClient({
      insertResult: { data: null, error: duplicateError },
      existing: { ...row },
    })

    await expect(createPhotosApi(client, 'user-1').create(insert)).resolves.toBeTruthy()
  })

  it('撞咗但揾唔返嗰行：出中文，唔准靜靜過骨', async () => {
    const { client } = fakeClient({
      insertResult: { data: null, error: duplicateError },
      existing: null,
    })

    await expect(createPhotosApi(client, 'user-1').create(insert)).rejects.toThrow(
      DUPLICATE_NOT_FOUND_MESSAGE,
    )
    // 「Jason」係人名，唔算英文原文；唔准出現嘅係 DB 嗰句原文。
    expect(DUPLICATE_NOT_FOUND_MESSAGE).not.toMatch(/duplicate|constraint|violates/i)
  })
})

describe('create 其他錯誤照舊當出事', () => {
  it('permission denied 唔會扮成功', async () => {
    const { client } = fakeClient({
      insertResult: { data: null, error: { code: '42501', message: 'permission denied for table quote_photos' } },
      existing: { ...row },
    })

    await expect(createPhotosApi(client, 'user-1').create(insert)).rejects.toThrow()
  })

  it('0 行受影響（RLS 擋咗）一樣當被拒絕', async () => {
    const { client } = fakeClient({ insertResult: { data: null, error: null }, existing: null })
    await expect(createPhotosApi(client, 'user-1').create(insert)).rejects.toThrow(/資料庫/)
  })
})

describe('順利嗰次', () => {
  it('回返 server 寫低嗰行', async () => {
    const saved = { ...row, id: 'photo-9' }
    const { client } = fakeClient({ insertResult: { data: saved, error: null }, existing: null })
    await expect(createPhotosApi(client, 'user-1').create(insert)).resolves.toBe(saved)
  })
})

describe('isSlotSeqViolation', () => {
  it('認得同一格撞號', () => {
    expect(isSlotSeqViolation(slotSeqError)).toBe(true)
  })

  it('⛔ operation_id 撞唔算 —— 嗰個意思係「已經寫咗」', () => {
    expect(isSlotSeqViolation(duplicateError)).toBe(false)
  })

  // ⛔ 唔准寫成「唔係 operation_id 就當係撞號」：將來加多個 unique index，
  //    嗰種寫法會將新嗰個當成撞號，然後一路重試落去。
  it('⛔ 認唔到嘅 index 唔准當成撞號', () => {
    expect(
      isSlotSeqViolation({
        message: 'duplicate key value violates unique constraint "some_future_uidx"',
      }),
    ).toBe(false)
  })
})

describe('兩種 23505 要分得開（2026-09-04 真機中過）', () => {
  it('同一格撞號 → 出 SlotSeqTakenError，等上面攞下一個號再試', async () => {
    const { client } = fakeClient({
      insertResult: { data: null, error: slotSeqError },
      existing: null,
    })

    await expect(createPhotosApi(client, 'user-1').create(insert)).rejects.toBeInstanceOf(
      SlotSeqTakenError,
    )
  })

  it('⛔ 同一格撞號唔准出「請截圖搵 Jason」—— 系統自己重試就搞得掂', async () => {
    const { client } = fakeClient({
      insertResult: { data: null, error: slotSeqError },
      existing: null,
    })

    await expect(createPhotosApi(client, 'user-1').create(insert)).rejects.not.toThrow(
      DUPLICATE_NOT_FOUND_MESSAGE,
    )
  })

  it('撞號但個 operation_id 真係已經寫咗 → 照當成功', async () => {
    const existing = { ...row, operation_id: 'op-1' }
    const { client } = fakeClient({
      insertResult: { data: null, error: slotSeqError },
      existing,
    })

    await expect(createPhotosApi(client, 'user-1').create(insert)).resolves.toBe(existing)
  })
})

describe('allocateSeq', () => {
  function rpcClient(result: { data: unknown; error: { message: string } | null }) {
    const calls: unknown[] = []
    const client = {
      rpc(name: string, args: unknown) {
        calls.push({ name, args })
        return Promise.resolve(result)
      },
    }
    return { client: client as unknown as SupabaseClient, calls }
  }

  it('叫 DB 派號，⛔ 前端唔自己數', async () => {
    const { client, calls } = rpcClient({ data: 3, error: null })
    const seq = await createPhotosApi(client, 'user-1').allocateSeq('rec', 'tree', 'removal')

    expect(seq).toBe(3)
    expect(calls).toEqual([
      {
        name: 'allocate_quote_photo_seq',
        args: { p_record_id: 'rec', p_tree_id: 'tree', p_mitigation: 'removal' },
      },
    ])
  })

  it('環境相：兩個都係 null', async () => {
    const { client, calls } = rpcClient({ data: 1, error: null })
    await createPhotosApi(client, 'user-1').allocateSeq('rec', null, null)

    expect(calls).toEqual([
      {
        name: 'allocate_quote_photo_seq',
        args: { p_record_id: 'rec', p_tree_id: null, p_mitigation: null },
      },
    ])
  })

  // ⛔ 派唔到號就唔准自己填一個 —— 自己填等於繞過個 index，兩行同號真係會寫得入。
  it('⛔ 回一個唔係數字嘅嘢，唔准當 1', async () => {
    const { client } = rpcClient({ data: null, error: null })
    await expect(
      createPhotosApi(client, 'user-1').allocateSeq('rec', null, null),
    ).rejects.toThrow(/攞唔到相片編號/)
  })

  it('⛔ 回 0 都唔准要 —— seq 由 1 數起，0 會計出 -1 個檔名', async () => {
    const { client } = rpcClient({ data: 0, error: null })
    await expect(
      createPhotosApi(client, 'user-1').allocateSeq('rec', null, null),
    ).rejects.toThrow(/攞唔到相片編號/)
  })

  it('DB 出錯：出中文，⛔ 唔准彈英文原文', async () => {
    const { client } = rpcClient({ data: null, error: { message: 'permission denied' } })
    await expect(
      createPhotosApi(client, 'user-1').allocateSeq('rec', null, null),
    ).rejects.not.toThrow(/permission denied/)
  })
})
