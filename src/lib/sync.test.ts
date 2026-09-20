import { describe, expect, it } from 'vitest'
import type { QuotePhoto } from './photos'
import {
  allDone,
  byRecord,
  lastSyncedAt,
  photoSyncState,
  photoWhere,
  DRIVE_AUTH_EXPIRED_MESSAGE,
  DRIVE_LOGIN_FAILED_MESSAGE,
  isDriveAuthExpired,
  syncAdvice,
  syncCounts,
  treeNoMap,
} from './sync'

const row = (p: Partial<QuotePhoto>): QuotePhoto =>
  ({
    id: 'p1',
    record_id: 'r1',
    tree_id: 't1',
    mitigation: null,
    seq: 1,
    operation_id: 'op',
    r2_key: 'k',
    r2_synced_at: '2026-09-01T00:00:00Z',
    r2_error: '',
    drive_file_id: '',
    drive_synced_at: null,
    drive_error: '',
    size_bytes: 1,
    sha256: 'x',
    captured_at: null,
    deleted_at: null,
    ...p,
  }) as unknown as QuotePhoto

describe('photoSyncState', () => {
  it('入咗 Drive ＝ 已同步', () => {
    expect(photoSyncState(row({ drive_synced_at: '2026-09-01T01:00:00Z' }))).toBe('synced')
  })

  it('⭐ 之前失敗過、之後成功 → 算成功，⛔ 唔可以仲當佢失敗', () => {
    expect(
      photoSyncState(row({ drive_error: '一次過唔到', drive_synced_at: '2026-09-01T01:00:00Z' })),
    ).toBe('synced')
  })

  it('有錯 ＝ 失敗', () => {
    expect(photoSyncState(row({ drive_error: 'quota' }))).toBe('failed')
    expect(photoSyncState(row({ r2_error: 'offline' }))).toBe('failed')
  })

  it('冇錯又未入 Drive ＝ 待同步（系統會自己搞掂，人唔使做嘢）', () => {
    expect(photoSyncState(row({}))).toBe('pending')
  })
})

describe('syncCounts', () => {
  it('三個數分開，⛔ 待同步同失敗唔可以溝埋', () => {
    expect(
      syncCounts([
        row({ id: '1', drive_synced_at: 'x' }),
        row({ id: '2' }),
        row({ id: '3', drive_error: 'e' }),
        row({ id: '4' }),
      ]),
    ).toEqual({ synced: 1, pending: 2, failed: 1 })
  })

  it('⛔ 刪咗嘅相唔數', () => {
    expect(syncCounts([row({ deleted_at: '2026-09-01' })])).toEqual({
      synced: 0,
      pending: 0,
      failed: 0,
    })
  })
})

describe('allDone', () => {
  it('一張相都冇都算掂', () => {
    expect(allDone({ synced: 0, pending: 0, failed: 0 })).toBe(true)
  })

  it('有一張待同步就未掂', () => {
    expect(allDone({ synced: 9, pending: 1, failed: 0 })).toBe(false)
  })
})

describe('byRecord', () => {
  it('逐個工程一行', () => {
    const out = byRecord([
      row({ id: '1', record_id: 'a', drive_synced_at: 'x' }),
      row({ id: '2', record_id: 'b' }),
      row({ id: '3', record_id: 'a' }),
    ])
    expect(out).toHaveLength(2)
    expect(out.find((r) => r.recordId === 'a')?.counts).toEqual({
      synced: 1,
      pending: 1,
      failed: 0,
    })
  })
})

describe('lastSyncedAt', () => {
  it('攞最新嗰個', () => {
    expect(
      lastSyncedAt([
        row({ id: '1', drive_synced_at: '2026-09-01T00:00:00Z' }),
        row({ id: '2', drive_synced_at: '2026-09-02T00:00:00Z' }),
      ]),
    ).toBe('2026-09-02T00:00:00Z')
  })

  it('⛔ 冇成功過就回 null，唔可以出一個假時間', () => {
    expect(lastSyncedAt([row({})])).toBeNull()
  })
})

describe('photoWhere', () => {
  it('環境相唔屬於任何一棵樹', () => {
    expect(photoWhere(row({ tree_id: null }), null)).toBe('環境相')
  })

  it('樹相出樹牌', () => {
    expect(photoWhere(row({}), 'T04')).toBe('T04・全景相')
    // ⛔ 出中文工序名，唔係 `crown_cleaning` 呢啲代號。
    expect(photoWhere(row({ mitigation: 'crown_cleaning' }), 'T04')).toBe('T04・清理樹冠')
  })

  it('⛔ 冇樹牌唔可以出一個空白', () => {
    expect(photoWhere(row({}), '')).toBe('（未填樹牌）・全景相')
  })
})

