import type { QuoteRecord } from '../../src/lib/records'
import type { TreesApi } from '../../src/lib/trees'
import type { SiteForm, SiteFormApi } from '../../src/lib/siteForm'
import type { PriceApi, PriceTable } from '../../src/lib/prices'

/**
 * 對數用嘅假資料。⛔ 唔會入正式 bundle。
 * ⚠️ 數字要同原型嗰啲樣本對得上，否則量出嚟嘅闊度會因為字數唔同而有差。
 */
const mk = (
  id: string,
  name: string,
  date: string,
  region: string,
  shift: string,
  status: string,
  client: string | null,
  address: string,
) =>
  ({
    id,
    name,
    record_date: date,
    region,
    shift,
    status,
    client,
    address,
    contact: '',
    phone: '',
    archived: false,
    deleted_at: null,
    created_at: date,
    markup_pct: 50,
    price_snapshot: null,
    price_snapshot_at: null,
  }) as unknown as QuoteRecord

export const RECORDS: QuoteRecord[] = [
  mk('1', '彩', '2026-08-22', 'KLN', 'day', 'pending', '彩霞邨', '彩月樓'),
  mk('2', '廿', '2026-08-14', 'NT', 'day', 'pending', null, ''),
  mk('3', '天恆', '2026-08-28', 'NT', 'night', 'pending', '天水圍天恆邨', '恆貴樓'),
  mk('4', '順利', '2026-08-27', 'KLN', 'day', 'pending', '觀塘順利邨', '利安樓'),
  mk('5', '麗宮', '2026-08-20', 'HK', 'day', 'quoted', '麗宮', 'A 座'),
  mk('6', '石籬', '2026-08-11', 'NT', 'day', 'won', '石籬邨', ''),
]

export const RECORD = RECORDS[0]

export const trees = { list: async () => new Array(7).fill({}) } as unknown as TreesApi

const FORM = {
  work_days: 3,
  crew_total: 3,
  climbers_per_day: 2,
  waste_options: ['t24'],
  waste_t24_qty: 2,
  waste_t30_qty: null,
  machine_options: ['crane20'],
  stump_options: ['self'],
} as unknown as SiteForm

export const siteFormApi = { get: async () => FORM } as unknown as SiteFormApi

const PRICES = [
  { key: 'climber', label: '攀樹師', price_nt: 3500, price_kl: 3500, price_hk: 3500, price_night: null, has_qty: false },
  { key: 'crew', label: '地面工人', price_nt: 1500, price_kl: 1500, price_hk: 1500, price_night: null, has_qty: false },
  { key: 'overhead', label: 'Overhead', price_nt: 1500, price_kl: 1500, price_hk: 1500, price_night: null, has_qty: false },
  { key: 't24', label: '24 噸夾車', price_nt: 2000, price_kl: 2200, price_hk: 2400, price_night: null, has_qty: true },
  { key: 'crane20', label: '20 噸', price_nt: 4400, price_kl: 4600, price_hk: 5000, price_night: null, has_qty: false },
] as unknown as PriceTable

export const priceApi = { list: async () => PRICES } as unknown as PriceApi

export const nav = { go: () => {} } as never
