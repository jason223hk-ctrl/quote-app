import { describe, expect, it } from 'vitest'
import type { PendingPhoto } from './photoUpload'
import { ALL_DONE_MS, celebrateFor, pendingCount, pendingLabel } from './pendingCount'

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

describe('pendingCount', () => {
  it('一張相都冇就係零', () => {
    expect(pendingCount([])).toBe(0)
  })

  it('影咗未上（local）要數', () => {
    expect(pendingCount([photo({ status: 'local' })])).toBe(1)
  })

  it('上緊（uploading）都要數 —— 未寫得成 R2 之前仍然係得部機一份', () => {
    expect(pendingCount([photo({ status: 'uploading' })])).toBe(1)
  })

  it('上失敗（error）要數', () => {
    expect(pendingCount([photo({ status: 'error', attempts: 3 })])).toBe(1)
  })

  it('⛔ 上到咗 R2 嗰啲唔數', () => {
    expect(pendingCount([photo({ status: 'uploaded' })])).toBe(0)
  })

  it('⛔⛔ R2 有咗、Drive 未抄 —— 一樣唔數（Jason 2026-09-06 揀甲）', () => {
    // Drive 抄咗未係本機 `driveAttempts` / `driveError` 嗰兩個欄嘅事，
    // ⛔ 佢哋一個字都唔應該影響到個數 —— 否則個數長期唔會係零。
    const items = [
      photo({ operationId: 'a', status: 'uploaded', driveAttempts: 2, driveError: '抄唔到' }),
      photo({ operationId: 'b', status: 'uploaded', driveAttempts: 0 }),
    ]
    expect(pendingCount(items)).toBe(0)
  })

  it('撈埋一齊：三張未上、兩張上咗 → 三', () => {
    const items = [
      photo({ operationId: '1', status: 'local' }),
      photo({ operationId: '2', status: 'error' }),
      photo({ operationId: '3', status: 'uploading' }),
      photo({ operationId: '4', status: 'uploaded' }),
      photo({ operationId: '5', status: 'uploaded', driveError: '抄唔到' }),
    ]
    expect(pendingCount(items)).toBe(3)
  })
})

describe('pendingLabel', () => {
  it('⛔ 永遠淨係呢一句 —— 有網冇網都一樣（Jason 2026-09-06：訊息要一致）', () => {
    expect(pendingLabel(1)).toBe('未上載 1 張')
    expect(pendingLabel(47)).toBe('未上載 47 張')
  })
})

describe('celebrateFor', () => {
  it('由有變冇 → 出「全部上晒」', () => {
    expect(celebrateFor(1, 0)).toBe(true)
    expect(celebrateFor(47, 0)).toBe(true)
  })

  it('⛔ 開 app 本身就係零 → 唔慶祝', () => {
    expect(celebrateFor(0, 0)).toBe(false)
  })

  it('⛔ 由五跌到一 → 未上晒，唔慶祝', () => {
    expect(celebrateFor(5, 1)).toBe(false)
  })

  it('⛔ 由零升到有（又影多張）→ 唔慶祝', () => {
    expect(celebrateFor(0, 3)).toBe(false)
  })

  it('停兩秒 —— Jason 2026-09-06 拍板', () => {
    expect(ALL_DONE_MS).toBe(2000)
  })
})
