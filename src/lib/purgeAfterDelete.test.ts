import { describe, expect, it, vi } from 'vitest'
import { PHOTOS_REALLY_PURGED } from './deleteDialog'
import type { PendingPhoto } from './photoUpload'
import {
  LOCAL_READ_FAILED,
  LOCAL_REMOVE_FAILED,
  PURGE_OUTCOME_SHOWN,
  mayClearLocal,
  purgeAfterDelete,
  purgeOutcomeKind,
  type PurgeReply,
} from './purgeAfterDelete'

const REC = 'rec-1'

function reply(over: Partial<PurgeReply> = {}): PurgeReply {
  return {
    ok: true,
    purged: 0,
    alreadyDone: 0,
    nothingToClear: 0,
    remaining: 0,
    hitLimit: false,
    failed: [],
    message: '雲端相片已經清走。',
    ...over,
  }
}

function pending(operationId: string, recordId = REC): PendingPhoto {
  return {
    operationId,
    recordId,
    treeId: null,
    slot: 'env',
    status: 'pending',
    tries: 0,
    createdAt: 1,
    blob: new Blob(),
  } as unknown as PendingPhoto
}

/** 每一步叫咗未、叫咗幾時 —— ⭐ 呢個 array 就係「次序」呢條尺本身。 */
function deps(over: {
  reallyPurged?: boolean
  reply?: PurgeReply
  local?: PendingPhoto[]
  listThrows?: boolean
  removeThrows?: boolean
}) {
  const calls: string[] = []
  return {
    calls,
    deps: {
      reallyPurged: over.reallyPurged ?? true,
      recordId: REC,
      purge: async () => {
        calls.push('purge')
        return over.reply ?? reply()
      },
      listLocal: async () => {
        calls.push('listLocal')
        if (over.listThrows) throw new Error('IndexedDB 壞咗')
        return over.local ?? []
      },
      removeLocal: async (ids: string[]) => {
        calls.push(`removeLocal(${ids.join(',')})`)
        if (over.removeThrows) throw new Error('IndexedDB 壞咗')
        return ids.length
      },
    },
  }
}

describe('purgeOutcomeKind', () => {
  it('全部搞掂 ⇒ cleared', () => {
    expect(purgeOutcomeKind(reply({ ok: true, purged: 3 }))).toBe('cleared')
  })

  it('清咗一部分 ⇒ partial', () => {
    expect(purgeOutcomeKind(reply({ ok: false, purged: 2 }))).toBe('partial')
  })

  it('⛔ 撞上限就算一張都未成功，都係 partial ⛔ 唔係 refused', () => {
    // ⚠️ 呢個唔係吹毛求疵：hitLimit ⇒ 雲端仲有嘢未清 ⇒ 要撳「繼續清」。
    //    當咗 refused 就會講成「一個 byte 都冇掂過」，而嗰句係假嘅。
    expect(purgeOutcomeKind(reply({ ok: false, purged: 0, hitLimit: true }))).toBe('partial')
  })

  it('一張都冇清、又冇撞上限 ⇒ refused', () => {
    expect(purgeOutcomeKind(reply({ ok: false, purged: 0 }))).toBe('refused')
  })
})

describe('mayClearLocal', () => {
  it('⛔ 只有 cleared 一種先刪得部機', () => {
    expect(mayClearLocal('cleared')).toBe(true)
    expect(mayClearLocal('partial')).toBe(false)
    expect(mayClearLocal('refused')).toBe(false)
    expect(mayClearLocal('skipped')).toBe(false)
  })
})

