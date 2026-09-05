/**
 * 導航。照 tree-app-v7 嘅做法：唔用 router，Route 係一個 union type，
 * 由最上層揸住 `useState<Route>`，靠 `nav.go(route)` 換版。
 */
export type Route =
  | { name: 'home' }
  | { name: 'records' }
  /** 工程詳情 hub —— 基本資料／樹木清單／現場資料表三個入口 */
  | { name: 'record'; recordId: string }
  /** 工程資料（工程本身 ＋ 現場）。recordId = null 即係新增工程 */
  | { name: 'record-form'; recordId: string | null }
  /** 客戶資料：客戶、聯絡人、電話 */
  | { name: 'client-form'; recordId: string }
  | { name: 'trees'; recordId: string }
  /** 環境相：成個工程一份，⛔ 唔屬於任何一棵樹 */
  | { name: 'env-photos'; recordId: string }
  /** 匯出 PDF。⛔ 冇預覽頁，⛔ 匯出之後唔會問轉狀態 */
  | { name: 'export-pdf'; recordId: string }
  /** 同步：⛔ 零粒掣、零彈窗，淨係睇 */
  | { name: 'sync' }
  | { name: 'settings' }
  /** 單價設定。⛔ 只有辦公室改得（RLS 把關）。 */
  | { name: 'prices' }
  /** 客戶簿：全公司共用一本。⛔ 揀咗係複製一份入工程，⛔ 唔係指過去。 */
  | { name: 'clients' }

export interface Nav {
  go: (r: Route) => void
}

/** 底部三粒掣邊粒着燈。 */
export function activeTab(route: Route): 'home' | 'records' | 'sync' | 'settings' {
  switch (route.name) {
    case 'home':
      return 'home'
    case 'sync':
      return 'sync'
    case 'settings':
    case 'prices':
    case 'clients':
      return 'settings'
    default:
      return 'records'
  }
}
