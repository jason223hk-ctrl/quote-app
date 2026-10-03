import { describe, expect, it } from 'vitest'
import { creatorName, createPeopleApi, sortPeople, type Person } from './people'

const P: Person[] = [
  { userId: 'u-yiu', name: '阿耀' },
  { userId: 'u-isaac', name: 'Isaac' },
]

describe('creatorName', () => {
  it('對到就出名', () => {
    expect(creatorName(P, 'u-yiu')).toBe('阿耀')
  })
  it('⛔ 張表冇佢 ⇒ null（卡上唔出），⛔ 唔准出 UUID', () => {
    expect(creatorName(P, 'u-jason')).toBeNull()
  })
  it('⛔ 人名未載到／載唔到（null）⇒ null', () => {
    expect(creatorName(null, 'u-yiu')).toBeNull()
  })
  it('created_by 空 ⇒ null', () => {
    expect(creatorName(P, '')).toBeNull()
    expect(creatorName(P, null)).toBeNull()
  })
})

describe('sortPeople', () => {
  it('⭐ 次序定死，⛔ 唔跟 DB 次序', () => {
    const a = sortPeople([P[0], P[1]]).map((p) => p.name)
    const b = sortPeople([P[1], P[0]]).map((p) => p.name)
    expect(a).toEqual(b)
  })
})

describe('createPeopleApi', () => {
  const fake = (result: { data: unknown; error: { message: string } | null }) =>
    ({ from: () => ({ select: async () => result }) }) as never

  it('讀 user_id／display_name，執走空名', async () => {
    const api = createPeopleApi(
      fake({
        data: [
          { user_id: 'a', display_name: ' 阿耀 ' },
          { user_id: 'b', display_name: '  ' },
        ],
        error: null,
      }),
    )
    expect(await api.list()).toEqual([{ userId: 'a', name: '阿耀' }])
  })

  it('⛔ 讀唔到要 throw —— ⛔ 唔准回 []（同「冇人」分唔開）', async () => {
    const api = createPeopleApi(fake({ data: null, error: { message: 'boom' } }))
    await expect(api.list()).rejects.toThrow('boom')
  })
})
