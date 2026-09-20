import { describe, expect, it } from 'vitest'
import {
  PURGE_BATCH_MAX,
  PURGE_ROUNDS_MAX,
  driveGone,
  purgePlan,
  purgeSummary,
  r2Gone,
} from './purge.mjs'

/*
 * ⛔⛔ 呢啲測試⛔ 唔係「補齊 coverage」—— 每一個都對應一個**真係會死人嘅形狀**。
 * ⭐ 呢一組同其他組唔同：佢守嘅係**救唔返嘅嘢**（相嘅 bytes）。
 */

const photo = (over = {}) => ({
  id: 'p1',
  r2_key: 'u1/aaa.jpg',
  drive_file_id: 'drive-1',
  purged_at: null,
  ...over,
})

describe('purgePlan：三種相要分得開', () => {
  it('普通一張（R2 ＋ Drive 都有）⇒ todo', () => {
    const plan = purgePlan([photo()])
    expect(plan.todo).toEqual([{ photoId: 'p1', r2Key: 'u1/aaa.jpg', driveFileId: 'drive-1' }])
    expect(plan.done).toEqual([])
    expect(plan.nothing).toEqual([])
  })

  /*
   * ⭐⭐ 「重試係安全嘅」嗰個保證本人。
   * ⚠️ 冇咗呢條，清到一半斷網再撳一次，就會**再刪一次已經冇咗嘅嘢**，
   *    而更衰嘅係：個 summary 會數多咗，人以為清咗兩次都成功。
   */
  it('⛔ 已經有 purged_at 嘅⛔ 唔准再清一次', () => {
    const plan = purgePlan([photo({ purged_at: '2026-09-20T01:00:00Z' })])
    expect(plan.todo).toEqual([])
    expect(plan.done).toEqual(['p1'])
  })

  /*
   * ⚠️⚠️ 呢種就係「只剩部機一份」—— 雲端兩邊都冇。
   * ⛔ 佢⛔ 唔准入 todo（冇嘢好刪），⛔ 但亦⛔ 唔准靜靜跳過 ——
   *    唔 stamp 嘅話佢會**永遠留喺「未清完」**，設定頁嗰行永遠出數字。
   */
  it('雲端兩邊都冇（只剩部機一份）⇒ nothing，⛔ 唔入 todo', () => {
    const plan = purgePlan([photo({ r2_key: '', drive_file_id: '' })])
    expect(plan.todo).toEqual([])
    expect(plan.nothing).toEqual(['p1'])
  })

  it('得 R2 冇 Drive ⇒ 照樣要清（driveFileId 係 null）', () => {
    expect(purgePlan([photo({ drive_file_id: '' })]).todo).toEqual([
      { photoId: 'p1', r2Key: 'u1/aaa.jpg', driveFileId: null },
    ])
  })

  it('得 Drive 冇 R2 ⇒ 照樣要清（r2Key 係 null）', () => {
    expect(purgePlan([photo({ r2_key: '' })]).todo).toEqual([
      { photoId: 'p1', r2Key: null, driveFileId: 'drive-1' },
    ])
  })

  /* ⚠️ 得幾個空格嘅 key ⛔ 唔係一個 key —— 送去 R2 會刪錯嘢或者 400。 */
  it('⛔ 得空格嘅 key 當冇', () => {
    const plan = purgePlan([photo({ r2_key: '   ', drive_file_id: '  ' })])
    expect(plan.todo).toEqual([])
    expect(plan.nothing).toEqual(['p1'])
  })

  it('⛔ 冇相／null ⛔ 唔准掟錯', () => {
    expect(purgePlan([])).toEqual({ todo: [], done: [], nothing: [] })
    expect(purgePlan(null)).toEqual({ todo: [], done: [], nothing: [] })
  })
})

describe('r2Gone / driveGone：⛔ 「唔見咗」同「唔知」要分得開', () => {
  /*
   * ⭐ 404 當清咗 —— 我哋要嘅係「嗰份 bytes 唔喺度」，⛔ 唔係「今次係我刪嘅」。
   * ⚠️ 404 當失敗，一張本來就冇上到 R2 嘅相會永遠卡喺「未清完」，
   *    而個人一路撳一路失敗，⛔ 冇任何辦法行出去。
   */
  it.each([204, 200, 404])('R2 回 %i ⇒ 當清咗', (s) => expect(r2Gone(s)).toBe(true))

  /* ⛔ 403 / 500 ⛔ 唔准當清咗 —— 嗰啲係「我哋唔知佢仲喺唔喺度」。 */
  it.each([400, 401, 403, 429, 500, 502, 503])('R2 回 %i ⇒ ⛔ 唔准當清咗', (s) =>
    expect(r2Gone(s)).toBe(false),
  )

  it.each([200, 204, 404])('Drive 回 %i ⇒ 當掉咗', (s) => expect(driveGone(s)).toBe(true))
  it.each([401, 403, 429, 500])('Drive 回 %i ⇒ ⛔ 唔准當掉咗', (s) =>
    expect(driveGone(s)).toBe(false),
  )
})