describe('purgeAfterDelete 次序', () => {
  it('⛔⛔ 部機嗰步一定係最尾：purge → listLocal → removeLocal', async () => {
    const d = deps({ local: [pending('op-1'), pending('op-2')] })
    const out = await purgeAfterDelete(d.deps)
    expect(d.calls).toEqual(['purge', 'listLocal', 'removeLocal(op-1,op-2)'])
    expect(out.kind).toBe('cleared')
    expect(out.localRemoved).toBe(2)
  })

  it('⛔⛔ 雲端清唔晒（partial）⇒ ⛔ 連讀都唔讀部機，⛔ 一張都唔刪', async () => {
    const d = deps({ reply: reply({ ok: false, purged: 1, message: '只清走了一部分。' }) })
    const out = await purgeAfterDelete(d.deps)
    expect(d.calls).toEqual(['purge'])
    expect(out.kind).toBe('partial')
    expect(out.localRemoved).toBeNull()
    expect(out.message).toBe('只清走了一部分。')
  })

  it('⛔⛔ 俾人拒絕（refused）⇒ ⛔ 一張部機嘅相都唔刪', async () => {
    const d = deps({ reply: reply({ ok: false, purged: 0, message: '這一單不是你建立的。' }) })
    const out = await purgeAfterDelete(d.deps)
    expect(d.calls).toEqual(['purge'])
    expect(out.kind).toBe('refused')
    expect(out.localRemoved).toBeNull()
  })

  it('⛔ 只刪呢一單嘅相 —— 第二單嗰啲⛔ 唔准掂', async () => {
    const d = deps({ local: [pending('op-1'), pending('op-2', 'rec-2')] })
    await purgeAfterDelete(d.deps)
    expect(d.calls).toEqual(['purge', 'listLocal', 'removeLocal(op-1)'])
  })

  it('⛔ 部機一張都冇 ⇒ 照叫 removeLocal（佢自己收空 array 乜都唔做）', async () => {
    const d = deps({ local: [] })
    const out = await purgeAfterDelete(d.deps)
    expect(out.localRemoved).toBe(0)
  })
})

describe('purgeAfterDelete 閂住嗰陣', () => {
  it('⛔⛔ reallyPurged = false ⇒ 連個 fetch 都唔行，部機亦⛔ 一張都唔刪', async () => {
    const d = deps({ reallyPurged: false })
    const out = await purgeAfterDelete(d.deps)
    // ⭐ 呢條係反證：閂住嗰陣**一步都冇行過**，⛔ 唔係「行完當冇事」。
    expect(d.calls).toEqual([])
    expect(out).toEqual({ kind: 'skipped', message: null, localRemoved: null, localProblem: null })
  })
})

describe('purgeAfterDelete 部機嗰步撲街', () => {
  it('讀唔到部機 ⇒ ⛔ 唔 throw，出一句中文', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({ listThrows: true })
    const out = await purgeAfterDelete(d.deps)
    expect(out.kind).toBe('cleared')
    expect(out.localRemoved).toBeNull()
    expect(out.localProblem).toBe(LOCAL_READ_FAILED)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('刪唔到部機 ⇒ ⛔ 唔 throw，出一句中文', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({ local: [pending('op-1')], removeThrows: true })
    const out = await purgeAfterDelete(d.deps)
    expect(out.localProblem).toBe(LOCAL_REMOVE_FAILED)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('⛔⛔ flip 嘅次序', () => {
  /**
   * ⭐⭐ **呢條係一條會紅嘅尺，⛔ 唔係一句註解。**
   *
   * `/purge` 一次最多清 10 張（`worker/src/purge.mjs` `PURGE_BATCH_MAX`），
   * 而「清咗一半」係一個**完全正常**嘅回覆。冇一個位講返「仲有 N 張未清」，
   * 剩低嗰啲 bytes 就會永遠留喺雲端 —— ⚠️ 而單工程喺畫面上面已經冇咗，
   * ⛔ 冇人會知。
   *
   * ⇒ 所以 `PHOTOS_REALLY_PURGED` 變 `true` 之前，
   *   `PURGE_OUTCOME_SHOWN` 一定要先變 `true`（P8 步 5）。
   *
   * ⚠️⚠️ **要講白呢條尺自己欠乜**：佢攔唔住一個**明知而照 flip** 嘅人 ——
   *   兩個 boolean 一齊改就過到。⭐ 佢做到嘅係令嗰個決定**變成明知嘅**：
   *   flip 嗰日測試會紅，改嗰個人一定要嚟到呢度睇一次點解。
   */
  it('PHOTOS_REALLY_PURGED 真咗 ⇒ PURGE_OUTCOME_SHOWN 一定要已經真咗（P8 步 5）', () => {
    expect(PHOTOS_REALLY_PURGED && !PURGE_OUTCOME_SHOWN).toBe(false)
  })
})
