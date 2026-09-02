/**
 * 導航。照 tree-app-v7 嘅做法：唔用 router，Route 係一個 union type，
 * 由最上層揸住 `useState<Route>`，靠 `nav.go(route)` 換版。
 */
export type Route =
  | { name: 'home' }
  | { name: 'records' }
  /** 工程詳情 hub —— 基本資料／樹木清單／現場資料表三個入口 */
  | { name: 'record'; recordId: string }
  /** 基本資料表單。recordId = null 即係新增工程 */
  | { name: 'record-form'; recordId: string | null }
  | { name: 'trees'; recordId: string }
  | { name: 'site-form'; recordId: string }
  | { name: 'settings' }
  /** 單價設定。⛔ 只有辦公室改得（RLS 把關）。 */
  | { name: 'prices' }

export interface Nav {
  go: (r: Route) => void
}

/** 底部三粒掣邊粒着燈。 */
export function activeTab(route: Route): 'home' | 'records' | 'settings' {
  switch (route.name) {
    case 'home':
      return 'home'
    case 'settings':
    case 'prices':
      return 'settings'
    default:
      return 'records'
  }
}
