import { describe, expect, it } from 'vitest'
import type { QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'
import type { QuoteTree } from './trees'
import {
  CANNOT_COUNT_MESSAGE,
  canPurge,
  onlyOnPhoneCount,
  onlyOnPhoneWarning,
  purgeCounts,
  purgeCountsLabel,
} from './purgeCounts'

const tree = (p: Partial<QuoteTree>): QuoteTree =>
  ({ id: 't', record_id: 'r1', deleted_at: null, ...p }) as unknown as QuoteTree

const row = (p: Partial<QuotePhoto>): QuotePhoto =>
  ({
    id: 'p',
    record_id: 'r1',
    operation_id: 'op1',
    deleted_at: null,
    ...p,
  }) as unknown as QuotePhoto

const local = (p: Partial<PendingPhoto>): PendingPhoto => ({
  operationId: 'op1',
  recordId: 'r1',
  treeId: null,
  mitigation: null,
  capturedAt: '2026-09-14T09:00:00.000Z',
  size: 10,
  sha256: 'x',
  blob: new Blob(['x']),
  status: 'uploaded',
  error: '',
  attempts: 0,
  ...p,
})

describe('⛔⛔ 數唔到就唔准出一個數', () => {
  it('樹攞唔到 ⇒ null', () => {
    expect(purgeCounts('r1', null, [], [])).toBe(null)
  })

  it('雲端攞唔到 ⇒ null', () => {
    expect(purgeCounts('r1', [], null, [])).toBe(null)
  })

  it('部機讀唔到 ⇒ null', () => {
    expect(purgeCounts('r1', [], [], null)).toBe(null)
  })

  it('⭐⭐ 數唔到⛔ 唔准出 0 —— 出 0 等於講「冇嘢會消失」', () => {
    const counts = purgeCounts('r1', null, null, null)
    expect(counts).toBe(null)
    expect(counts).not.toEqual({ trees: 0, photos: 0 })
  })

  it('⛔⛔ 數唔到就撳唔落 —— 一個冇得反悔嘅動作唔可以喺唔知情之下發生', () => {
    expect(canPurge(null)).toBe(false)
    expect(canPurge({ trees: 0, photos: 0 })).toBe(true)
  })

  it('數唔到嗰句要中文、要講得出下一步', () => {
    expect(CANNOT_COUNT_MESSAGE).toContain('唔敢刪')
    expect(CANNOT_COUNT_MESSAGE).toContain('WhatsApp 搵 Jason')
  })

  it('數唔到 ⇒ ⛔ 唔出「連帶消失」嗰行', () => {
    expect(purgeCountsLabel(null)).toBe(null)
  })

  it('⭐ 部機冇得讀（唔係讀失敗）⇒ 叫嗰邊傳 []，照數得到', () => {
    // ⚠️ 「呢部機根本冇本地相」同「讀失敗」係兩件事，⛔ 唔可以撈埋。
    expect(purgeCounts('r1', [tree({})], [row({})], [])).toEqual({ trees: 1, photos: 1 })
  })
})

describe('數樹', () => {
  it('只數呢一單', () => {
    const trees = [tree({ id: 'a' }), tree({ id: 'b' }), tree({ id: 'c', record_id: 'r2' })]
    expect(purgeCounts('r1', trees, [], [])?.trees).toBe(2)
  })

  it('⛔ 已經軟刪咗嘅唔數', () => {
    const trees = [tree({ id: 'a' }), tree({ id: 'b', deleted_at: '2026-09-01T00:00:00Z' })]
    expect(purgeCounts('r1', trees, [], [])?.trees).toBe(1)
  })

  it('一棵都冇 ⇒ 0（⭐ 呢個 0 係量過嘅，⛔ 唔係「數唔到」）', () => {
    const counts = purgeCounts('r1', [], [], [])
    expect(counts).toEqual({ trees: 0, photos: 0 })
    expect(canPurge(counts)).toBe(true)
  })
})

describe('數相 —— ⭐ 雲端同部機夾埋，用影相編號去重', () => {
  it('同一張相兩邊都有 ⇒ 只數一次', () => {
    expect(purgeCounts('r1', [], [row({ operation_id: 'a' })], [local({ operationId: 'a' })])?.photos).toBe(1)
  })

  it('雲端有、部機冇 ⇒ 數', () => {
    expect(purgeCounts('r1', [], [row({ operation_id: 'a' })], [])?.photos).toBe(1)
  })

  it('⭐ 部機有、雲端冇（RLS 拒絕嗰啲）⇒ 一樣要數', () => {
    // ⚠️ 呢啲正正就係「只剩部機一份」嗰批 —— ⛔ 唔數就等於話俾人聽佢哋唔會冇咗。
    expect(purgeCounts('r1', [], [], [local({ operationId: 'a', status: 'error' })])?.photos).toBe(1)
  })

  it('只數呢一單，⛔ 唔數第二單', () => {
    const rows = [row({ operation_id: 'a' }), row({ operation_id: 'b', record_id: 'r2' })]
    const items = [local({ operationId: 'c' }), local({ operationId: 'd', recordId: 'r2' })]
    expect(purgeCounts('r1', [], rows, items)?.photos).toBe(2)
  })

  it('⛔ 雲端已經軟刪咗嗰行唔數', () => {
    const rows = [row({ operation_id: 'a' }), row({ operation_id: 'b', deleted_at: '2026-09-01T00:00:00Z' })]
    expect(purgeCounts('r1', [], rows, [])?.photos).toBe(1)
  })

  it('三張唔同相 ⇒ 3，⛔ 唔會數多', () => {
    const rows = [row({ operation_id: 'a' }), row({ operation_id: 'b' })]
    const items = [local({ operationId: 'b' }), local({ operationId: 'c' })]
    expect(purgeCounts('r1', [], rows, items)?.photos).toBe(3)
  })
})

describe('「連帶消失」嗰行字（Jason 2026-09-14 最終截圖逐字）', () => {
  it('逐字對', () => {
    expect(purgeCountsLabel({ trees: 2, photos: 4 })).toBe('連帶消失：2 棵樹、4 張相')
  })

  it('⭐ 零都要出 —— 「連帶消失：0 棵樹、0 張相」係一句有用嘅話', () => {
    expect(purgeCountsLabel({ trees: 0, photos: 0 })).toBe('連帶消失：0 棵樹、0 張相')
  })
})

describe('⚠️ 「只剩部機呢一份」—— ⛔ 同上面兩個 N 係兩件事', () => {
  it('未上到嗰啲先算', () => {
    const items = [
      local({ operationId: 'a', status: 'uploaded' }),
      local({ operationId: 'b', status: 'error' }),
      local({ operationId: 'c', status: 'local' }),
      local({ operationId: 'd', status: 'uploading' }),
    ]
    expect(onlyOnPhoneCount('r1', items)).toBe(3)
  })

  it('只數呢一單', () => {
    const items = [
      local({ operationId: 'a', status: 'error' }),
      local({ operationId: 'b', status: 'error', recordId: 'r2' }),
    ]
    expect(onlyOnPhoneCount('r1', items)).toBe(1)
  })

  it('⛔ 讀唔到部機 ⇒ null，⛔ 唔係 0', () => {
    expect(onlyOnPhoneCount('r1', null)).toBe(null)
  })

  it('零 ⇒ ⛔ 唔出嗰行', () => {
    expect(onlyOnPhoneWarning(0)).toBe(null)
  })

  it('讀唔到 ⇒ ⛔ 都唔出嗰行（⚠️ 唔准靠估嚇人）', () => {
    expect(onlyOnPhoneWarning(null)).toBe(null)
  })

  it('⭐ 有嘢就要講到好重 —— 「真正永遠冇咗」', () => {
    const text = onlyOnPhoneWarning(4)
    expect(text).toBe('⚠️ 呢單仲有 4 張相只剩部機呢一份（未傳上雲端）。清咗就真正永遠冇咗。')
    expect(text).toContain('真正永遠冇咗')
  })

  it('⭐ 兩句唔准撈埋：呢行⛔ 唔提「無法還原」，嗰句由彈窗自己出', () => {
    expect(onlyOnPhoneWarning(1)).not.toContain('無法還原')
  })
})
