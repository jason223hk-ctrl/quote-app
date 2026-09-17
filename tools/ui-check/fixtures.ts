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

/**
 * 工程名長到爆嗰張卡。
 *
 * ⛔⛔ **個名係 Jason 2026-09-15 部機上面嗰單真嘢，⛔ 唔准改短、⛔ 唔准改做中文。**
 * ⚠️ 佢嘅要害係「**一串冇空格嘅英數字**」—— `overflow-wrap: normal` 之下
 *    **一個「字」唔會斷**，於是啲字畫出盒外、壓住右邊粒狀態標籤。
 * ⭐ 中文名逐個字都斷得開 ⇒ **用中文樣本係試唔出呢個窿嘅**。
 *
 * ⚠️ 狀態揀 `site`（「現場中」）—— 照 Jason 張截圖嗰單。
 */
export const LONG_NAME_RECORD = {
  ...RECORDS[0],
  name: 'Test123456897536654267898758',
  status: 'site',
} as unknown as QuoteRecord

/** 樹木清單用。數字同工序照原型嗰五棵，⛔ 唔好亂改 —— 改咗量出嚟嘅闊度就唔同。 */
const tree = (id: string, no: string, species: string, mitigations: string[], note = '') =>
  ({
    id, tree_no: no, species, mitigations, mitigation_other: '', note,
    height_m: null, dbh_mm: null, crown_m: null,
  }) as unknown as import('../../src/lib/trees').QuoteTree

export const TREES = [
  tree('1', '1', '', ['crown_cleaning', 'crown_reduction']),
  tree('2', '2', '', ['crown_thinning']),
  tree('3', '3', '', []),
  tree('4', '4', '', ['crown_cleaning']),
  tree('5', '5', '', ['crown_cleaning', 'removal']),
]

export const trees = { list: async () => TREES, listAll: async () => TREES } as unknown as TreesApi

/**
 * 「移除」同「修剪／拉索加固」互斥 —— 兩個要驗嘅樣本。
 *
 * ⛔⛔ **特登另開，⛔ 唔改上面個 `TREES`** —— 嗰批係樹木清單量闊度用嘅
 *    （佢自己個註解已經寫住⛔ 唔好亂改）。
 */
/** 已經剔咗「移除」⇒ 四項修剪 ＋ 拉索加固要剔唔到，而且要講點解。 */
export const REMOVAL_TREE = tree('r1', '7', '', ['removal'])
/**
 * ⚠️⚠️ **舊單嗰種：兩樣都已經剔咗。**
 * ⭐ 呢棵樹要驗嘅係**出口** —— 兩樣**都仲要剔得走**。
 * ⛔ 連剔走都俾人擋住，佢就永遠卡死喺一個違規狀態，⛔ 連修都修唔到。
 * （Jason 2026-09-16：「唔理舊樹，我會刪除舊工程」⇒ ⛔ 冇遷移、⛔ 冇提示，
 *   ⭐ 但呢條出口規矩照留 —— 唔然佢刪之前嗰幾日就卡死。）
 */
export const BOTH_TREE = tree('b1', '8', '', ['crown_cleaning', 'removal'])

/**
 * 彈窗數「連帶消失：N 棵樹、N 張相」用。
 *
 * ⛔⛔ **特登另開一批，⛔ 唔改上面個 `TREES`** —— 嗰批係樹木清單畫面量闊度用嘅，
 *    改咗（就算淨係加兩個欄）都唔值得去冒「量出嚟嘅數字郁咗」嗰個險。
 * ⭐ 兩棵樹、四張相 —— 照 Jason 2026-09-14 張截圖嗰個例。
 */
export const purgeApis = {
  listTrees: async () =>
    ['pa', 'pb'].map(
      (id) =>
        ({ id, record_id: RECORD.id, deleted_at: null }) as unknown as
          import('../../src/lib/trees').QuoteTree,
    ),
  listRows: async () =>
    ['pr1', 'pr2', 'pr3', 'pr4'].map(
      (operation_id) =>
        ({
          id: 'row-' + operation_id,
          record_id: RECORD.id,
          operation_id,
          deleted_at: null,
        }) as unknown as import('../../src/lib/photos').QuotePhoto,
    ),
}

/** 推卡刪除／右上角垃圾桶嗰一組。⛔ 兩個入口共用同一個 object，同真 app 一樣。 */
export const swipeDelete = { run: async () => {}, apis: purgeApis }

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

/**
 * 同步頁用。三種狀態各有樣本 —— ⛔ 唔准淨係得「已同步」，
 * 咁樣量嘅係一個永遠唔會出現嘅畫面。
 */
const photo = (
  id: string,
  recordId: string,
  treeId: string | null,
  mitigation: string | null,
  seq: number,
  state: 'synced' | 'pending' | 'failed',
  driveError = '',
) =>
  ({
    id,
    record_id: recordId,
    tree_id: treeId,
    mitigation,
    seq,
    operation_id: `op-${id}`,
    r2_key: `k/${id}.jpg`,
    r2_synced_at: state === 'pending' ? null : '2026-09-03T02:10:00Z',
    r2_error: '',
    drive_file_id: state === 'synced' ? `d-${id}` : '',
    drive_synced_at: state === 'synced' ? '2026-09-03T02:11:00Z' : null,
    drive_error: driveError,
    size_bytes: 2_100_000,
    sha256: '',
    captured_at: '2026-09-03T02:00:00Z',
    remark: '',
    marks: null,
    created_by: 'u1',
    created_at: '2026-09-03T02:00:00Z',
    deleted_at: null,
  }) as unknown as import('../../src/lib/photos').QuotePhoto

export const PHOTOS = [
  photo('p1', '1', '1', 'crown_cleaning', 1, 'synced'),
  photo('p2', '1', '1', null, 1, 'synced'),
  photo('p3', '2', '2', 'crown_thinning', 1, 'pending'),
  photo('p4', '3', null, null, 1, 'synced'),
  photo('p5', '3', '4', 'crown_cleaning', 2, 'pending'),
  photo(
    'p6',
    '4',
    '5',
    'removal',
    1,
    'failed',
    'Google Drive API error 403: The user has exceeded their Drive storage quota. (storageQuotaExceeded)',
  ),
]

export const syncPhotosApi = {
  listAll: async () => PHOTOS,
} as unknown as import('../../src/lib/photos').PhotosApi

/** 匯出 PDF 頁用。要有相先量到「選擇樹木」嗰段。 */
export const exportPhotosApi = {
  listByRecord: async () => [
    photo('x1', '1', '1', null, 1, 'synced'),
    photo('x2', '1', '1', 'crown_cleaning', 1, 'synced'),
    photo('x3', '1', '2', null, 1, 'synced'),
  ],
} as unknown as import('../../src/lib/photos').PhotosApi
