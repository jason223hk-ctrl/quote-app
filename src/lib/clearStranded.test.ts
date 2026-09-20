import { describe, expect, it, vi } from 'vitest'
import { clearStranded } from './clearStranded'
import {
  strandedConfirm,
  strandedCount,
  strandedNote,
  strandedPending,
} from './orphanPhotos'
import { onlyOnPhoneCount, onlyOnPhoneWarning } from './purgeCounts'
import type { QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'

const photo = (p: Partial<PendingPhoto>): PendingPhoto => ({
  operationId: 'op1',
  recordId: '已刪嗰單',
  treeId: null,
  mitigation: null,
  capturedAt: '2026-09-14T09:00:00.000Z',
  size: 100,
  sha256: 'x',
  blob: new Blob(['x']),
  status: 'error',
  error: '寫唔入資料庫',
  attempts: 3,
  ...p,
})

const row = (operation_id: string, p: Partial<QuotePhoto> = {}): QuotePhoto =>
  ({
    id: 'p-' + operation_id,
    record_id: '已刪嗰單',
    operation_id,
    r2_synced_at: null,
    drive_synced_at: null,
    ...p,
  }) as unknown as QuotePhoto

/** 「仲喺度」嗰批工程。⛔ `已刪嗰單` 特登唔喺入面。 */
const LIVE = new Set(['仲喺度嗰單'])

/* ══════════════════════════════════════════════════════════════════
   Jason 2026-09-14 第 5 條：五樣要釘死。
   ══════════════════════════════════════════════════════════════════ */

describe('⛔ 釘死一：母單仲喺度 ⇒ 一張都無法清除', () => {
  it('母單仲喺度、又冇雲端副本 ⇒ ⛔ 照樣唔准清', () => {
    // ⚠️ 呢啲相**仲有機會傳得到**，而且可能係全世界唯一一份。
    const items = [photo({ operationId: 'a', recordId: '仲喺度嗰單' })]
    expect(strandedPending(items, [], LIVE)).toEqual([])
    expect(strandedCount(items, [], LIVE)).toBe(0)
  })

  it('⭐ 一半一半：只清母單冇咗嗰張，⛔ 唔郁另一張', () => {
    const items = [
      photo({ operationId: '母單仲喺度', recordId: '仲喺度嗰單' }),
      photo({ operationId: '母單冇咗' }),
    ]
    expect(strandedPending(items, [], LIVE).map((i) => i.operationId)).toEqual(['母單冇咗'])
  })

  it('⛔⛔ 唔知邊啲工程仲喺度（live === null）⇒ 一張都唔准清', () => {
    // ⚠️ 清單未載完嗰陣，每一單睇落都「刪咗」——
    //    當咗真就會一次過清走成部機所有未上載嘅相，而且冇得返轉頭。
    const items = [photo({ operationId: 'a' }), photo({ operationId: 'b' })]
    expect(strandedPending(items, [], null)).toEqual([])
    expect(strandedCount(items, [], null)).toBe(0)
  })
})

describe('⛔ 釘死二：有雲端副本 ⇒ 無法清除', () => {
  it('部機話已經上到（uploaded）⇒ ⛔ 唔准清', () => {
    expect(strandedPending([photo({ operationId: 'a', status: 'uploaded' })], [], LIVE)).toEqual([])
  })

  it('⭐ 資料庫有行（就算兩個 synced 都仲係 null）⇒ ⛔ 都唔准清', () => {
    // ⚠️ 部機話 error 但 DB 其實寫咗行，係有可能嘅（寫成功但覆返嚟嗰下斷咗）。
    //    ⭐ 寧願少清一張。
    const items = [photo({ operationId: 'a' })]
    expect(strandedPending(items, [row('a')], LIVE)).toEqual([])
  })

  it('資料庫有行、而且已經上到 Drive ⇒ ⛔ 更加唔准清', () => {
    const items = [photo({ operationId: 'a' })]
    const rows = [row('a', { drive_synced_at: '2026-09-14T10:00:00.000Z' })]
    expect(strandedPending(items, rows, LIVE)).toEqual([])
  })
})

describe('⭐ 釘死三：兩樣都中先至清得', () => {
  it('母單刪咗 ＋ 冇雲端副本 ＋ DB 冇行 ⇒ 清得', () => {
    const items = [photo({ operationId: 'a' })]
    expect(strandedPending(items, [], LIVE).map((i) => i.operationId)).toEqual(['a'])
    expect(strandedCount(items, [], LIVE)).toBe(1)
  })

  it('三種未上到嘅狀態（local / uploading / error）都算', () => {
    const items = [
      photo({ operationId: 'a', status: 'local' }),
      photo({ operationId: 'b', status: 'uploading' }),
      photo({ operationId: 'c', status: 'error' }),
    ]
    expect(strandedCount(items, [], LIVE)).toBe(3)
  })
})

describe('⛔ 釘死四：N ＝ 0 嗰陣成行唔出', () => {
  it('零 ⇒ 回 null（⛔ 唔係一句「冇嘢清」，係成行都冇）', () => {
    expect(strandedNote(0)).toBe(null)
    expect(strandedNote(-1)).toBe(null)
  })

  it('唔係零 ⇒ 寫出實數', () => {
    expect(strandedNote(3)).toBe('有 3 張相片無法上傳，而它們所屬的工程已經刪除')
  })
})

describe('⛔⛔ 確認嗰句：唔准縮成「確定嗎」', () => {
  it('⭐ 三樣缺一不可：實數、只剩部機一份、清除後就真的沒有了', () => {
    const text = strandedConfirm(3)
    expect(text).toContain('3')
    expect(text).toContain('全世界只剩本裝置這一份')
    expect(text).toContain('清除後就真的沒有了')
  })

  it('⛔ 唔准出現「確定」呢種空話', () => {
    expect(strandedConfirm(1)).not.toContain('確定')
  })
})

describe('⭐ 釘死五：刪工程嗰陣 N > 0 一定要出多一行', () => {
  /* ⚠️ 2026-09-15：呢組本來釘住 `deleteUnsyncedWarning` / `unsyncedInRecord`。
     嗰兩個拆咗（danger zone 一拆就冇人叫佢哋），⭐ **但呢條要求冇取消** ——
     ⛔ 所以呢組改為釘住而家真係用緊嗰兩個（`purgeCounts.ts`），
     ⚠️ 唔係就變成「測試仲喺度，但佢守緊一段死 code」。 */
  it('呢一單有未傳嘅相 ⇒ 出，而且寫出實數', () => {
    expect(onlyOnPhoneWarning(2)).toBe(
      '⚠️ 此單仍有 2 張相片只剩本裝置這一份（未上傳到雲端）。清除後就真正永遠消失。',
    )
  })

  it('⛔ 零就唔出', () => {
    expect(onlyOnPhoneWarning(0)).toBe(null)
  })

  it('⛔⛔ 無法獲取本裝置（null）⇒ 都唔出，⛔ 唔准當零', () => {
    expect(onlyOnPhoneWarning(null)).toBe(null)
    expect(onlyOnPhoneCount('r1', null)).toBe(null)
  })

  it('onlyOnPhoneCount 只數呢一單、只數未傳嗰啲', () => {
    const items = [
      photo({ operationId: 'a', recordId: 'r1', status: 'error' }),
      photo({ operationId: 'b', recordId: 'r1', status: 'local' }),
      photo({ operationId: 'c', recordId: 'r1', status: 'uploaded' }),
      photo({ operationId: 'd', recordId: 'r2', status: 'error' }),
    ]
    expect(onlyOnPhoneCount('r1', items)).toBe(2)
    expect(onlyOnPhoneCount('r2', items)).toBe(1)
    expect(onlyOnPhoneCount('冇呢單', items)).toBe(0)
  })

  it('⭐ 呢個數⛔ 唔理母單刪咗未 —— 問嗰陣母單仲喺度', () => {
    expect(onlyOnPhoneCount('仲喺度嗰單', [photo({ recordId: '仲喺度嗰單' })])).toBe(1)
  })
})

/* ══════════════════════════════════════════════════════════════════
   撳落去嗰一刻先計、先刪。
   ══════════════════════════════════════════════════════════════════ */

describe('clearStranded —— ⛔ 唔用畫面上面個數', () => {
  it('⭐⭐ 由 render 到撳落去中間傳成功咗 ⇒ 嗰張⛔ 唔會俾人刪', async () => {
    // 畫面 render 嗰陣有兩張；撳落去嗰刻 `b` 已經上到（背景重傳做嘅）。
    const remove = vi.fn().mockResolvedValue(1)
    const result = await clearStranded({
      listLocal: async () => [photo({ operationId: 'a' }), photo({ operationId: 'b', status: 'uploaded' })],
      listRows: async () => [row('b', { r2_synced_at: '2026-09-14T10:00:00.000Z' })],
      live: LIVE,
      remove,
    })
    expect(remove).toHaveBeenCalledWith(['a'])
    expect(result).toEqual({ removed: 1, blocked: null })
  })

  it('⛔⛔ live === null ⇒ 乜都唔清，而且要出一句中文', async () => {
    const remove = vi.fn()
    const result = await clearStranded({
      listLocal: async () => [photo({ operationId: 'a' })],
      listRows: async () => [],
      live: null,
      remove,
    })
    expect(remove).not.toHaveBeenCalled()
    expect(result.removed).toBe(0)
    expect(result.blocked).toContain('無法獲取工程清單')
  })

  it('⛔⛔ 無法向雲端查詢 ⇒ 一張都唔清（保守方向）', async () => {
    // ⚠️ 問唔到就唔敢講「雲端冇呢張」。反過嚟嗰個錯係冇得返轉頭嘅。
    const remove = vi.fn()
    const result = await clearStranded({
      listLocal: async () => [photo({ operationId: 'a' })],
      listRows: async () => {
        throw new Error('冇網')
      },
      live: LIVE,
      remove,
    })
    expect(remove).not.toHaveBeenCalled()
    expect(result.blocked).toContain('無法向雲端查詢')
  })

  it('無法獲取本裝置 ⇒ 一張都唔清', async () => {
    const remove = vi.fn()
    const result = await clearStranded({
      listLocal: async () => {
        throw new Error('IndexedDB 壞咗')
      },
      listRows: async () => [],
      live: LIVE,
      remove,
    })
    expect(remove).not.toHaveBeenCalled()
    expect(result.blocked).toContain('無法獲取本裝置')
  })

  it('⭐ 撳落去嗰刻已經冇嘢清 ⇒ 唔算出錯（⛔ 唔准出紅字）', async () => {
    const remove = vi.fn()
    const result = await clearStranded({
      listLocal: async () => [photo({ operationId: 'a', status: 'uploaded' })],
      listRows: async () => [row('a', { r2_synced_at: '2026-09-14T10:00:00.000Z' })],
      live: LIVE,
      remove,
    })
    expect(remove).not.toHaveBeenCalled()
    expect(result).toEqual({ removed: 0, blocked: null })
  })

  it('⛔ 刪唔到都唔准 throw —— 兩段式撳落去之後冇人接得住', async () => {
    const result = await clearStranded({
      listLocal: async () => [photo({ operationId: 'a' })],
      listRows: async () => [],
      live: LIVE,
      remove: async () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(result.removed).toBe(0)
    expect(result.blocked).toContain('無法清除')
    // ⛔ 中文，⛔ 唔准彈英文原文出畫面。
    expect(result.blocked).not.toContain('QuotaExceededError')
  })

  it('⛔ 只會交出計出嚟嗰批編號，⛔ 冇「全部清」', async () => {
    const remove = vi.fn().mockResolvedValue(2)
    await clearStranded({
      listLocal: async () => [
        photo({ operationId: 'a' }),
        photo({ operationId: 'b' }),
        photo({ operationId: '母單仲喺度', recordId: '仲喺度嗰單' }),
      ],
      listRows: async () => [],
      live: LIVE,
      remove,
    })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(['a', 'b'])
  })
})
