import { describe, expect, it } from 'vitest'
import { PHOTO_NO_ROW_MESSAGE, type QuotePhoto } from './photos'
import type { PendingPhoto } from './photoUpload'
import { stuckAdvice, stuckCount, stuckLocal, stuckRaw } from './stuckPhotos'

const photo = (p: Partial<PendingPhoto>): PendingPhoto => ({
  operationId: 'op1',
  recordId: 'r1',
  treeId: null,
  mitigation: null,
  capturedAt: '2026-09-14T09:00:00.000Z',
  size: 100,
  sha256: 'x',
  blob: new Blob(['x']),
  status: 'local',
  error: '',
  attempts: 0,
  ...p,
})

const row = (operation_id: string): QuotePhoto =>
  ({ id: 'p-' + operation_id, record_id: 'r1', operation_id }) as unknown as QuotePhoto

/**
 * RLS 拒絕相片 insert 嗰陣 `photos.ts` 掟出嚟嗰句。
 * ⛔ 特登 import 個常數，⛔ 唔喺呢度抄一次 —— 抄咗，改文案就會出現
 * 「測試仲係綠、但真 app 認唔返」呢種最衰嘅情況。
 */
const RLS_MESSAGE = PHOTO_NO_ROW_MESSAGE

describe('stuckLocal —— 部機有、DB 冇', () => {
  it('DB 有對應行 ⇒ ⛔ 唔算卡住', () => {
    expect(stuckLocal([photo({ operationId: 'a' })], [row('a')])).toEqual([])
  })

  it('DB 一行都冇 ⇒ 算卡住', () => {
    expect(stuckLocal([photo({ operationId: 'a' })], []).map((i) => i.operationId)).toEqual(['a'])
  })

  it('⭐ 已經上到（uploaded）嗰啲一律唔計，就算 DB 今次未見到', () => {
    // DB 有幾秒延遲係正常事 —— ⛔ 唔可以因為 `listAll()` 未反映到就報一次假警。
    expect(stuckLocal([photo({ operationId: 'a', status: 'uploaded' })], [])).toEqual([])
  })

  it('⛔⛔ 問唔到 DB（rows === null）⇒ 一張都唔准報', () => {
    // ⚠️ 飛航模式下如果當「問唔到」＝「卡住」，成批相會突然變「要人睇」。
    const items = [photo({ operationId: 'a' }), photo({ operationId: 'b', status: 'error' })]
    expect(stuckLocal(items, null)).toEqual([])
    expect(stuckCount(items, null)).toBe(0)
  })

  it('混住嗰陣淨係篩出冇行嗰啲，次序照舊', () => {
    const items = [
      photo({ operationId: 'a' }),
      photo({ operationId: 'b' }),
      photo({ operationId: 'c', status: 'uploaded' }),
      photo({ operationId: 'd', status: 'error' }),
    ]
    expect(stuckLocal(items, [row('b')]).map((i) => i.operationId)).toEqual(['a', 'd'])
    expect(stuckCount(items, [row('b')])).toBe(2)
  })
})

describe('stuckAdvice —— 第二行答「你使唔使做嘢」', () => {
  it('上緊 ⇒ ⛔ 叫人唔好撳', () => {
    const advice = stuckAdvice(photo({ status: 'uploading' }))
    expect(advice.permanent).toBe(false)
    expect(advice.text).toContain('唔使撳')
  })

  it('排緊隊 ⇒ 講明會自己傳', () => {
    const advice = stuckAdvice(photo({ status: 'local' }))
    expect(advice.permanent).toBe(false)
    expect(advice.text).toContain('自己傳')
  })

  it('⭐ RLS 拒絕（Testing01 嗰單嘢）⇒ 永久性，而且叫得出搵邊個', () => {
    const advice = stuckAdvice(photo({ status: 'error', error: RLS_MESSAGE }))
    expect(advice.permanent).toBe(true)
    expect(advice.text).toContain('WhatsApp 搵 Jason')
    // ⛔ 唔准講「會自己好返」—— 母單改唔到，重試一萬次都係同一個答案。
    expect(advice.text).toContain('唔會自己好返')
  })

  it('認唔出嘅錯 ⇒ 照出中文，⛔ 唔准彈英文出嚟', () => {
    const advice = stuckAdvice(photo({ status: 'error', error: 'TypeError: fetch failed' }))
    expect(advice.permanent).toBe(false)
    expect(advice.text).toContain('相仲喺部機度')
    expect(advice.text).not.toContain('TypeError')
  })

  it('⭐ 四句都要講明張相唔會冇咗', () => {
    const all = [
      stuckAdvice(photo({ status: 'uploading' })),
      stuckAdvice(photo({ status: 'local' })),
      stuckAdvice(photo({ status: 'error', error: RLS_MESSAGE })),
      stuckAdvice(photo({ status: 'error', error: '乜都唔係' })),
    ]
    // 「上緊」同「排緊隊」冇明寫，因為佢哋根本未失敗；另外兩句一定要有。
    expect(all[2].text).toContain('唔會冇咗')
    expect(all[3].text).toContain('唔會冇咗')
  })
})

describe('stuckRaw —— 錯誤原文', () => {
  it('⛔ 唔准截 —— 原文幾長出幾長', () => {
    const long = 'x'.repeat(400)
    expect(stuckRaw(photo({ error: long }))).toBe(long)
  })

  it('未試過傳（冇原文）⇒ 空字串，畫面唔出嗰行', () => {
    expect(stuckRaw(photo({ error: '   ' }))).toBe('')
  })
})
