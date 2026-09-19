import { describe, expect, it } from 'vitest'
import { RENAME_BATCH_MAX, needsRename, renamePlan, renameSummary } from './rename.mjs'

const photo = (p) => ({
  id: 'p1',
  drive_file_id: 'd1',
  mitigation: 'crown_cleaning',
  seq: 1,
  ...p,
})

describe('邊幾個檔要改', () => {
  it('⭐ 用返 names.mjs 同一條 function 砌名，⛔ 唔另寫一套', () => {
    const { todo } = renamePlan('T-07', [photo()])
    expect(todo).toEqual([
      { photoId: 'p1', fileId: 'd1', name: 'T-07_Crown Cleaning_01_Before.jpg' },
    ])
  })

  it('冇工序 ⇒ 全景相，token 係 Whole View', () => {
    const { todo } = renamePlan('T-07', [photo({ mitigation: null })])
    expect(todo[0].name).toBe('T-07_Whole View_01_Before.jpg')
  })

  it('⭐ 成對編號照舊（seq 2 ⇒ 03）', () => {
    const { todo } = renamePlan('T-07', [photo({ seq: 2 })])
    expect(todo[0].name).toBe('T-07_Crown Cleaning_03_Before.jpg')
  })
})

describe('⛔ 三種唔會出現喺 plan 入面', () => {
  it('仲未抄上 Drive ⇒ ⛔ 冇嘢可以改（之後鏡像會用新樹牌）', () => {
    const { todo, notMirrored } = renamePlan('T-07', [photo({ drive_file_id: null })])
    expect(todo).toEqual([])
    expect(notMirrored).toBe(1)
  })

  it('⛔ 砌唔到新名 ⇒ 入 cannot，⛔ 唔准靠估砌一個', () => {
    const { todo, cannot } = renamePlan('T-07', [photo({ seq: 0 })])
    expect(todo).toEqual([])
    expect(cannot[0].why).toContain('次序是 0')
  })

  it('⛔ 唔識嘅工序 ⇒ 都係 cannot，⛔ 唔會出一個 untitled', () => {
    const { cannot } = renamePlan('T-07', [photo({ mitigation: '唔識呢個' })])
    expect(cannot[0].why).toContain('沒有對應的類別名')
  })
})

describe('⭐ 一半一半', () => {
  it('改得嘅改、改唔到嘅報返，⛔ 唔會因為一張壞就成棵樹唔改', () => {
    const { todo, cannot, notMirrored } = renamePlan('T-07', [
      photo({ id: 'ok' }),
      photo({ id: 'bad', seq: 0 }),
      photo({ id: 'notyet', drive_file_id: null }),
    ])
    expect(todo.map((t) => t.photoId)).toEqual(['ok'])
    expect(cannot.map((c) => c.photoId)).toEqual(['bad'])
    expect(notMirrored).toBe(1)
  })

  it('冇相 ⇒ 乜都冇', () => {
    expect(renamePlan('T-07', [])).toEqual({ todo: [], cannot: [], notMirrored: 0 })
    expect(renamePlan('T-07', null)).toEqual({ todo: [], cannot: [], notMirrored: 0 })
  })
})

describe('⛔⛔ 「改咗一半」唔准講成「改好咗」', () => {
  it('全部改晒 ⇒ 講返實數', () => {
    expect(renameSummary({ renamed: 6, failed: 0, cannot: 0, hitLimit: false })).toBe(
      'Drive 那邊 6 張相片的檔名已經一併修改。',
    )
  })

  it('⭐ 一張都唔使改 ⇒ 講明點解，⛔ 唔係一句「改好咗」', () => {
    const text = renameSummary({ renamed: 0, failed: 0, cannot: 0, hitLimit: false })
    expect(text).toContain('尚未複製上去')
  })

  it.each([
    [{ renamed: 3, failed: 3, cannot: 0, hitLimit: false }],
    [{ renamed: 3, failed: 0, cannot: 1, hitLimit: false }],
    [{ renamed: 12, failed: 0, cannot: 0, hitLimit: true }],
  ])('有嘢未搞掂 ⇒ 一定要講「只修改了一部分」＋ 叫人再試', (input) => {
    const text = renameSummary(input)
    expect(text).toContain('只修改了一部分')
    expect(text).toContain('再試')
    expect(text).not.toContain('已經跟住改咗')
  })

  it('⭐ 改咗幾多都要寫出嚟，⛔ 唔准淨係講失敗', () => {
    expect(renameSummary({ renamed: 3, failed: 3, cannot: 0, hitLimit: false })).toContain(
      '已修改 3 張',
    )
  })
})

describe('分批上限', () => {
  it('12 —— ⛔ 唔係拍腦袋（一棵樹最多 11 格 ＋ 全景）', () => {
    expect(RENAME_BATCH_MAX).toBe(12)
  })
})

describe('⭐ 重試係安全嘅：個檔已經叫啱就唔郁', () => {
  it('一樣 ⇒ ⛔ 唔改', () => {
    expect(needsRename('T-07_Crown Cleaning_01_Before.jpg', 'T-07_Crown Cleaning_01_Before.jpg'))
      .toBe(false)
  })

  it('唔一樣 ⇒ 改', () => {
    expect(needsRename('舊_Crown Cleaning_01_Before.jpg', 'T-07_Crown Cleaning_01_Before.jpg'))
      .toBe(true)
  })

  it('⛔⛔ 攞唔到現名 ⇒ 照改，⛔ 唔准當佢已經啱', () => {
    // ⚠️ 改成同一個名係冇後果嘅；漏咗一個舊名喺 Drive 度先係真問題。
    expect(needsRename(null, 'T-07_Crown Cleaning_01_Before.jpg')).toBe(true)
  })
})
