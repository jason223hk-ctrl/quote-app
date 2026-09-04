import { describe, expect, it } from 'vitest'
// ⛔⛔ 呢個 import 就係成個檔嘅重點：直接攞 worker 真嗰份嚟對答案。
// ⛔ 唔准改成「照抄一份預期值」—— 咁樣 worker 改咗呢度就唔會紅。
import {
  MITIGATION_TOKENS,
  pairedNumber as workerPairedNumber,
  photoFilename as workerPhotoFilename,
  safeFilename as workerSafeFilename,
  sitePhotoFilename as workerSitePhotoFilename,
} from '../../worker/src/names.mjs'
import { MITIGATION_OPTIONS, SELECTABLE_MITIGATIONS } from './options'
import {
  mitigationToken,
  pairedNumber,
  photoFileLabel,
  safeFilename,
  sitePhotoLabel,
} from './pdfNames'

describe('同 worker 對答案', () => {
  const NAMES = ['1', 'T04', '彩 1', 'a/b:c', '', '   ']
  const SEQS = [-1, 0, 0.5, 1, 2, 3, 12, NaN]
  const KEYS: (string | null)[] = [null, ...MITIGATION_OPTIONS.map((o) => o.value)]
  // ⚠️ 特登包埋 legacy —— 就係要證明兩邊都砌唔到佢。

  it('safeFilename 逐個 case 一樣', () => {
    for (const name of NAMES) expect(safeFilename(name)).toBe(workerSafeFilename(name))
  })

  it('pairedNumber 逐個 case 一樣', () => {
    for (const seq of SEQS) expect(pairedNumber(seq)).toBe(workerPairedNumber(seq))
  })

  it('sitePhotoLabel 淨係差個 .jpg', () => {
    for (const seq of SEQS) {
      const worker = workerSitePhotoFilename(seq)
      expect(sitePhotoLabel(seq)).toBe(worker === null ? null : worker.replace(/\.jpg$/, ''))
    }
  })

  it('⛔ 類別 token 一個字都唔准差', () => {
    for (const option of SELECTABLE_MITIGATIONS) {
      expect(mitigationToken(option.value)).toBe(MITIGATION_TOKENS[option.value])
    }
  })

  // ⭐ 2026-09-03 呢條測試真係捉到嘢：第一版查 `MITIGATION_OPTIONS`，
  //    legacy `pruning` 就會砌出 `1_Pruning (unspecified)_01`，而 Drive 冇呢個檔。
  it('⛔ legacy「修剪（未細分）」砌唔到檔名 —— worker 都係砌唔到', () => {
    expect(MITIGATION_TOKENS['pruning']).toBeUndefined()
    expect(mitigationToken('pruning')).toBeNull()
    expect(photoFileLabel('1', 'pruning', 1)).toBeNull()
  })

  it('⛔ 檔名逐個組合都同 worker 一樣（淨係少咗 _Before.jpg）', () => {
    for (const treeNo of NAMES) {
      for (const key of KEYS) {
        for (const seq of SEQS) {
          const token = key === null ? 'Whole View' : MITIGATION_TOKENS[key]
          const worker = workerPhotoFilename(treeNo, token, seq)
          const mine = photoFileLabel(treeNo, key, seq)
          expect(mine).toBe(worker === null ? null : worker.replace(/_Before\.jpg$/, ''))
        }
      }
    }
  })
})

describe('photoFileLabel', () => {
  it('全景相', () => {
    expect(photoFileLabel('1', null, 1)).toBe('1_Whole View_01')
  })

  it('工序相', () => {
    expect(photoFileLabel('T04', 'crown_cleaning', 2)).toBe('T04_Crown Cleaning_03')
  })

  it('⛔ 其他係 `Other`，⛔ 唔係 `Other-1`', () => {
    expect(photoFileLabel('1', 'other', 1)).toBe('1_Other_01')
  })

  it('⛔ seq 唔啱就砌唔到，唔准靜靜補救成 1', () => {
    expect(photoFileLabel('1', null, 0)).toBeNull()
  })

  it('⛔ 認唔出嘅工序砌唔到', () => {
    expect(photoFileLabel('1', 'zzz', 1)).toBeNull()
  })
})

describe('sitePhotoLabel', () => {
  it('順序數，⛔ 唔係成對編號', () => {
    expect(sitePhotoLabel(2)).toBe('Site_02')
  })
})
