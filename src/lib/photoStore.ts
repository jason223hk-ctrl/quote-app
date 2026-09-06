import type { PendingPhoto } from './photoUpload'

/**
 * 部機嗰份。用 IndexedDB，唔用 Dexie —— 一張表、四個操作，唔值得為咗佢加個 library。
 *
 * ⛔ 呢度存住嘅唔算一份雲端副本（`docs/P3-現場影相-設計.md` 第六章）。
 * tree app 中過招：同事清咗瀏覽器資料，張相就冇咗，而且發生嗰陣冇人知。
 *
 * P3a **上到 R2 之後都唔會刪部機嗰份**。P3a 之後得 R2 一份雲端副本，
 * 部機嗰份係「仲剩幾多份」入面實實在在嘅一份，唔可以為咗慳位掉咗佢。
 */
const DB_NAME = 'quote-app-photos'
const DB_VERSION = 1
const STORE = 'pending'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'operationId' })
        store.createIndex('recordId', 'recordId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('開唔到部機嘅相片儲存空間。'))
  })
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = work(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('部機嘅相片儲存空間出錯。'))
        tx.oncomplete = () => db.close()
      }),
  )
}

/**
 * 部機嗰份一有改動就叫一聲。
 *
 * ⛔⛔ 有咗呢個，「未上載 N 張」就**唔使 poll**。
 * ⚠️ 每秒查一次 IndexedDB 係阿耀部機食電嘅做法，而且成日查極都冇嘢變 ——
 *    ⭐ 真相係：張相**淨係喺有人寫入嗰陣**先會變，所以有人寫就講一聲，冇寫就唔好嘈。
 *
 * ⛔ 一定要喺 `put()` 入面叫 —— 佢係**唯一**一個寫入點
 *    （影完相、撳再試一次、背景自動重傳，三條路全部經佢）。
 *    喺個別畫面各自叫一次嘅話，將來加多一條寫入路就實漏。
 */
type Listener = () => void
const listeners = new Set<Listener>()

/** 聽住部機嗰份有冇改。回傳一個「唔聽喇」嘅 function。 */
export function subscribePhotoStore(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function announce(): void {
  for (const listener of listeners) {
    // ⛔ 一個聽眾炸咗唔可以拖冧其他 —— 佢哋之間冇關係。
    try {
      listener()
    } catch (caught) {
      console.error('[quote-app] photo store listener failed:', caught)
    }
  }
}

export type PhotoStore = {
  put: (item: PendingPhoto) => Promise<void>
  get: (operationId: string) => Promise<PendingPhoto | null>
  listByRecord: (recordId: string) => Promise<PendingPhoto[]>
  /**
   * 成部機所有未清嘅相，⛔ 唔分工程。
   *
   * ⭐ 自動重傳要嘅就係呢個：阿耀影完相、行開咗、之後喺**第二單工程**開返 app，
   * 嗰陣 `listByRecord` 睇嘅係新嗰單 —— 舊嗰單張相就冇人理，永遠留喺部機。
   */
  listAll: () => Promise<PendingPhoto[]>
}

export const photoStore: PhotoStore = {
  async put(item) {
    await run('readwrite', (store) => store.put(item))
    announce()
  },

  async get(operationId) {
    const found = await run<PendingPhoto | undefined>('readonly', (store) =>
      store.get(operationId),
    )
    return found ?? null
  },

  async listByRecord(recordId) {
    const found = await run<PendingPhoto[]>('readonly', (store) =>
      store.index('recordId').getAll(recordId),
    )
    return found ?? []
  },

  async listAll() {
    const found = await run<PendingPhoto[]>('readonly', (store) => store.getAll())
    return found ?? []
  },
}

/** 部機支唔支援。唔支援就要一開始講清楚，唔可以影完先話你知存唔到。 */
export function localStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}