describe('syncAdvice', () => {
  it('worker 自己寫嘅永久性錯誤 ＝ 要人做嘢', () => {
    const advice = syncAdvice(
      row({ drive_error: 'Drive 上面已經有一個叫「1_Removal_01_Before.jpg」嘅檔…請截圖搵 Jason。' }),
    )
    expect(advice.permanent).toBe(true)
    expect(advice.text).toContain('需要處理')
  })

  /**
   * ⚠️ 呢句係 2026-09-06 真機**原文照抄**，⛔ 唔准改短、⛔ 唔准「大概咁上下」——
   * 呢條測試存在嘅唯一理由，就係「下次真係出呢句嘅時候認得返」。
   */
  const REAL_ERROR = 'Drive 登入失敗（400：Token has been expired or revoked.）'

  it('⭐ Drive 授權過期（2026-09-06 真機原文）＝ 認得出，⛔ 唔再係「認唔出」', () => {
    const advice = syncAdvice(row({ drive_error: REAL_ERROR }))
    expect(advice.permanent).toBe(true)
    expect(advice.text).toBe(DRIVE_AUTH_EXPIRED_MESSAGE)
    expect(advice.text).not.toContain('認唔出')
  })

  it('⛔ 句嘢一定要講明相冇事 —— 阿耀見到「失敗」會以為張相冇咗', () => {
    const advice = syncAdvice(row({ drive_error: REAL_ERROR }))
    expect(advice.text).toContain('不會丟失')
  })

  it('⛔ 唔准當佢暫時性、⛔ 唔准講「系統會自動再試」', () => {
    const advice = syncAdvice(row({ drive_error: REAL_ERROR }))
    expect(advice.permanent).toBe(true)
    expect(advice.text).not.toContain('自動再試')
    expect(advice.text).not.toContain('無需處理')
  })

  it('⛔ 唔准跌落「額滿或者冇權限」嗰句 —— 嗰句叫唔到人去重新授權', () => {
    const advice = syncAdvice(row({ drive_error: 'Drive 登入失敗（401：invalid_grant）' }))
    expect(advice.text).toBe(DRIVE_AUTH_EXPIRED_MESSAGE)
    expect(advice.text).not.toContain('額滿')
  })

  it('登入唔到但唔係過期（invalid_client）＝ 另一句，⛔ 因為修法唔同', () => {
    const advice = syncAdvice(row({ drive_error: 'Drive 登入失敗（400：invalid_client）' }))
    expect(advice.permanent).toBe(true)
    expect(advice.text).toBe(DRIVE_LOGIN_FAILED_MESSAGE)
    expect(advice.text).toContain('不會丟失')
  })

  it('Google 額滿／冇權限 ＝ 要人做嘢', () => {
    expect(syncAdvice(row({ drive_error: 'error 403: storageQuotaExceeded' })).permanent).toBe(true)
  })

  it('認得出係一時三刻嘅問題先講唔使做嘢', () => {
    const advice = syncAdvice(row({ drive_error: 'R2 讀唔返出嚟（503）' }))
    expect(advice.permanent).toBe(false)
    expect(advice.text).toContain('無需處理')
  })

  it('⛔ 落唔到類就當要人睇，⛔ 唔准出「無需處理」', () => {
    const advice = syncAdvice(row({ drive_error: 'zzz 乜都唔似' }))
    expect(advice.permanent).toBe(true)
    expect(advice.text).not.toContain('無需處理')
  })

  it('drive_error 空就睇 r2_error', () => {
    expect(syncAdvice(row({ drive_error: '', r2_error: 'fetch failed' })).permanent).toBe(false)
  })
})

describe('isDriveAuthExpired', () => {
  it('認得三句 —— 真機嗰句、Google 個 error code、俾人 revoke', () => {
    expect(isDriveAuthExpired('Token has been expired or revoked.')).toBe(true)
    expect(isDriveAuthExpired('invalid_grant')).toBe(true)
    expect(isDriveAuthExpired('unauthorized_client')).toBe(true)
  })

  it('⛔ 唔關事嘅嘢唔准當授權過期', () => {
    expect(isDriveAuthExpired('R2 讀唔返出嚟（503）')).toBe(false)
    expect(isDriveAuthExpired('storageQuotaExceeded')).toBe(false)
    expect(isDriveAuthExpired('')).toBe(false)
  })
})

describe('treeNoMap', () => {
  it('id 換樹牌', () => {
    expect(treeNoMap([{ id: 't1', tree_no: 'T04' }])).toEqual({ t1: 'T04' })
  })

  it('⛔ 搵唔到就係 undefined，⛔ 唔准變咗一個空白樹牌', () => {
    expect(treeNoMap([])['t9']).toBeUndefined()
  })
})
