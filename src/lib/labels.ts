import type { QuoteStatus, Region, Shift } from './records'

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  site: '現場中',
  pending: '待報價',
  quoted: '已報價',
  sent: '已發出',
  won: '中標',
  lost: '不中標',
}

export const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: 'NT', label: '新界' },
  { value: 'KLN', label: '九龍' },
  { value: 'HK', label: '香港／大嶼山' },
]

export const SHIFT_OPTIONS: { value: Shift; label: string }[] = [
  { value: 'day', label: '日更' },
  { value: 'night', label: '夜更' },
]

export function statusLabel(status: QuoteStatus | null): string {
  if (!status) return '—'
  return STATUS_LABELS[status] ?? status
}

export function regionLabel(region: Region | null): string {
  return REGION_OPTIONS.find((option) => option.value === region)?.label ?? '—'
}

export function shiftLabel(shift: Shift | null): string {
  return SHIFT_OPTIONS.find((option) => option.value === shift)?.label ?? '—'
}

/** 卡上面「大判 - 地點」嗰行。任何一邊冇填都唔可以出多餘嘅「-」。 */
export function contractorSiteLine(mainCon: string | null, site: string | null): string {
  return [mainCon, site].filter((part) => part && part.trim() !== '').join(' - ')
}

export function todayIso(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
