import type { Region } from './records'

/**
 * 香港十八區 → 報價地區。呢張表係硬對應，**唔准估、唔准用經緯度框住嚟猜**。
 *
 * 離島算 HK：單價表「香港／大嶼山」係同一個價，而大嶼山喺離島區。
 * Nominatim 有時出英文有時出中文，所以中英文都要對得到。
 */
export type District = {
  region: Region
  zh: string
  en: string
  /** 其他叫法（Nominatim 唔同版本、簡寫、有冇「區」字） */
  aliases: string[]
}

export const HK_DISTRICTS: District[] = [
  // 香港島 + 離島 → HK
  { region: 'HK', zh: '中西區', en: 'Central and Western', aliases: ['中西', 'Central & Western'] },
  { region: 'HK', zh: '灣仔區', en: 'Wan Chai', aliases: ['灣仔', 'Wanchai'] },
  { region: 'HK', zh: '東區', en: 'Eastern', aliases: [] },
  { region: 'HK', zh: '南區', en: 'Southern', aliases: [] },
  { region: 'HK', zh: '離島區', en: 'Islands', aliases: ['離島'] },

  // 九龍 → KLN
  { region: 'KLN', zh: '油尖旺區', en: 'Yau Tsim Mong', aliases: ['油尖旺'] },
  { region: 'KLN', zh: '深水埗區', en: 'Sham Shui Po', aliases: ['深水埗', 'Shamshuipo'] },
  { region: 'KLN', zh: '九龍城區', en: 'Kowloon City', aliases: ['九龍城'] },
  { region: 'KLN', zh: '黃大仙區', en: 'Wong Tai Sin', aliases: ['黃大仙'] },
  { region: 'KLN', zh: '觀塘區', en: 'Kwun Tong', aliases: ['觀塘'] },

  // 新界 → NT
  { region: 'NT', zh: '葵青區', en: 'Kwai Tsing', aliases: ['葵青'] },
  { region: 'NT', zh: '荃灣區', en: 'Tsuen Wan', aliases: ['荃灣'] },
  { region: 'NT', zh: '屯門區', en: 'Tuen Mun', aliases: ['屯門'] },
  { region: 'NT', zh: '元朗區', en: 'Yuen Long', aliases: ['元朗'] },
  { region: 'NT', zh: '北區', en: 'North', aliases: [] },
  { region: 'NT', zh: '大埔區', en: 'Tai Po', aliases: ['大埔', 'Taipo'] },
  { region: 'NT', zh: '沙田區', en: 'Sha Tin', aliases: ['沙田', 'Shatin'] },
  { region: 'NT', zh: '西貢區', en: 'Sai Kung', aliases: ['西貢'] },
]

/**
 * 正規化之後做**整格比對**，唔做「包含」比對。
 *
 * 呢點好緊要：如果用「包含」，Nominatim 出「North Point」（喺東區）就會誤中「North」＝北區，
 * 由 HK 變咗 NT，夾車同吊機價即刻報錯。寧願認唔到，都唔可以認錯。
 */
export function normaliseDistrict(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*district$/, '')
}

function keysOf(district: District): string[] {
  return [district.zh, district.en, ...district.aliases].map(normaliseDistrict)
}

/** 由一堆候選字串搵區。認唔到就 null——認唔到好過認錯。 */
export function regionFromCandidates(candidates: string[]): Region | null {
  const normalised = candidates
    .filter((value) => typeof value === 'string')
    .map(normaliseDistrict)
    .filter((value) => value !== '')

  for (const district of HK_DISTRICTS) {
    const keys = keysOf(district)
    if (normalised.some((value) => keys.includes(value))) return district.region
  }
  return null
}

/**
 * Nominatim 嘅 address object。只逐格拎值去比，唔會攞 display_name 成句去搜，
 * 因為成句入面好容易含住街名而誤中。
 */
export function regionFromNominatimAddress(
  address: Record<string, unknown> | null | undefined,
): Region | null {
  if (!address) return null
  const values = Object.values(address).filter(
    (value): value is string => typeof value === 'string',
  )
  return regionFromCandidates(values)
}
