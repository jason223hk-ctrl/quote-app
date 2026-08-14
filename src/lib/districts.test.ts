import { describe, expect, it } from 'vitest'
import { HK_DISTRICTS, regionFromCandidates, regionFromNominatimAddress } from './districts'

describe('十八區對應表', () => {
  it('啱啱好十八區，冇多冇少', () => {
    expect(HK_DISTRICTS).toHaveLength(18)
  })

  it('五個 HK（香港島四區 + 離島）', () => {
    const hk = HK_DISTRICTS.filter((d) => d.region === 'HK').map((d) => d.zh)
    expect(hk).toEqual(['中西區', '灣仔區', '東區', '南區', '離島區'])
  })

  it('五個 KLN', () => {
    const kln = HK_DISTRICTS.filter((d) => d.region === 'KLN').map((d) => d.zh)
    expect(kln).toEqual(['油尖旺區', '深水埗區', '九龍城區', '黃大仙區', '觀塘區'])
  })

  it('八個 NT', () => {
    const nt = HK_DISTRICTS.filter((d) => d.region === 'NT').map((d) => d.zh)
    expect(nt).toEqual([
      '葵青區',
      '荃灣區',
      '屯門區',
      '元朗區',
      '北區',
      '大埔區',
      '沙田區',
      '西貢區',
    ])
  })

  it('離島算 HK（單價表「香港／大嶼山」同一個價，大嶼山喺離島區）', () => {
    expect(regionFromCandidates(['離島區'])).toBe('HK')
    expect(regionFromCandidates(['Islands'])).toBe('HK')
    expect(regionFromCandidates(['Islands District'])).toBe('HK')
  })
})

describe('regionFromCandidates', () => {
  it('中英文都認得', () => {
    expect(regionFromCandidates(['沙田區'])).toBe('NT')
    expect(regionFromCandidates(['Sha Tin'])).toBe('NT')
    expect(regionFromCandidates(['Sha Tin District'])).toBe('NT')
    expect(regionFromCandidates(['觀塘區'])).toBe('KLN')
    expect(regionFromCandidates(['Kwun Tong'])).toBe('KLN')
    expect(regionFromCandidates(['灣仔區'])).toBe('HK')
    expect(regionFromCandidates(['Wan Chai'])).toBe('HK')
  })

  it('大細楷、多餘空格都唔影響', () => {
    expect(regionFromCandidates(['  yuen long  '])).toBe('NT')
    expect(regionFromCandidates(['CENTRAL AND WESTERN'])).toBe('HK')
  })

  it('冇「區」字嘅中文都認得', () => {
    expect(regionFromCandidates(['深水埗'])).toBe('KLN')
    expect(regionFromCandidates(['大埔'])).toBe('NT')
  })

  /**
   * 呢個係最重要嗰個 case：整格比對，唔做「包含」比對。
   * 「North Point」喺東區（HK），如果用包含就會誤中「North」＝北區（NT），
   * 夾車同吊機價即刻報錯。
   */
  it('North Point 唔可以誤中北區', () => {
    expect(regionFromCandidates(['North Point'])).toBeNull()
    expect(regionFromCandidates(['North Point', 'Eastern'])).toBe('HK')
  })

  it('街名含住區名都唔會誤中', () => {
    expect(regionFromCandidates(['Sai Kung Road, Kowloon'])).toBeNull()
    expect(regionFromCandidates(['大埔道'])).toBeNull()
  })

  it('認唔到就 null，唔准估', () => {
    expect(regionFromCandidates([])).toBeNull()
    expect(regionFromCandidates(['Shenzhen'])).toBeNull()
    expect(regionFromCandidates([''])).toBeNull()
  })
})

describe('regionFromNominatimAddress', () => {
  it('喺 address object 逐格搵得到區', () => {
    expect(
      regionFromNominatimAddress({
        road: '青山公路',
        suburb: '荃灣',
        city_district: '荃灣區',
        state: '香港',
        country: '中國',
      }),
    ).toBe('NT')
  })

  it('英文版一樣搵到', () => {
    expect(
      regionFromNominatimAddress({
        road: 'Nathan Road',
        borough: 'Yau Tsim Mong',
        city: 'Hong Kong',
      }),
    ).toBe('KLN')
  })

  it('冇 address object 就 null', () => {
    expect(regionFromNominatimAddress(null)).toBeNull()
    expect(regionFromNominatimAddress(undefined)).toBeNull()
    expect(regionFromNominatimAddress({})).toBeNull()
  })

  it('只有街名認唔到區就 null，唔會靠經緯度或者上下文猜', () => {
    expect(regionFromNominatimAddress({ road: 'Some Road', country: 'China' })).toBeNull()
  })
})
