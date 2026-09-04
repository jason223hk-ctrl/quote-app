import { describe, expect, it } from 'vitest'
import type { QuotePhoto } from './photos'
import type { QuoteTree } from './trees'
import {
  activePill,
  applyPill,
  buildShots,
  exportedTrees,
  paginate,
  selectedShots,
  toggleShot,
  toggleTree,
  treeCountText,
  worksEnOf,
} from './pdfModel'

const tree = (id: string, no: string, mitigations: string[]): QuoteTree =>
  ({ id, tree_no: no, mitigations, mitigation_other: '', note: '' }) as unknown as QuoteTree

const photo = (id: string, treeId: string | null, mitigation: string | null, seq = 1, p = {}) =>
  ({
    id,
    record_id: 'r1',
    tree_id: treeId,
    mitigation,
    seq,
    remark: '',
    deleted_at: null,
    ...p,
  }) as unknown as QuotePhoto

const TREES = [
  tree('t1', '1', ['crown_cleaning', 'crown_reduction']),
  tree('t2', '2', ['removal']),
  tree('t3', '3', []),
]

const PHOTOS = [
  photo('p1', 't1', null),
  photo('p2', 't1', 'crown_cleaning'),
  photo('p3', 't2', null),
  photo('e1', null, null), // 環境相
]

