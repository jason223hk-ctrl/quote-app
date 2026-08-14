import { describe, expect, it } from 'vitest'
import { buildReverseUrl, coordsKey, geolocationErrorMessage, parseReverse } from './geo'

describe('buildReverseUrl', () => {
  it('照 Nominatim reverse endpoint 同指定參數', () => {
    const url = new URL(buildReverseUrl(22.3193, 114.1694))

    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/reverse')
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('lat')).toBe('22.3193')
    expect(url.searchParams.get('lon')).toBe('114.1694')
    expect(url.searchParams.get('zoom')).toBe('18')
    expect(url.searchParams.get('accept-language')).toBe('zh-HK,zh,en')
  })
})

describe('geolocationErrorMessage', () => {
  it('每一種失敗都有中文，冇英文原文彈出嚟', () => {
    expect(geolocationErrorMessage(1)).toContain('拒絕')
    expect(geolocationErrorMessage(2)).toContain('攞唔到定位')
    expect(geolocationErrorMessage(3)).toContain('等太耐')
    expect(geolocationErrorMessage(null)).toContain('定位')

    for (const code of [1, 2, 3, null]) {
      expect(geolocationErrorMessage(code)).toMatch(/[一-鿿]/)
    }
  })
})

describe('parseReverse', () => {
  it('攞到地址同區', () => {
    expect(
      parseReverse({
        display_name: '青山公路, 荃灣, 荃灣區, 新界, 香港',
        address: { road: '青山公路', city_district: '荃灣區' },
      }),
    ).toEqual({ address: '青山公路, 荃灣, 荃灣區, 新界, 香港', region: 'NT' })
  })

  it('有地址但認唔到區：地址照用，區留 null（唔准估）', () => {
    expect(
      parseReverse({ display_name: 'Somewhere, China', address: { road: 'Somewhere' } }),
    ).toEqual({ address: 'Somewhere, China', region: null })
  })

  it('Nominatim 回 error 就當冇嘢攞到', () => {
    expect(parseReverse({ error: 'Unable to geocode' })).toEqual({ address: null, region: null })
  })

  it('空 payload 唔會爆', () => {
    expect(parseReverse(null)).toEqual({ address: null, region: null })
    expect(parseReverse(undefined)).toEqual({ address: null, region: null })
    expect(parseReverse({})).toEqual({ address: null, region: null })
  })

  it('display_name 係空白就當冇地址', () => {
    expect(parseReverse({ display_name: '   ' }).address).toBeNull()
  })
})

describe('coordsKey', () => {
  it('同一組座標得同一個 key（用嚟避免重複查 Nominatim）', () => {
    expect(coordsKey(22.319311, 114.169411)).toBe(coordsKey(22.319312, 114.169412))
  })

  it('唔同地方唔會撞 key', () => {
    expect(coordsKey(22.3193, 114.1694)).not.toBe(coordsKey(22.4193, 114.1694))
  })
})
