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
      return '你拒絕咗定位權限，請自己打地址。（想用返 GPS 就喺瀏覽器設定開返位置權限）'
    case 2:
      return '攞唔到定位，請自己打地址。'
    case 3:
      return '定位等太耐，請自己打地址。'
    default:
      return '定位出咗問題，請自己打地址。'
  }
}

export const REVERSE_FAILED_MESSAGE = '反查唔到地址，座標已經記低咗，請自己打。'
export const REGION_UNKNOWN_MESSAGE = '認唔到地區，請自己揀。'
export const OSM_ATTRIBUTION = '地址資料來自 OpenStreetMap'

export function getCurrentCoords(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('呢部機唔支援定位，請自己打地址。'))
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