describe('buildShots', () => {
  it('⛔ 環境相唔入 PDF', () => {
    expect(buildShots(TREES, PHOTOS).map((s) => s.photoId).sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('⛔ 已刪嘅相唔入', () => {
    const rows = [...PHOTOS, photo('p9', 't1', null, 2, { deleted_at: '2026-09-01' })]
    expect(buildShots(TREES, rows).some((s) => s.photoId === 'p9')).toBe(false)
  })

  it('⛔ 砌唔到檔名嘅相唔入 —— 一行冇檔名嘅相底等於一張認唔返嘅相', () => {
    const rows = [photo('bad', 't1', null, 0)]
    expect(buildShots(TREES, rows)).toEqual([])
  })

  it('檔名同 Drive 一樣（少咗 _Before.jpg）', () => {
    const files = buildShots(TREES, PHOTOS).map((s) => s.file)
    expect(files).toContain('1_Whole View_01')
    expect(files).toContain('1_Crown Cleaning_01')
  })

  // ⭐ 同一棵樹入面按檔名排 —— 咁樣紙上面嘅次序同 Drive 資料夾入面
  //    （Google Drive 按字母排）一模一樣。同事拎住張 PDF 去 Drive 逐張對就對得返。
  it('同一棵樹入面按檔名排，⛔ 唔係影相次序', () => {
    expect(buildShots(TREES, PHOTOS).map((s) => s.file)).toEqual([
      '1_Crown Cleaning_01',
      '1_Whole View_01',
      '2_Whole View_01',
    ])
  })

  it('相底第二行係成棵樹嘅工序，⛔ 唔係嗰張相自己嗰個', () => {
    const whole = buildShots(TREES, PHOTOS).find((s) => s.photoId === 'p1')
    expect(whole?.worksEn).toBe('Crown Cleaning, Crown Reduction')
  })

  it('備註冇填就係空字串', () => {
    expect(buildShots(TREES, [photo('p1', 't1', null, 1, { remark: '  ' })])[0].note).toBe('')
  })

  it('跟樹木清單次序，⛔ 唔跟 DB 攞返嚟嗰個', () => {
    const rows = [photo('p3', 't2', null), photo('p1', 't1', null)]
    expect(buildShots(TREES, rows).map((s) => s.photoId)).toEqual(['p1', 'p3'])
  })
})

describe('worksEnOf', () => {
  it('次序跟清單，⛔ 唔跟 DB array', () => {
    expect(worksEnOf(tree('x', 'x', ['crown_reduction', 'crown_cleaning']))).toBe(
      'Crown Cleaning, Crown Reduction',
    )
  })

  it('未揀工序就係空字串 —— ⛔ 相底第二行唔出', () => {
    expect(worksEnOf(tree('x', 'x', []))).toBe('')
  })
})

describe('paginate', () => {
  it('每頁四張', () => {
    expect(paginate([1, 2, 3, 4, 5], 4).map((p) => p.length)).toEqual([4, 1])
  })

  it('⛔ 冇相就零頁，唔出一版白紙', () => {
    expect(paginate([], 4)).toEqual([])
  })
})

describe('treeCountText', () => {
  it('只出真係有嘅分類', () => {
    expect(treeCountText([TREES[0]])).toBe('修剪 1 棵')
    expect(treeCountText([TREES[1]])).toBe('移除 1 棵')
    expect(treeCountText([TREES[0], TREES[1]])).toBe('修剪 1 棵｜移除 1 棵')
  })

  it('一棵都未分工序就出「共 N 棵」', () => {
    expect(treeCountText([TREES[2]])).toBe('共 1 棵')
  })

  it('⛔ 一棵都冇就空字串，唔准出「共 0 棵」', () => {
    expect(treeCountText([])).toBe('')
  })

  it('legacy「修剪（未細分）」都當修剪', () => {
    expect(treeCountText([tree('x', 'x', ['pruning'])])).toBe('修剪 1 棵')
  })
})

describe('三個 pill', () => {
  const shots = buildShots(TREES, PHOTOS)

  it('客戶＝淨係全景相', () => {
    const sel = applyPill('client', shots)
    expect([...sel.photoIds].sort()).toEqual(['p1', 'p3'])
  })

  it('同事＝全部相', () => {
    expect(applyPill('crew', shots).photoIds.size).toBe(3)
  })

  it('全部清除＝一張都唔要', () => {
    const sel = applyPill('clear', shots)
    expect(sel.photoIds.size).toBe(0)
    expect(sel.treeIds.size).toBe(0)
  })

  it('⛔ 冇相嘅樹唔會被剔到', () => {
    expect(applyPill('crew', shots).treeIds.has('t3')).toBe(false)
  })

  it('撳咗邊個 pill 就邊個着燈', () => {
    expect(activePill(applyPill('client', shots), shots)).toBe('client')
    expect(activePill(applyPill('crew', shots), shots)).toBe('crew')
    expect(activePill(applyPill('clear', shots), shots)).toBe('clear')
  })

  it('⭐ 手動改到唔再係嗰三個組合，pill 就熄', () => {
    // 甩剔一張全景相 —— 客戶／同事／清除三個組合都唔係咁樣。
    const one = shots.find((s) => s.photoId === 'p1')!
    const sel = toggleShot(applyPill('crew', shots), one, shots)
    expect(activePill(sel, shots)).toBeNull()
  })

  // ⚠️ 呢條特登寫低：由「同事」甩剔咗嗰張工序相，剩返嘅**啱啱好就係**「客戶」。
  //    ⇒ pill 會着返「客戶」，⛔ 唔會三個一齊熄。
  //    Jason 原型記住「你上次撳咗邊個」，所以嗰陣會熄。我哋改成由現況計出嚟，
  //    理由就係佢自己寫嗰句：「因為已經唔係嗰三個組合」—— 而呢個情況係。
  //    ⛔ 記住個舊揀法嘅話，個 pill 就會講緊大話。
  it('手動改完之後啱啱好等於另一個組合，就着返嗰個', () => {
    const one = shots.find((s) => s.photoId === 'p2')!
    const sel = toggleShot(applyPill('crew', shots), one, shots)
    expect(activePill(sel, shots)).toBe('client')
  })
})

describe('剔樹同剔相', () => {
  const shots = buildShots(TREES, PHOTOS)

  it('⛔ 一張相都冇嘅樹剔唔到', () => {
    const sel = toggleTree(applyPill('clear', shots), 't3', shots)
    expect(sel.treeIds.has('t3')).toBe(false)
  })

  it('開返一棵樹 ＝ 佢啲相全部剔返', () => {
    const sel = toggleTree(applyPill('clear', shots), 't1', shots)
    expect([...sel.photoIds].sort()).toEqual(['p1', 'p2'])
  })

  it('⭐ 揀返一張相，棵樹自動剔返', () => {
    const one = shots.find((s) => s.photoId === 'p2')!
    const sel = toggleShot(applyPill('clear', shots), one, shots)
    expect(sel.treeIds.has('t1')).toBe(true)
  })

  const shotOf = (id: string) => shots.find((s) => s.photoId === id)!

  it('⛔ 甩剔一張但仲有第二張剔住，棵樹唔准熄', () => {
    const sel = toggleShot(applyPill('crew', shots), shotOf('p1'), shots)
    expect(sel.treeIds.has('t1')).toBe(true)
    expect(selectedShots(shots, sel).map((s) => s.photoId)).toContain('p2')
  })

  it('最後一張都甩咗剔，棵樹先熄', () => {
    let sel = applyPill('crew', shots)
    sel = toggleShot(sel, shotOf('p1'), shots)
    sel = toggleShot(sel, shotOf('p2'), shots)
    expect(sel.treeIds.has('t1')).toBe(false)
  })
})

describe('selectedShots / exportedTrees', () => {
  const shots = buildShots(TREES, PHOTOS)

  it('相要剔咗，而且棵樹都要剔咗', () => {
    const sel = { treeIds: new Set<string>(), photoIds: new Set(['p1']) }
    expect(selectedShots(shots, sel)).toEqual([])
  })

  it('⭐ 數嘅係今次真係有相出嗰啲樹，⛔ 唔係成個工程', () => {
    const sel = toggleTree(applyPill('clear', shots), 't1', shots)
    expect(exportedTrees(TREES, shots, sel).map((t) => t.id)).toEqual(['t1'])
    expect(treeCountText(exportedTrees(TREES, shots, sel))).toBe('修剪 1 棵')
  })
})
