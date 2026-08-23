import { describe, expect, it, vi } from 'vitest'
import {
  MAX_SEQ_ATTEMPTS,
  SEQ_GAVE_UP_MESSAGE,
  uploadPending,
  targetSize,
  type PendingPhoto,
  type UploadDeps,
} from './photoUpload'
import {
  JPEG_QUALITY,
  MAX_EDGE,
  looksBlankBySize,
  samplesLookUniform,
  type CompressResult,
} from './photoTransport'
import type { QuotePhoto } from './photos'

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
    saveRow: vi.fn(async () => savedRow),
    allocateSeq: vi.fn(async () => 1),
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
  it('長邊縮到 2400，短邊按比例', () => {
    expect(targetSize(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800, scaled: true })
  })

  it('直度相一樣得', () => {
    expect(targetSize(3000, 4000, 2400)).toEqual({ width: 1800, height: 2400, scaled: true })
  })

  it('本身細過就唔放大 —— 放大只會變大份，唔會變清楚', () => {
    expect(targetSize(800, 600, 2400)).toEqual({ width: 800, height: 600, scaled: false })
  })

  it('零唔會爆', () => {
    expect(targetSize(0, 0, 2400)).toEqual({ width: 0, height: 0, scaled: false })
  })

  it('⛔ 縮極都唔會變 0 —— 一條 1px 高嘅相都要留返 1px', () => {
    expect(targetSize(4000, 1, 2400).height).toBe(1)
  })
})

/**
 * ⛔ 呢兩個數係**規格**，唔係實作細節。
 * **改之前一定要問 Jason**（2026-08-22 佢本人拍板要同 tree app 一模一樣）。
 *
 * 呢兩個測試存在嘅目的就係：**唔准有人靜靜咁改咗佢。**
 */
describe('⛔ 壓縮參數 —— 改之前要問 Jason', () => {
  it('長邊 2400，同 tree app `uploadPhoto.ts:166` CAPTURE_LONG_EDGE 一樣', () => {
    expect(MAX_EDGE).toBe(2400)
  })

  it('質素 0.80，同 tree app `uploadPhoto.ts:167` CAPTURE_QUALITY = 80 一樣', () => {
    expect(JPEG_QUALITY).toBe(0.8)
  })

  it('⚠️ 單位要係 0–1，⛔ 唔可以係 80', () => {
    expect(JPEG_QUALITY).toBeGreaterThan(0)
    expect(JPEG_QUALITY).toBeLessThanOrEqual(1)
  })
})

describe('空白 canvas 偵測 #2（`looksBlankBySize`）', () => {
  it('全白 JPEG 幾乎唔使錢 —— 當佢係空白', () => {
    // 2400×1800 = 4.32 MP。一張真相至少幾百 KB；20 KB 即係 0.005 B/px。
    expect(looksBlankBySize(20_000, 2400, 1800)).toBe(true)
  })

  it('⛔ 唔可以誤殺真相 —— 0.27 B/px 係實測嘅真相密度', () => {
    expect(looksBlankBySize(Math.round(0.27 * 2400 * 1800), 2400, 1800)).toBe(false)
  })

  it('⚠️ 界線係 0.02 B/px', () => {
    const px = 2400 * 1800
    expect(looksBlankBySize(Math.round(0.019 * px), 2400, 1800)).toBe(true)
    expect(looksBlankBySize(Math.round(0.021 * px), 2400, 1800)).toBe(false)
  })

  it('證明唔到就 fail safe —— 尺寸唔啱、零 bytes 都當空白', () => {
    expect(looksBlankBySize(0, 2400, 1800)).toBe(true)
    expect(looksBlankBySize(500_000, 0, 0)).toBe(true)
  })
})

