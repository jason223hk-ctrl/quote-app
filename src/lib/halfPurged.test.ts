import { describe, expect, it } from 'vitest'
import { PURGE_FEATURE_SINCE, groupHalfPurged, halfPurgedNote, halfPurgedPhotoCount } from './halfPurged'

// ⭐ 全部由 `PURGE_FEATURE_SINCE` 推出嚟：merge 嗰陣改個分界時間（一行），測試⛔ 唔使跟住改。
const HOUR_MS = 60 * 60 * 1000
const SINCE_MS = Date.parse(PURGE_FEATURE_SINCE)
const AFTER = new Date(SINCE_MS + HOUR_MS).toISOString()
const BEFORE = new Date(SINCE_MS - HOUR_MS).toISOString()

describe('步 5：刪咗一半', () => {
  it('⭐ 已刪 ＋ purged_at 空 ⇒ 算；清咗嘅唔算', () => {
    const out = groupHalfPurged(
      [{ id: 'r1', name: '測試單', deleted_at: AFTER }],
      [
        { record_id: 'r1', purged_at: null },
        { record_id: 'r1', purged_at: null },
        { record_id: 'r1', purged_at: AFTER },
      ],
    )
    expect(out).toEqual([{ recordId: 'r1', name: '測試單', photos: 2 }])
    expect(halfPurgedPhotoCount(out)).toBe(2)
    expect(halfPurgedNote(out)).toContain('2 張相片刪了一半')
  })

  it('⛔ AI 代揀：功能上線之前刪嘅單（當時寫「仍可取回」）⛔ 唔出', () => {
    expect(Date.parse(BEFORE)).toBeLessThan(Date.parse(PURGE_FEATURE_SINCE))
    const out = groupHalfPurged(
      [{ id: 'old', name: '舊單', deleted_at: BEFORE }],
      [{ record_id: 'old', purged_at: null }],
    )
    expect(out).toEqual([])
  })

  it('分界時間本身（`>=`）算；早一毫秒唔算', () => {
    const exact = new Date(SINCE_MS).toISOString()
    const justBefore = new Date(SINCE_MS - 1).toISOString()
    const out = groupHalfPurged(
      [
        { id: 'edge', name: '啱啱好', deleted_at: exact },
        { id: 'early', name: '早咗', deleted_at: justBefore },
      ],
      [
        { record_id: 'edge', purged_at: null },
        { record_id: 'early', purged_at: null },
      ],
    )
    expect(out).toEqual([{ recordId: 'edge', name: '啱啱好', photos: 1 }])
  })

  it('⛔ 未刪嘅單唔算；全部清晒 ⇒ 成行唔出', () => {
    const out = groupHalfPurged(
      [
        { id: 'live', name: 'x', deleted_at: null },
        { id: 'done', name: 'y', deleted_at: AFTER },
      ],
      [
        { record_id: 'live', purged_at: null },
        { record_id: 'done', purged_at: AFTER },
      ],
    )
    expect(out).toEqual([])
    expect(halfPurgedNote(out)).toBeNull()
  })
})
