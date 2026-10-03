/**
 * 「改名未完成」記錄 —— P3f §4.6（Jason 2026-08-24 揀「兩樣都要」）。
 *
 * ⭐⭐ 記喺**呢部機**（`localStorage`），⛔ 冇 DB 欄、⛔ 冇 SQL
 *    （Jason 2026-10-04 睇完原型 PR #84 拍板「只記喺呢部手機」）。
 *    ⚠️ 代價（⛔ 唔准收埋）：第二部手機、辦公室電腦⛔ 見唔到；
 *       清咗瀏覽器資料就冇咗記錄，但 Drive 仍然係半新半舊。
 *
 * ⭐ 叫 Worker **之前**先記低「改名中」（`running: true`），有結果先改／清。
 *    ⇒ 改到一半熄咗 app，下次開照樣見到（「改名中」過咗 `STALE_MS` 就當失敗）。
 *    （AI 代揀，待 Jason 確認）
 *
 * ⛔ 呢度淨係記「邊棵樹、仲有幾多張、點解」—— ⛔ 唔記檔名、⛔ 唔記任何 token。
 */

export type RenamePending = {
  treeId: string
  recordId: string
  /** 記低嗰陣嘅（新）樹牌，設定頁用嚟講「邊棵樹」。 */
  treeNo: string
  /** 仲有幾多張係舊名。⛔ `null` ＝ 唔知（例如成個請求都失敗）。 */
  left: number | null
  /** 已經係中文嘅原因（Worker 個 `why`／我哋自己包嘅句），已去重。 */
  reasons: string[]
  /** 一次改唔晒（超過 `RENAME_BATCH_MAX`），而自動接住改都改唔晒。 */
  hitLimit: boolean
  /** 叫緊 Worker。 */
  running: boolean
  /** ISO 時間。 */
  at: string
}

export const RENAME_PENDING_KEY = 'quote-app.rename-pending.v1'
export const RENAME_PENDING_EVENT = 'quote-app:rename-pending'
/** 「改名中」超過呢個時間 ⇒ 當佢冇咗（熄咗 app／斷咗線）⇒ 照出橫幅。 */
export const STALE_MS = 2 * 60 * 1000

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readAll(store: KeyValueStore | null): Record<string, RenamePending> {
  if (store === null) return {}
  try {
    const parsed: unknown = JSON.parse(store.getItem(RENAME_PENDING_KEY) ?? '{}')
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, RenamePending>) : {}
  } catch {
    // ⛔ 讀唔到（壞咗嘅 JSON）⇒ 當冇記錄，⛔ 唔准成個 app 死。
    return {}
  }
}

function writeAll(store: KeyValueStore | null, all: Record<string, RenamePending>): void {
  if (store === null) return
  try {
    store.setItem(RENAME_PENDING_KEY, JSON.stringify(all))
  } catch (caught) {
    // ⚠️ 寫唔到（私密模式／爆咗容量）⇒ 冇記錄，但⛔ 唔可以令儲存樹失敗。
    console.error('[quote-app] 記錄改名狀態失敗：', caught)
  }
  globalThis.dispatchEvent?.(new Event(RENAME_PENDING_EVENT))
}

export function markRunning(
  tree: { treeId: string; recordId: string; treeNo: string },
  now: Date,
  store: KeyValueStore | null = defaultStore(),
): void {
  const all = readAll(store)
  const before = all[tree.treeId]
  all[tree.treeId] = {
    ...tree,
    left: before?.left ?? null,
    reasons: before?.reasons ?? [],
    hitLimit: before?.hitLimit ?? false,
    running: true,
    at: now.toISOString(),
  }
  writeAll(store, all)
}

export function markFailed(
  treeId: string,
  result: { left: number | null; reasons: string[]; hitLimit: boolean },
  now: Date,
  store: KeyValueStore | null = defaultStore(),
): void {
  const all = readAll(store)
  const before = all[treeId]
  if (!before) return
  all[treeId] = { ...before, ...result, running: false, at: now.toISOString() }
  writeAll(store, all)
}

/** ⭐ 改返成功／棵樹刪咗 ⇒ 清走（橫幅同設定頁一齊冇）。 */
export function clearPending(treeId: string, store: KeyValueStore | null = defaultStore()): void {
  const all = readAll(store)
  if (!(treeId in all)) return
  delete all[treeId]
  writeAll(store, all)
}

/**
 * 而家有咩未完成。⭐ 過咗 `STALE_MS` 嘅「改名中」當失敗（`running: false`）。
 * ⭐ 次序定死（按樹牌），⛔ 唔跟 object key 次序。
 */
export function listPending(now: Date, store: KeyValueStore | null = defaultStore()): RenamePending[] {
  return Object.values(readAll(store))
    .filter((item) => item && typeof item.treeId === 'string')
    .map((item) =>
      item.running && now.getTime() - Date.parse(item.at) > STALE_MS ? { ...item, running: false } : item,
    )
    .sort((a, b) => a.treeNo.localeCompare(b.treeNo, 'zh-Hant', { numeric: true }))
}

/** 樹木頁頂橫幅嗰句（書面語）。⛔ `null` ＝ 唔出橫幅。 */
export function bannerText(item: RenamePending | null): string | null {
  if (item === null || item.running) return null
  return item.left !== null && item.left > 0
    ? `有 ${item.left} 張相片的檔名未能更改，Drive 上仍然是舊樹牌。`
    : 'Drive 上部分相片的檔名未能更改，仍然是舊樹牌。'
}

/** 設定頁「改名未完成」嗰格。 */
export function diagLine(items: RenamePending[]): string {
  if (items.length === 0) return '無'
  return items
    .map((item) => {
      const count = item.left !== null && item.left > 0 ? ` · ${item.left} 張` : ''
      return `#${item.treeNo || '—'}${count}${item.running ? '（進行中）' : ''}`
    })
    .join('、')
}

/** 設定頁總結句。⛔ 冇嘢 ⇒ `null`（⛔ 唔出「冇問題」—— 設定頁量唔到「全部相片已上傳」）。 */
export function diagSummary(items: RenamePending[]): string | null {
  const stuck = items.filter((item) => !item.running).length
  if (stuck === 0) return null
  return `有問題：${stuck} 個樹牌的 Drive 檔名修改到一半停止，請返回該棵樹點擊「再試」。`
}
