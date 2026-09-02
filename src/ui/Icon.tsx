import { ICON_SPRITE } from './sprite'

/**
 * 一次過插入 stage57 嗰 46 個 symbol。喺 app 最外層放一次就夠。
 *
 * ⛔ 唔可以用 `<use href="/icons.svg#id">` 呢種外部 sprite ——
 * Safari 唔支援跨檔 `<use>`，iPhone 會一個 icon 都唔出。所以一定要 inline。
 */
export function IconSprite() {
  return <svg style={{ display: 'none' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_SPRITE }} />
}

/**
 * 一個 icon。`name` 係 sprite 入面個 id，例如 `03_project_detail__tree_list`。
 *
 * ⭐ 顏色跟 `currentColor`，⛔ 唔好喺呢度寫死色 —— 換皮就唔使逐個 icon 揾。
 */
export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={`ico${className ? ' ' + className : ''}`} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  )
}

/** 用喺畫面嘅 icon 名。⛔ 打字打錯個 id 係 render 唔出但又唔會報錯，所以集中喺呢度。 */
export const ICONS = {
  back: '02_global_actions__back',
  chevron: '02_global_actions__chevron_right',
  add: '02_global_actions__add',
  del: '02_global_actions__delete_bin',
  search: '02_global_actions__search',
  navHome: '01_bottom_nav__home_seedling',
  navProjects: '01_bottom_nav__projects_clipboard',
  navSync: '01_bottom_nav__sync_cloud_upload',
  navSettings: '01_bottom_nav__settings_gear',
  projectInfo: '03_project_detail__project_info',
  treeList: '03_project_detail__tree_list',
  envCamera: '03_project_detail__environment_camera',
  exportPdf: '03_project_detail__export_pdf',
  customer: '03_project_detail__customer',
  districtPin: '03_project_detail__district_pin',
  treeCount: '03_project_detail__tree_count',
  statusQuote: '03_project_detail__status_quote',
  statusPending: '07_quote_status__quote_pending',
  statusQuoted: '07_quote_status__quoted',
  statusWon: '07_quote_status__won',
  unitPrice: '06_settings_admin__unit_price',
  lock: '06_settings_admin__lock',
  logout: '06_settings_admin__logout',
  customerBook: '08_management__customer_book',
} as const
