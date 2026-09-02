import type { QuoteRecord } from '../../src/lib/records'
import type { TreesApi } from '../../src/lib/trees'
import type { SiteForm, SiteFormApi } from '../../src/lib/siteForm'
import type { PriceApi, PriceRow, PriceTable } from '../../src/lib/prices'

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

/** 樹木清單用。數字同工序照原型嗰五棵，⛔ 唔好亂改 —— 改咗量出嚟嘅闊度就唔同。 */
const tree = (id: string, no: string, species: string, mitigations: string[], note = '') =>
  ({
    id, tree_no: no, species, mitigations, mitigation_other: '', note,
    height_m: null, dbh_mm: null, crown_m: null,
  }) as unknown as import('../../src/lib/trees').QuoteTree

export const TREES = [
  tree('1', '1', '', ['crown_clean', 'crown_reduce']),
  tree('2', '2', '', ['prune']),
  tree('3', '3', '', []),
  tree('4', '4', '', ['crown_clean']),
  tree('5', '5', '', ['crown_clean']),
]

export const trees = { list: async () => TREES } as unknown as TreesApi

export const photosApi = {
  listByRecord: async () => [],
  findByOperationId: async () => null,
  create: async () => ({}),
} as unknown as import('../../src/lib/photos').PhotosApi

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

/**
 * 單價表：⭐ 十八行同 `P4-單價表-migration.sql` 第 3 段一模一樣，
 * ⛔ 唔准自己改數 —— 改咗就唔係量緊真嘢。
 */
const pr = (
  key: string,
  category: string,
  label: string,
  calc_mode: string,
  has_qty: boolean,
  nt: number | null,
  kl: number | null,
  hk: number | null,
  night: number | null,
  sort_order: number,
): PriceRow =>
  ({
    key, category, label, calc_mode, has_qty,
    price_nt: nt, price_kl: kl, price_hk: hk, price_night: night,
    sort_order, archived_at: null, updated_by: null, updated_at: '', created_at: '',
  }) as unknown as PriceRow

export const PRICE_TABLE: PriceTable = [
  pr('climber', 'manpower', '攀樹師', 'per_person_day', true, 2000, 2000, 2000, null, 10),
  pr('crew', 'manpower', '地面工人', 'per_person_day', true, 1000, 1000, 1000, null, 20),
  pr('overhead', 'fixed', 'Overhead', 'auto_per_day', false, 2000, 2000, 2000, null, 30),
  pr('t24', 'waste', '24噸夾車', 'per_unit', true, 900, 1100, 1300, null, 40),
  pr('t30', 'waste', '30噸夾車', 'per_unit', true, 1500, 1500, 1500, null, 50),
  pr('t9', 'waste', '9噸碎', 'once', false, 300, 300, 300, null, 60),
  pr('crane_fatboy', 'crane', '肥仔 - 30噸', 'per_day', true, 3500, 3500, 3900, 5000, 70),
  pr('crane_fai30', 'crane', '輝哥 - 30噸 + 科同', 'per_day', true, 4500, 4500, 4500, null, 80),
  pr('crane_fai86', 'crane', '輝哥 8+6', 'per_day', true, 7800, 7800, 8000, 10500, 90),
  pr('crane_fai100', 'crane', '輝哥 100T 8+6尾', 'per_day', true, 11500, 11500, 11500, null, 100),
  pr('lift_18', 'lift', '18M', 'per_day', true, 2600, 2600, 2600, null, 110),
  pr('lift_25', 'lift', '25M', 'per_day', true, 3400, 3400, 3400, null, 120),
  pr('lift_32', 'lift', '32M', 'per_day', true, 5500, 5500, 5500, null, 130),
  pr('lift_37', 'lift', '37M', 'per_day', true, 9000, 9000, 9000, null, 140),
  pr('lift_46', 'lift', '46M', 'per_day', true, 10000, 10000, 10000, null, 150),
  pr('lift_other', 'lift', 'Other', 'per_day', true, null, null, null, null, 160),
  pr('yes_self', 'stump', '自己起', 'once', false, null, null, null, null, 170),
  pr('yes_chuen', 'stump', '銓哥報價', 'once', false, null, null, null, null, 180),
]

export const fullPriceApi = {
  list: async () => PRICE_TABLE,
  update: async () => PRICE_TABLE[0],
} as unknown as PriceApi
