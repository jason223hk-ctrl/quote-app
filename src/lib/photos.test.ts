import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DUPLICATE_NOT_FOUND_MESSAGE,
  MAX_DRIVE_ATTEMPTS,
  pickMirrorBatch,
  rowsForSlot,
  PHOTO_STATUS_HINT,
  photoCanRetry,
  photoHint,
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

describe('⛔ 唔准承諾一個我哋量唔到嘅時間（Jason 2026-09-16 第 ① 條）', () => {
  /* 2026-09-16 真機：同一張卡上面同時寫住「通常幾秒到幾分鐘就得」
     同「抄唔到去 Drive：Drive 查詢失敗（429）」。⭐ 而 429 可以係
     「今日額度用晒」—— 嗰種等成日都唔會好。⇒ 嗰句係我哋自己講嘅假話。 */
  const 時間承諾 = ['幾秒', '幾分鐘', '一陣', '好快', '即刻好', '分鐘就得']

  it('五個狀態嘅提示，一句都唔准出現時間承諾', () => {
    for (const status of ['local', 'uploading', 'r2', 'synced', 'error'] as const) {
      for (const 詞 of 時間承諾) {
        expect(PHOTO_STATUS_HINT[status], `${status} 唔准講「${詞}」`).not.toContain(詞)
      }
    }
  })

  it('四種處境嘅 photoHint()，一句都唔准出現時間承諾', () => {
    for (const trouble of [
      { status: 'r2' as const, r2Done: true, hasLocal: true },
      { status: 'error' as const, r2Done: true, hasLocal: true },
      { status: 'error' as const, r2Done: false, hasLocal: true },
      { status: 'error' as const, r2Done: false, hasLocal: false },
    ]) {
      for (const 詞 of 時間承諾) {
        expect(photoHint(trouble), `${JSON.stringify(trouble)} 唔准講「${詞}」`).not.toContain(詞)
      }
    }
  })
})

describe('⭐ 要講得出「你而家做得到咩」（Jason 2026-09-16 第 ② 條）', () => {
  it('R2 有份 ＝ 張相安全 —— 兩種情況都要寫明，⛔ 唔可以淨係講 Drive 失敗', () => {
    expect(photoHint({ status: 'r2', r2Done: true, hasLocal: true })).toContain('⛔ 不會丟失')
    expect(photoHint({ status: 'error', r2Done: true, hasLocal: true })).toContain('⛔ 不會丟失')
  })

  it('⭐ Drive 試夠三次：老實講「無法自行處理」，⛔ 唔准再叫人撳「再試一次」', () => {
    const hint = photoHint({ status: 'error', r2Done: true, hasLocal: true })
    expect(hint).toContain('無法自行處理')
    expect(hint).toContain('聯絡 Jason')
    // ⛔ 呢個先係重點：粒掣撳落去一個請求都唔發，所以⛔ 唔准叫人撳。
    expect(hint).not.toContain('再試一次')
  })

  it('R2 都未上到而部機有份：⭐ 撳「再試一次」真係做到嘢 ⇒ 照叫佢撳', () => {
    const hint = photoHint({ status: 'error', r2Done: false, hasLocal: true })
    expect(hint).toContain('再試一次')
    expect(hint).toContain('不會多拍一張相片')
  })

  it('每種處境都要講到張相喺邊，⛔ 唔准淨係話「失敗」', () => {
    expect(photoHint({ status: 'error', r2Done: false, hasLocal: true })).toContain('仍在本裝置')
    expect(photoHint({ status: 'error', r2Done: false, hasLocal: false })).toContain('本裝置沒有')
  })
})

describe('⛔ 粒「再試一次」唔准喺一個佢乜都唔做嘅情況下出', () => {
  it('⭐ Drive 試夠三次 ⇒ ⛔ 唔出 —— runMirror() 嗰陣一個請求都唔會發', () => {
    expect(photoCanRetry({ status: 'error', r2Done: true, hasLocal: true })).toBe(false)
  })

  it('R2 都未上到而部機有份 ⇒ 出（佢真係會再上一次）', () => {
    expect(photoCanRetry({ status: 'error', r2Done: false, hasLocal: true })).toBe(true)
  })

  it('⛔ 部機冇份 ⇒ ⛔ 唔出（`retry()` 冇 local item 就乜都唔做）', () => {
    expect(photoCanRetry({ status: 'error', r2Done: false, hasLocal: false })).toBe(false)
  })

  it('⛔ 唔係 error 嘅狀態一律唔出', () => {
    for (const status of ['local', 'uploading', 'r2', 'synced'] as const) {
      expect(photoCanRetry({ status, r2Done: true, hasLocal: true })).toBe(false)
    }
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

  it('對唔上嘅訊息係中文，而且講到明未算上傳成功', () => {
    const message = digestMismatchMessage({ size: 10, sha256: 'a' }, { size: 11, sha256: 'a' })
    expect(message).toContain('未算上傳成功')
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

  it('⛔ 同一格撞號唔准出「請截圖聯絡 Jason」—— 系統自己重試就搞得掂', async () => {
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
    ).rejects.toThrow(/無法獲取相片編號/)
  })

  it('⛔ 回 0 都唔准要 —— seq 由 1 數起，0 會計出 -1 個檔名', async () => {
    const { client } = rpcClient({ data: 0, error: null })
    await expect(
      createPhotosApi(client, 'user-1').allocateSeq('rec', null, null),
    ).rejects.toThrow(/無法獲取相片編號/)
  })

  it('DB 出錯：出中文，⛔ 唔准彈英文原文', async () => {
    const { client } = rpcClient({ data: null, error: { message: 'permission denied' } })
    await expect(
      createPhotosApi(client, 'user-1').allocateSeq('rec', null, null),
    ).rejects.not.toThrow(/permission denied/)
  })
})

describe('rowsForSlot —— 自動補鏡像淨係揀呢一格嘅相', () => {
  const r = (id: string, tree_id: string | null, mitigation: string | null) =>
    ({ id, tree_id, mitigation }) as unknown as QuotePhoto

  it('⛔ 同一版幾格唔會搶同一批：每格淨係見到自己嘅', () => {
    const rows = [r('a', 't1', null), r('b', 't1', 'prune'), r('c', 't2', null), r('d', null, null)]
    expect(rowsForSlot(rows, 't1', null).map((x) => x.id)).toEqual(['a'])
    expect(rowsForSlot(rows, 't1', 'prune').map((x) => x.id)).toEqual(['b'])
    expect(rowsForSlot(rows, null, null).map((x) => x.id)).toEqual(['d'])
  })

  it('⭐ 篩完先揀三張 ⇒ 第二格嘅相唔會俾第一格揀走', () => {
    const synced = { r2_synced_at: 'x', drive_synced_at: null }
    const mk = (id: string, tree: string, at: string) =>
      ({ ...synced, id, tree_id: tree, mitigation: null, created_at: at }) as unknown as QuotePhoto
    const rows = [mk('t1-a', 't1', '1'), mk('t1-b', 't1', '2'), mk('t1-c', 't1', '3'), mk('t2-a', 't2', '4')]
    const forT2 = pickMirrorBatch(rowsForSlot(rows, 't2', null), () => 0)
    expect(forT2.map((x) => x.id)).toEqual(['t2-a'])
    const forT1 = pickMirrorBatch(rowsForSlot(rows, 't1', null), () => 0)
    expect(forT1.map((x) => x.id)).toEqual(['t1-a', 't1-b', 't1-c'])
  })
})
