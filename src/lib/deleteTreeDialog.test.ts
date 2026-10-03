import { describe, expect, it } from 'vitest'
import { DELETE_DIALOG_BUSY, DELETE_DIALOG_CANCEL, CANCEL_ON_RIGHT } from './deleteDialog'
import {
  TREE_DELETE_BUSY,
  TREE_DELETE_CANCEL,
  TREE_DELETE_CANCEL_ON_RIGHT,
  TREE_DELETE_CONFIRM,
  TREE_DELETE_NOTE,
  TREE_DELETE_TITLE,
  treeDeleteName,
} from './deleteTreeDialog'

describe('刪樹確認彈窗', () => {
  it('標題照 P3f §2.3', () => {
    expect(TREE_DELETE_TITLE).toBe('刪除樹？')
  })

  it('⛔ 唔講「相片一併刪除」／「垃圾桶」—— 刪樹淨係寫 deleted_at', () => {
    const all = [TREE_DELETE_TITLE, TREE_DELETE_NOTE, TREE_DELETE_CONFIRM].join('')
    expect(all).not.toMatch(/垃圾桶|一併|永久|無法還原/)
    expect(TREE_DELETE_NOTE).toBe('刪除只會記下刪除時間，資料庫內不會真正刪除。')
  })

  it('兩粒掣嘅字同次序跟返刪工程彈窗，⛔ 唔另開一套', () => {
    expect(TREE_DELETE_CANCEL).toBe(DELETE_DIALOG_CANCEL)
    expect(TREE_DELETE_BUSY).toBe(DELETE_DIALOG_BUSY)
    expect(TREE_DELETE_CANCEL_ON_RIGHT).toBe(CANCEL_ON_RIGHT)
    // ⛔ 危險嗰粒⛔ 唔准係「確定」呢種空話
    expect(TREE_DELETE_CONFIRM).toBe('刪除')
  })

  it('樹牌號空白⛔ 唔出空框', () => {
    expect(treeDeleteName('  T12 ')).toBe('T12')
    expect(treeDeleteName('   ')).toBe('（未有樹牌號）')
  })
})
