import { describe, expect, it, vi } from 'vitest'
import {
  SEQ_EXHAUSTED_MESSAGE,
  SEQ_MAX_TRIES,
  targetSize,
  uploadPending,
  type PendingPhoto,
  type UploadDeps,
} from './photoUpload'
import { JPEG_QUALITY, MAX_EDGE } from './photoTransport'
import { SlotSeqTakenError, type PhotoInsert, type QuotePhoto } from './photos'

const bytes = new Uint8Array([1, 2, 3, 4, 5])

function pending(): PendingPhoto {
  return {
    operationId: 'op-1',
    recordId: 'record-1',
    treeId: 'tree-1',
    mitigation: null,
    capturedAt: '2026-08-22T01:00:00.000Z',
    size: bytes.byteLength,
    sha256: 'sha-good',
    blob: new Blob([bytes], { type: 'image/jpeg' }),
    status: 'local',
    error: '',
    attempts: 0,
  }
}

const savedRow = { id: 'photo-1', operation_id: 'op-1' } as unknown as QuotePhoto

function deps(overrides: Partial<UploadDeps> = {}): UploadDeps {
  return {
    sign: vi.fn(async () => ({ key: 'user-1/op-1.jpg', put: 'https://r2/put', get: 'https://r2/get' })),
    putBytes: vi.fn(async () => {}),
    getBytes: vi.fn(async () => bytes.buffer.slice(0) as ArrayBuffer),
    digest: vi.fn(async () => 'sha-good'),
    findRow: vi.fn(async () => null),
    allocateSeq: vi.fn(async () => 1),
    saveRow: vi.fn(async () => savedRow),
    // ⛔ 測試唔真係等 —— 但個 backoff 有冇叫過照樣驗得到。
    wait: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('uploadPending 順利嗰次', () => {
  it('簽網址 → 上 bytes → 讀返對數 → 寫一行', async () => {
    const d = deps()
    const result = await uploadPending(pending(), d)

    expect(result).toEqual({ ok: true, row: savedRow, alreadyDone: false })
    expect(d.putBytes).toHaveBeenCalledTimes(1)
    expect(d.getBytes).toHaveBeenCalledTimes(1)
    expect(d.saveRow).toHaveBeenCalledTimes(1)
  })

  it('攞簽名網址嗰陣只俾影相編號，唔俾檔名 —— 檔名由 Worker 自己砌', async () => {
    const d = deps()
    await uploadPending(pending(), d)
    expect(d.sign).toHaveBeenCalledWith('op-1', 'image/jpeg')
  })

  it('r2_key 用 Worker 回嗰個，唔用前端砌嗰個', async () => {
    const d = deps({
      sign: vi.fn(async () => ({ key: '真-user/op-1.jpg', put: 'p', get: 'g' })),
    })
    await uploadPending(pending(), d)
    expect(vi.mocked(d.saveRow).mock.calls[0][0].r2Key).toBe('真-user/op-1.jpg')
  })
})

describe('uploadPending 重試', () => {
  it('已經有行就唔會再上一次，亦唔會多寫一行', async () => {
    const d = deps({ findRow: vi.fn(async () => savedRow) })
    const result = await uploadPending(pending(), d)

    expect(result).toEqual({ ok: true, row: savedRow, alreadyDone: true })
    expect(d.putBytes).not.toHaveBeenCalled()
    expect(d.saveRow).not.toHaveBeenCalled()
  })
})

describe('uploadPending 出事嗰陣', () => {
  it('攞唔到網址：出中文，而且講明相仲喺部機', async () => {
    const d = deps({ sign: vi.fn(async () => { throw new Error('offline') }) })
    const result = await uploadPending(pending(), d)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('相仲喺部機度')
    expect(d.putBytes).not.toHaveBeenCalled()
  })

  it('上傳中斷：唔會寫 DB', async () => {
    const d = deps({ putBytes: vi.fn(async () => { throw new Error('connection reset') }) })
    const result = await uploadPending(pending(), d)

    expect(result.ok).toBe(false)
    expect(d.saveRow).not.toHaveBeenCalled()
  })

  it('讀唔返出嚟核對：⛔ 唔准當成功', async () => {
    const d = deps({ getBytes: vi.fn(async () => { throw new Error('404') }) })
    const result = await uploadPending(pending(), d)

    expect(result.ok).toBe(false)
    expect(d.saveRow).not.toHaveBeenCalled()
  })

  it('⛔ sha 對唔上：唔准寫「已入 R2」', async () => {
    const d = deps({ digest: vi.fn(async () => 'sha-bad') })
    const result = await uploadPending(pending(), d)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('對唔到數')
    expect(d.saveRow).not.toHaveBeenCalled()
  })

  it('⛔ size 對唔上：一樣唔准寫', async () => {
    const d = deps({ getBytes: vi.fn(async () => new Uint8Array([1, 2]).buffer as ArrayBuffer) })
    const result = await uploadPending(pending(), d)

    expect(result.ok).toBe(false)
    expect(d.saveRow).not.toHaveBeenCalled()
  })

  it('寫 DB 被擋（RLS 0 行）：出中文，唔會扮成功', async () => {
    const d = deps({
      saveRow: vi.fn(async () => { throw new Error('相片記錄寫唔入資料庫。') }),
    })
    const result = await uploadPending(pending(), d)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('資料庫')
  })
})

describe('targetSize', () => {
  it('長邊縮到 2800，短邊按比例', () => {
    expect(targetSize(4200, 3150, 2800)).toEqual({ width: 2800, height: 2100 })
  })

  it('直度相一樣得', () => {
    expect(targetSize(3150, 4200, 2800)).toEqual({ width: 2100, height: 2800 })
  })

  it('本身細過就唔放大 —— 放大只會變大份，唔會變清楚', () => {
    expect(targetSize(800, 600, 2800)).toEqual({ width: 800, height: 600 })
  })

  it('零唔會爆', () => {
    expect(targetSize(0, 0, 2800)).toEqual({ width: 0, height: 0 })
  })
})

describe('壓縮參數', () => {
  it('⛔ 長邊要同 tree app 一樣係 2800 —— P6 轉工程之後兩邊相唔可以一大一細', () => {
    expect(MAX_EDGE).toBe(2800)
  })

  it('質素維持 0.85，同 tree app capture 嗰 pass 一樣', () => {
    expect(JPEG_QUALITY).toBe(0.85)
  })
})

describe('派號（P3c §5.5）', () => {
  it('⛔ seq 由 DB 派，⛔ 唔再寫死 1', async () => {
    const d = deps({ allocateSeq: vi.fn(async () => 7) })
    await uploadPending(pending(), d)
    expect(d.saveRow).toHaveBeenCalledWith(expect.objectContaining({ seq: 7 }))
  })

  it('派號要講清楚係邊一格', async () => {
    const d = deps()
    const item = { ...pending(), treeId: 't1', mitigation: 'crown_cleaning' }
    await uploadPending(item, d)
    expect(d.allocateSeq).toHaveBeenCalledWith('record-1', 't1', 'crown_cleaning')
  })

  it('環境相個格 ＝ treeId null、mitigation null', async () => {
    const d = deps()
    await uploadPending({ ...pending(), treeId: null, mitigation: null }, d)
    expect(d.allocateSeq).toHaveBeenCalledWith('record-1', null, null)
  })

  it('撞號就攞下一個號再試，⛔ 唔當出錯', async () => {
    const seqs = [1, 2]
    const allocateSeq = vi.fn(async () => seqs.shift() ?? 9)
    const saveRow = vi.fn(async (input: PhotoInsert) => {
      if (input.seq === 1) throw new SlotSeqTakenError()
      return savedRow
    })
    const d = deps({ allocateSeq, saveRow })

    const result = await uploadPending(pending(), d)

    expect(result.ok).toBe(true)
    expect(allocateSeq).toHaveBeenCalledTimes(2)
    expect(saveRow).toHaveBeenLastCalledWith(expect.objectContaining({ seq: 2 }))
  })

  it('每次之間要等一等，⛔ 唔准連環撞', async () => {
    const d = deps({
      saveRow: vi.fn(async () => {
        throw new SlotSeqTakenError()
      }),
    })
    await uploadPending(pending(), d)
    expect(d.wait).toHaveBeenCalledWith(200)
    expect(d.wait).toHaveBeenCalledWith(400)
  })

  it('⛔ 唔准無限重試 —— 最多三次', async () => {
    const saveRow = vi.fn(async () => {
      throw new SlotSeqTakenError()
    })
    const d = deps({ saveRow })

    const result = await uploadPending(pending(), d)

    expect(saveRow).toHaveBeenCalledTimes(SEQ_MAX_TRIES)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // ⛔ 到頂要有一個明確終點，而且句嘢要有一個動作同一個對象。
      expect(result.message).toBe(SEQ_EXHAUSTED_MESSAGE)
      expect(result.message).toContain('再試一次')
      expect(result.message).toContain('Jason')
      // ⛔ 唔准嚇人 —— 相真係冇冇咗。
      expect(result.message).toContain('唔會冇咗')
    }
  })

  it('派唔到號：出中文，⛔ 唔准自己填一個號頂住', async () => {
    const saveRow = vi.fn(async () => savedRow)
    const d = deps({
      allocateSeq: vi.fn(async () => {
        throw new Error('攞唔到相片編號。')
      }),
      saveRow,
    })

    const result = await uploadPending(pending(), d)

    expect(result.ok).toBe(false)
    expect(saveRow).not.toHaveBeenCalled()
  })

  it('⛔ 派號要喺 R2 對完數之後先做 —— 上唔到就唔應該霸個號', async () => {
    const d = deps({
      putBytes: vi.fn(async () => {
        throw new Error('connection reset')
      }),
    })
    await uploadPending(pending(), d)
    expect(d.allocateSeq).not.toHaveBeenCalled()
  })
})