describe('PURGE_BATCH_MAX：⛔ 唔准超過 Cloudflare 個 subrequest 上限', () => {
  /*
   * ⚠️ 呢條測試釘住嘅⛔ 唔係「10 呢個數」，係**背後條數**。
   * ⭐ 邊日有人加多一個 subrequest 落去（例如加一個 driveFileExists），
   *   佢就要返嚟改呢條，而改嗰陣就會見到條數。
   */
  it('setup 4 ＋ 每張 4 個 subrequest，⛔ 一批唔可以超過 50', () => {
    const SETUP = 4
    const PER_PHOTO = 4
    expect(SETUP + PURGE_BATCH_MAX * PER_PHOTO).toBeLessThanOrEqual(50)
    // ⭐ 而且要留有鬆動 —— 剛剛好 50 就係下次加一個 fetch 即刻爆。
    expect(SETUP + (PURGE_BATCH_MAX + 1) * PER_PHOTO).toBeLessThanOrEqual(50)
  })

  it('⛔ loop 一定要有上限', () => {
    expect(PURGE_ROUNDS_MAX).toBeGreaterThan(0)
    expect(Number.isFinite(PURGE_ROUNDS_MAX)).toBe(true)
  })
})

describe('purgeSummary：⛔ 「清咗一半」⛔ 唔准講成「清好咗」', () => {
  it('全部清晒', () => {
    expect(purgeSummary({ purged: 3, alreadyDone: 0, nothingToClear: 0, failed: 0, hitLimit: false }))
      .toBe('雲端相片已經清走：清走了 3 張。')
  })

  it('冇相要清', () => {
    expect(purgeSummary({ purged: 0, alreadyDone: 0, nothingToClear: 0, failed: 0, hitLimit: false }))
      .toBe('這一單沒有相片需要清走。')
  })

  it('之前已經清咗一部分 ⇒ 兩個數都要講', () => {
    const msg = purgeSummary({ purged: 2, alreadyDone: 5, nothingToClear: 0, failed: 0, hitLimit: false })
    expect(msg).toContain('清走了 2 張')
    expect(msg).toContain('5 張之前已經清走')
  })

  /*
   * ⭐⭐ 呢兩條係成組入面最緊要嗰兩條。
   * ⚠️ 人以為清好咗就唔會再撳 ⇒ 剩低嗰啲 bytes 會**永遠留喺雲端**。
   */
  it('⛔ 有清唔到嘅 ⇒ 一定要出「只清走了一部分」同「再點擊一次」', () => {
    const msg = purgeSummary({ purged: 2, alreadyDone: 0, nothingToClear: 0, failed: 1, hitLimit: false })
    expect(msg).toContain('只清走了一部分')
    expect(msg).toContain('1 張清不到')
    expect(msg).toContain('再點擊一次')
    expect(msg).not.toContain('已經清走：')
  })

  it('⛔ 撞到一批上限 ⇒ 一樣要出「只清走了一部分」，⛔ 唔准當做完', () => {
    const msg = purgeSummary({ purged: 10, alreadyDone: 0, nothingToClear: 0, failed: 0, hitLimit: true })
    expect(msg).toContain('只清走了一部分')
    expect(msg).toContain('尚有未處理的')
    expect(msg).not.toContain('已經清走：')
  })

  /* ⚠️ 中文，⛔ 唔准有英文原文漏出嚟（CLAUDE.md §2.7）。 */
  it('⛔ 每一句都唔准有英文字母', () => {
    const all = [
      purgeSummary({ purged: 3, alreadyDone: 1, nothingToClear: 2, failed: 0, hitLimit: false }),
      purgeSummary({ purged: 0, alreadyDone: 0, nothingToClear: 0, failed: 0, hitLimit: false }),
      purgeSummary({ purged: 1, alreadyDone: 0, nothingToClear: 0, failed: 2, hitLimit: true }),
    ]
    for (const msg of all) expect(msg).not.toMatch(/[A-Za-z]/)
  })
})
