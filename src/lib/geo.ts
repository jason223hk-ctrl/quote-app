import { regionFromNominatimAddress } from './districts'
import type { Region } from './records'

export type Coords = {
  lat: number
  lng: number
  /** ISO timestamp，存去 gps_at */
  at: string
}

export type ReverseResult = {
  /** 反查到嘅文字地址；認唔到就 null */
  address: string | null
  /** 認到區先有；認唔到一定要係 null，唔准估 */
  region: Region | null
}

/** 地盤成日冇訊號，所以每一種失敗都要有一句人話。 */
export function geolocationErrorMessage(code: number | null): string {
  switch (code) {
    case 1:
      return '你拒絕了定位權限，請自行輸入地址。（如要重新使用 GPS，請在瀏覽器設定開啟位置權限）'
    case 2:
      return '定位獲取失敗，請自行輸入地址。'
    case 3:
      return '定位等候過久，請自行輸入地址。'
    default:
      return '定位出現問題，請自行輸入地址。'
  }
}

export const REVERSE_FAILED_MESSAGE = '無法反查地址，座標已經記錄，請自行輸入。'
export const REGION_UNKNOWN_MESSAGE = '無法辨認地區，請自行選擇。'
export const OSM_ATTRIBUTION = '地址資料來自 OpenStreetMap'

export function getCurrentCoords(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('本裝置不支援定位，請自行輸入地址。'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          at: new Date(position.timestamp).toISOString(),
        }),
      (error) => {
        console.error('[quote-app] geolocation error:', error.code, error.message)
        reject(new Error(geolocationErrorMessage(error.code)))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

export function buildReverseUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',
    'accept-language': 'zh-HK,zh,en',
  })
  return `https://nominatim.openstreetmap.org/reverse?${params.toString()}`
}

type ReversePayload = {
  display_name?: unknown
  address?: Record<string, unknown> | null
  error?: unknown
}

export function parseReverse(payload: ReversePayload | null | undefined): ReverseResult {
  if (!payload || payload.error) return { address: null, region: null }

  const address = typeof payload.display_name === 'string' ? payload.display_name.trim() : ''

  return {
    address: address === '' ? null : address,
    region: regionFromNominatimAddress(payload.address),
  }
}

/** 同一組座標用嘅 cache key，順便當成「唔好重複查」嘅依據。 */
export function coordsKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

/**
 * 反查地址。
 *
 * Nominatim 使用守則：**淨係喺用家撳掣嗰陣先發一次**——冇 debounce、冇 autocomplete、
 * 冇連環快發。同一組座標唔會查第二次（由 caller 用 coordsKey 記住上次結果）。
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  const response = await fetch(buildReverseUrl(lat, lng), {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    console.error('[quote-app] nominatim HTTP', response.status)
    throw new Error(REVERSE_FAILED_MESSAGE)
  }

  return parseReverse((await response.json()) as ReversePayload)
}
