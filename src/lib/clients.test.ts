import { describe, expect, it } from 'vitest'
import {
  BLANK_MESSAGE,
  DUPLICATE_MESSAGE,
  clientLabel,
  findDuplicate,
  isBlank,
  matchClients,
  sameClient,
  translateClientError,
  trimInput,
  type ClientInput,
  type QuoteClient,
} from './clients'

const row = (p: Partial<QuoteClient>): QuoteClient =>
  ({
    id: 'c1',
    client: '房屋署',
    contact: '陳生',
    phone: '9123 4567',
    created_by: 'u1',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    deleted_at: null,
    ...p,
  }) as QuoteClient

const input = (p: Partial<ClientInput>): ClientInput => ({
  client: '',
  contact: '',
  phone: '',
  ...p,
})

describe('clientLabel', () => {
  it('三格齊 → 三段中間有「 · 」', () => {
    expect(clientLabel(row({}))).toBe('房屋署 · 陳生 · 9123 4567')
  })

  it('⛔ 空格唔准留低一個孤零零嘅「·」', () => {
    expect(clientLabel(input({ client: '領展' }))).toBe('領展')
    expect(clientLabel(input({ client: '領展', phone: '2345 6789' }))).toBe('領展 · 2345 6789')
  })

  it('⛔ 淨係打咗空白嘅格當冇填', () => {
    expect(clientLabel(input({ client: '領展', contact: '   ' }))).toBe('領展')
  })

  it('三格都空 → 空字串', () => {
    expect(clientLabel(input({}))).toBe('')
  })
})

describe('isBlank', () => {
  it('三格全空 ⇒ ⛔ 唔准入', () => {
    expect(isBlank(input({}))).toBe(true)
  })

  it('⚠️ 淨係打咗空白都算空 —— ⛔ 唔可以靠打個空格過骨', () => {
    expect(isBlank(input({ client: '   ', contact: '\t', phone: ' ' }))).toBe(true)
  })

  it('得一格有嘢就入得（原型：請至少填一項）', () => {
    expect(isBlank(input({ phone: '9123 4567' }))).toBe(false)
  })
})

describe('sameClient —— ⚠️ 要同 DB 個唯一索引一把尺', () => {
  it('一模一樣 ⇒ 撞', () => {
    expect(sameClient(row({}), row({ id: 'c2' }))).toBe(true)
  })

  it('尾後多咗個空格 ⇒ 一樣撞（DB btrim）', () => {
    expect(sameClient(input({ client: '領展' }), input({ client: '領展 ' }))).toBe(true)
  })

  it('⚠️⚠️ 英文大細楷唔同 ⇒ **一樣撞**（DB lower）—— ⛔ 呢度特登嚴過原型', () => {
    expect(sameClient(input({ client: 'Housing Dept' }), input({ client: 'housing dept' }))).toBe(
      true,
    )
  })

  it('⭐ 同一個客戶、唔同聯絡人 ⇒ ⛔ 唔算撞（一個房屋署好多管工）', () => {
    const a = input({ client: '房屋署', contact: '陳生' })
    const b = input({ client: '房屋署', contact: '李小姐' })
    expect(sameClient(a, b)).toBe(false)
  })

  it('電話唔同 ⇒ 唔算撞', () => {
    const a = input({ client: '領展', phone: '2345 6789' })
    const b = input({ client: '領展', phone: '2345 6780' })
    expect(sameClient(a, b)).toBe(false)
  })
})

describe('findDuplicate', () => {
  const book = [row({ id: 'c1' }), row({ id: 'c2', contact: '李小姐', phone: '9876 5432' })]

  it('新增撞到 ⇒ 攞返嗰筆出嚟', () => {
    expect(findDuplicate(book, row({}), null)?.id).toBe('c1')
  })

  it('⭐ 改緊嗰筆自己 ⇒ ⛔ 唔算撞（唔改就撳儲存都要過到）', () => {
    expect(findDuplicate(book, row({}), 'c1')).toBeNull()
  })

  it('改到同第二筆一樣 ⇒ 要撞返出嚟', () => {
    const clash = input({ client: '房屋署', contact: '李小姐', phone: '9876 5432' })
    expect(findDuplicate(book, clash, 'c1')?.id).toBe('c2')
  })

  it('冇撞 ⇒ null', () => {
    expect(findDuplicate(book, input({ client: '新客' }), null)).toBeNull()
  })
})

describe('matchClients', () => {
  const book = [
    row({ id: 'c1' }),
    row({ id: 'c2', client: '領展', contact: '黃經理', phone: '2345 6789' }),
  ]

  it('⛔ 空 query ⇒ 全部出，⛔ 唔係一個都唔出', () => {
    expect(matchClients(book, '')).toHaveLength(2)
    expect(matchClients(book, '   ')).toHaveLength(2)
  })

  it('搵客戶名', () => {
    expect(matchClients(book, '領展').map((c) => c.id)).toEqual(['c2'])
  })

  it('搵聯絡人', () => {
    expect(matchClients(book, '陳生').map((c) => c.id)).toEqual(['c1'])
  })

  it('搵電話（打一半都搵到）', () => {
    expect(matchClients(book, '2345').map((c) => c.id)).toEqual(['c2'])
  })

  it('英文唔分大細楷', () => {
    const en = [row({ id: 'c3', client: 'Housing Dept', contact: '', phone: '' })]
    expect(matchClients(en, 'housing')).toHaveLength(1)
  })

  it('搵唔到 ⇒ 空清單', () => {
    expect(matchClients(book, '搵唔到呢個')).toEqual([])
  })
})

describe('translateClientError —— ⛔ 唔准將 constraint 名照出俾人睇', () => {
  it('撞重複', () => {
    const raw =
      'duplicate key value violates unique constraint "quote_clients_unique_idx"'
    expect(translateClientError(raw)).toBe(DUPLICATE_MESSAGE)
  })

  it('三格全空被 DB 擋', () => {
    const raw = 'new row violates check constraint "quote_clients_not_all_blank"'
    expect(translateClientError(raw)).toBe(BLANK_MESSAGE)
  })

  it('⛔ 認唔出嘅錯唔准食咗佢 —— 要出返啲嘢', () => {
    const out = translateClientError('permission denied for table quote_clients')
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toBe(DUPLICATE_MESSAGE)
  })
})

describe('trimInput', () => {
  it('三格都 trim', () => {
    expect(trimInput(input({ client: ' 領展 ', contact: ' 黃 ', phone: ' 2345 ' }))).toEqual({
      client: '領展',
      contact: '黃',
      phone: '2345',
    })
  })
})