describe('⛔ 壓唔到嗰陣：用返原相，唔准 throw（第 11 項，Jason 2026-08-22）', () => {
  it('`CompressResult` 一定有 `fallback` 呢個欄 —— 有值即係嗰張係原相', () => {
    // 型別層面釘住：正常嗰次係空字串，唔係 undefined，
    // 咁樣「有冇 fallback」永遠答得出，⛔ 唔會靜靜咁唔知。
    const ok: CompressResult = { blob: new Blob(['x']), fallback: '' }
    const fell: CompressResult = { blob: new Blob(['x']), fallback: '呢部機唔識自動轉正相片方向（EXIF）' }
    expect(ok.fallback).toBe('')
    expect(fell.fallback).not.toBe('')
  })
})

describe('空白 canvas 偵測 #1（`samplesLookUniform`）', () => {
  const white = [255, 255, 255, 255]
  const black = [0, 0, 0, 255]

  it('九點完全一樣 = 當佢空白', () => {
    expect(samplesLookUniform(Array.from({ length: 9 }, () => [...white]))).toBe(true)
    expect(samplesLookUniform(Array.from({ length: 9 }, () => [...black]))).toBe(true)
  })

  it('⛔ 一個 byte 唔同都唔算空白 —— 真相唔會九點全同', () => {
    const samples = Array.from({ length: 9 }, () => [...white])
    samples[4] = [255, 255, 254, 255]
    expect(samplesLookUniform(samples)).toBe(false)
  })

  it('⛔ 淨係 alpha 唔同都唔算空白', () => {
    const samples = Array.from({ length: 9 }, () => [...white])
    samples[8] = [255, 255, 255, 254]
    expect(samplesLookUniform(samples)).toBe(false)
  })

  it('證明唔到就 fail safe —— 冇取樣點當空白', () => {
    expect(samplesLookUniform([])).toBe(true)
  })
})

describe('⛔ 派號撞咗：有上限、有終點（Jason 工作指引第三節第三點）', () => {
  function seqConflict() {
    const e = new Error('quote_photos_slot_seq_uidx')
    e.name = 'SeqConflict'
    return e
  }

  it('撞一次就攞過個新號再試，唔會出錯', async () => {
    let n = 0
    const d = deps({
      allocateSeq: vi.fn(async () => ++n),
      saveRow: vi.fn(async () => {
        if (n === 1) throw seqConflict()
        return savedRow
      }),
    })
    const result = await uploadPending(pending(), d)
    expect(result.ok).toBe(true)
    expect(d.allocateSeq).toHaveBeenCalledTimes(2)
  })

  it('⛔ 最多試三次 —— 唔會無限試落去', async () => {
    const d = deps({ saveRow: vi.fn(async () => { throw seqConflict() }) })
    const result = await uploadPending(pending(), d)
    expect(result.ok).toBe(false)
    expect(d.allocateSeq).toHaveBeenCalledTimes(MAX_SEQ_ATTEMPTS)
  })

  it('到頂之後出終點文案 —— 一個具體動作加一個具體對象', async () => {
    const d = deps({ saveRow: vi.fn(async () => { throw seqConflict() }) })
    const result = await uploadPending(pending(), d)
    if (result.ok) throw new Error('應該失敗')
    expect(result.message).toBe(SEQ_GAVE_UP_MESSAGE)
    expect(SEQ_GAVE_UP_MESSAGE).toContain('再試一次')
    expect(SEQ_GAVE_UP_MESSAGE).toContain('同一格')
  })

  it('⛔ 每次之間要等一等，唔准連環撞', async () => {
    const d = deps({ saveRow: vi.fn(async () => { throw seqConflict() }) })
    await uploadPending(pending(), d)
    expect(d.wait).toHaveBeenCalledTimes(MAX_SEQ_ATTEMPTS - 1)
  })

  it('⛔ 派唔到號就唔會亂寫一行 —— 唔會叫 saveRow', async () => {
    const d = deps({ allocateSeq: vi.fn(async () => { throw new Error('冇網') }) })
    const result = await uploadPending(pending(), d)
    expect(result.ok).toBe(false)
    expect(d.saveRow).not.toHaveBeenCalled()
  })
})
