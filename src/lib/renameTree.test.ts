import { describe, expect, it } from 'vitest'
import { callRenameTree, needsDriveRename, RENAME_UNREACHABLE, renameTreeFiles, renameUntilDone, type RenameResponse } from './renameTree'
import { bannerText, diagLine, diagSummary, listPending, STALE_MS, type KeyValueStore } from './renamePending'

function memStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const res = (over: Partial<RenameResponse>): RenameResponse => ({
  ok: false, renamed: 0, hitLimit: false, failed: [], cannot: [], ...over,
})
const CLASH = 'Drive 上已經有另一個檔案叫「21_Whole View_01_Before.jpg」，⛔ 不會冒險修改（改了兩個檔案就會同名）。請截圖並聯絡 Jason。'
const TREE = { accessToken: 't', treeId: 'tree-1', recordId: 'rec-1', treeNo: '21' }
const T0 = new Date('2026-10-04T01:00:00Z')

describe('needsDriveRename', () => {
  it('樹牌變咗先改；頭尾空格唔算', () => {
    expect(needsDriveRename('12', '21')).toBe(true)
    expect(needsDriveRename('12', ' 12 ')).toBe(false)
  })
})

describe('renameUntilDone', () => {
  it('一次搞掂 ⇒ ok', async () => {
    expect(await renameUntilDone(async () => res({ ok: true, renamed: 6 }))).toEqual({ ok: true, renamed: 6 })
  })

  it('⭐ hitLimit 而冇失敗 ⇒ 自動叫下一轉，張數加埋', async () => {
    const replies = [res({ renamed: 12, hitLimit: true }), res({ ok: true, renamed: 3 })]
    let calls = 0
    const out = await renameUntilDone(async () => replies[calls++])
    expect(calls).toBe(2)
    expect(out).toEqual({ ok: true, renamed: 15 })
  })

  it('⛔ 自動接住改有上限 —— 唔准死循環', async () => {
    let calls = 0
    const out = await renameUntilDone(async () => {
      calls += 1
      return res({ renamed: 12, hitLimit: true })
    }, 3)
    expect(calls).toBe(3)
    expect(out).toEqual({ ok: false, left: null, reasons: [], hitLimit: true })
  })

  it('⛔ 有失敗 ⇒ 即刻停（⛔ 唔係失敗重試）；英文錯誤唔出，中文撞名句照出、去重', async () => {
    let calls = 0
    const out = await renameUntilDone(async () => {
      calls += 1
      return res({
        renamed: 2,
        hitLimit: true,
        failed: [
          { photoId: 'a', why: 'TypeError: Failed to fetch' },
          { photoId: 'b', why: CLASH },
          { photoId: 'c', why: CLASH },
        ],
      })
    })
    expect(calls).toBe(1)
    expect(out).toEqual({ ok: false, left: null, reasons: [CLASH], hitLimit: true })
  })

  it('冇 hitLimit ⇒ left ＝ 失敗 ＋ 算唔到名', async () => {
    const out = await renameUntilDone(async () =>
      res({ renamed: 3, failed: [{ photoId: 'a', why: 'x' }], cannot: [{ photoId: 'b', why: '這張相片的次序是 0' }] }),
    )
    expect(out).toEqual({ ok: false, left: 2, reasons: ['這張相片的次序是 0'], hitLimit: false })
  })

  it('⛔ 叫唔到（throw）⇒ 唔 throw 出去，left 唔知', async () => {
    const out = await renameUntilDone(async () => {
      throw new Error(RENAME_UNREACHABLE)
    })
    expect(out).toEqual({ ok: false, left: null, reasons: [RENAME_UNREACHABLE], hitLimit: false })
  })
})

describe('renameTreeFiles ＋ 記錄', () => {
  it('⭐ 叫之前先記「改名中」—— 熄咗 app 都唔會唔見', async () => {
    const store = memStore()
    let seenDuring: ReturnType<typeof listPending> = []
    await renameTreeFiles(TREE, {
      store,
      now: () => T0,
      call: async () => {
        seenDuring = listPending(T0, store)
        return res({ ok: true, renamed: 1 })
      },
    })
    expect(seenDuring).toHaveLength(1)
    expect(seenDuring[0].running).toBe(true)
  })

  it('⭐ 成功 ⇒ 清走（橫幅同設定頁一齊冇）', async () => {
    const store = memStore()
    await renameTreeFiles(TREE, { store, now: () => T0, call: async () => res({ failed: [{ photoId: 'a', why: 'x' }] }) })
    expect(listPending(T0, store)).toHaveLength(1)
    await renameTreeFiles(TREE, { store, now: () => T0, call: async () => res({ ok: true, renamed: 1 }) })
    expect(listPending(T0, store)).toEqual([])
    expect(diagLine([])).toBe('無')
    expect(diagSummary([])).toBeNull()
  })

  it('失敗 ⇒ 橫幅、設定頁兩個位都有字', async () => {
    const store = memStore()
    await renameTreeFiles(TREE, {
      store,
      now: () => T0,
      call: async () => res({ renamed: 2, failed: [{ photoId: 'a', why: 'x' }, { photoId: 'b', why: 'y' }, { photoId: 'c', why: 'z' }, { photoId: 'd', why: 'w' }] }),
    })
    const items = listPending(T0, store)
    expect(bannerText(items[0])).toBe('有 4 張相片的檔名未能更改，Drive 上仍然是舊樹牌。')
    expect(diagLine(items)).toBe('#21 · 4 張')
    expect(diagSummary(items)).toBe('有問題：1 個樹牌的 Drive 檔名修改到一半停止，請返回該棵樹點擊「再試」。')
  })

  it('⭐「改名中」過咗 STALE_MS ⇒ 當失敗，照出橫幅', async () => {
    const store = memStore()
    let stuckDuring: ReturnType<typeof listPending> = []
    await renameTreeFiles(TREE, {
      store,
      now: () => T0,
      call: async () => {
        stuckDuring = listPending(new Date(T0.getTime() + STALE_MS + 1), store)
        return res({ ok: true, renamed: 1 })
      },
    })
    expect(stuckDuring[0].running).toBe(false)
    expect(bannerText(stuckDuring[0])).toBe('Drive 上部分相片的檔名未能更改，仍然是舊樹牌。')
  })

  it('⛔ 改名中 ⇒ 唔出橫幅（等緊結果）', () => {
    expect(bannerText({ ...TREE, left: 3, reasons: [], hitLimit: false, running: true, at: T0.toISOString() })).toBeNull()
  })

  it('⛔ 記錄壞咗（JSON 爛）⇒ 當冇，⛔ 唔准 throw', () => {
    const store = memStore()
    store.data.set('quote-app.rename-pending.v1', '{爛')
    expect(listPending(T0, store)).toEqual([])
  })
})

describe('callRenameTree', () => {
  it('⛔ 冇網 ⇒ 一句中文，⛔ 唔係 TypeError', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    // photoWorkerBase() 喺測試環境係空 ⇒ 先撞「未設定」嗰句；兩句都係中文。
    await expect(callRenameTree('t', 'tree-1', fetchImpl)).rejects.toThrow(/[\u3400-\u9fff]/)
  })
})
