import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { pullLabel, type PullState } from '../lib/pullToRefresh'
import { usePullToRefresh } from './usePullToRefresh'
import { VERSION_LABEL } from './version'
import type { Nav, Route } from './routes'
import { Icon, ICONS, IconSprite } from './Icon'

export { IconSprite }

/**
 * 共用外殼。結構同 class 名照抄 tree-app-v7 `src/ui/screens.tsx`：
 * BotanicalHeader / BrandBlock / UserPill / ChipButton / HeaderTitle /
 * BottomNav / StatCard / SectionHead / FloatBody / ScrollBody。
 * 分咗檔（v7 嗰個 3480 行單檔太大），但版面同命名一樣。
 */

export interface UserInfo {
  email: string
  initial: string
}

export function userInfoFrom(email: string): UserInfo {
  const local = email.trim().split('@')[0]
  const initial = (local.charAt(0) || 'U').toUpperCase()
  return { email, initial }
}

export function BotanicalHeader({
  left,
  right,
  compact,
}: {
  left: ReactNode
  right?: ReactNode
  /**
   * 緊湊 header：透明底、冇波浪、右上角一團淡橄欖光。
   * ⭐ 原型 stage57 全部畫面都係咁 —— `.curve{display:none}`，波浪喺改版嗰陣拆咗。
   *
   * 三個變體（內距同標題大細由原型逐個度返）：
   *   `true`      表單類（基本資料、現場資料表、樹木頁、單價設定）—— 12/18/10、標題 27px
   *   `'project'` 工程詳情 —— 22/18/14、標題 27px
   *   `'big'`     設定 —— 內距同表單一樣、標題 33px 兼左邊縮入 .5em
   *   `'list'`    工程列表 —— 14/18/17、標題 33px
   */
  compact?: boolean | 'project' | 'big' | 'list'
}) {
  const variant = typeof compact === 'string' ? ` bheader--${compact}` : ''
  return (
    <header className={`bheader${compact ? ' bheader--compact' + variant : ''}`}>
      {/* 波浪係獨立背景層，header 內容永遠唔會被遮罩剪到 */}
      {!compact && <div className="bheader-bg" />}
      <div className="bheader-row">
        <div className="bheader-left">{left}</div>
        <div className="bheader-right">{right}</div>
      </div>
    </header>
  )
}

export function LoginHeader() {
  return (
    <header className="bheader login-header">
      <div className="bheader-bg" />
      <div className="bheader-row">
        <BrandBlock withVersion />
      </div>
    </header>
  )
}

export function BrandBlock({ withVersion }: { withVersion?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true" />
      <div className="brand-text">
        <div className="brand-zh">森伝報價</div>
        <div className="brand-en">SYLVAN QUOTATION</div>
        {withVersion && (
          <div className="version-pill" data-testid="app-version">
            {VERSION_LABEL}
          </div>
        )}
      </div>
    </div>
  )
}

export function UserPill({ user }: { user: UserInfo }) {
  return (
    <div className="user-pill" data-testid="user-pill">
      <span className="avatar">{user.initial}</span>
      <span className="user-name">{user.email}</span>
    </div>
  )
}

export function ChipButton({
  icon,
  label,
  onClick,
  testid,
  small,
}: {
  /** sprite 入面個 id，用 ICONS 攞，⛔ 唔好手打字串。 */
  icon: string
  label: string
  onClick: () => void
  testid?: string
  small?: boolean
}) {
  return (
    <button
      className={`chip-btn${small ? ' small' : ''}`}
      onClick={onClick}
      aria-label={label}
      data-testid={testid}
    >
      <Icon name={icon} />
    </button>
  )
}

export function HeaderTitle({
  name,
  sub,
  back,
}: {
  name: ReactNode
  sub?: ReactNode
  back?: ReactNode
}) {
  /**
   * ⚠️ 返回掣要係文字欄**外面**嘅兄弟，⛔ 唔可以淨係同標題同一行 ——
   * 咁樣副標先會同標題左邊對齊（原型 `header .row` 就係咁）。
   * 舊寫法個副標由 18px 起，同標題差咗成 46px。
   */
  return (
    <div className="head-row">
      {back}
      <div className="head-title">
        <div className="head-name">{name}</div>
        {sub && <div className="head-sub">{sub}</div>}
      </div>
    </div>
  )
}

/**
 * 向下拉刷新嗰個轉圈。
 *
 * ⛔⛔ **靜止（idle）嗰陣回 `null`** —— 成個 DOM node 都唔會出。
 *    ⚠️ 呢個唔止係靚唔靚：`ui:check` 量嘅係靜止嗰個樣，
 *    出一個高度 0 嘅空 div 都可能推歪下面啲嘢。
 *
 * ⛔ 唔准靜靜雞刷完一啲提示都冇（Jason 2026-09-13 第 6 條）——
 *    人見唔到嘢動，就會拉三四次。
 *
 * ⭐ 出咗俾外面用，係因為**首頁唔用共用嗰個容器**（見 `HomeScreen`）——
 *    ⛔ 但佢一定要用返呢個指示器同 `usePullToRefresh`，
 *    唔准另外砌一套（Jason 2026-09-14：「⭐ 唔好另外拄一套」）。
 */
export function PullIndicator({ state }: { state: PullState }) {
  const label = pullLabel(state)
  if (label === null) return null
  return (
    <div
      className={`pull-refresh${state.phase === 'refreshing' ? ' pull-refresh--busy' : ''}`}
      style={{ height: `${Math.round(state.distance)}px` }}
      role="status"
      aria-live="polite"
      data-testid="pull-refresh"
    >
      <span className="pull-refresh__spin" aria-hidden="true" />
      <span className="pull-refresh__label">{label}</span>
    </div>
  )
}

export function BottomNav({ active, nav }: { active: string; nav: Nav }) {
  const item = (key: string, icon: string, label: string, route: Route) => (
    <button
      className={`nav-item ${active === key ? 'active' : ''}`}
      data-testid={`nav-${key}`}
      onClick={() => nav.go(route)}
    >
      <span className="nav-ic">
        <Icon name={icon} />
      </span>
      <span>{label}</span>
      {active === key && <span className="nav-dot" />}
    </button>
  )
  return (
    <nav className="bottom-nav">
      {item('home', ICONS.navHome, '首頁', { name: 'home' })}
      {item('records', ICONS.navProjects, '工程', { name: 'records' })}
      {item('sync', ICONS.navSync, '同步', { name: 'sync' })}
      {item('settings', ICONS.navSettings, '設定', { name: 'settings' })}
    </nav>
  )
}

export function StatCard({
  value,
  label,
  tone,
  onClick,
}: {
  value: number
  label: string
  tone?: 'amber'
  onClick?: () => void
}) {
  const inner = (
    <div className="stat-body">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${tone ? ` ${tone}` : ''}`}>{value}</span>
    </div>
  )
  return onClick ? (
    <button className="stat-card" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="stat-card">{inner}</div>
  )
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-head">
      <span className="row-title">{title}</span>
      {action}
    </div>
  )
}

/**
 * 01–06 用嘅外殼：第一層（統計卡）浮喺波浪頂，其餘內容喺後面捲，
 * 捲上去就喺波浪下面羽化消失。pills 高度用 ResizeObserver 實測寫入 --pill-h，
 * 唔靠每版自己估 padding。
 */
export function FloatBody({
  pills,
  children,
  testid,
  compact,
  onRefresh,
}: {
  pills: ReactNode
  children: ReactNode
  testid?: string
  /**
   * 向下拉刷新。**⛔ 唔傳就完全冇呢件事**（連 touch handler 都唔會掛）。
   * ⚠️ 有未儲存輸入嘅畫面（表單）⛔ 一律唔准傳。
   */
  onRefresh?: () => Promise<unknown>
  /**
   * 冇波浪嘅版本：統計卡唔再浮喺波浪頂，變返捲動層入面第一件嘢。
   * ⛔ 唔使 ResizeObserver 度高度 —— 冇嘢要疊，就冇嘢要度。
   */
  compact?: boolean
}) {
  const pillsRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pull = usePullToRefresh(onRefresh)

  useLayoutEffect(() => {
    const pillsEl = pillsRef.current
    const scrollEl = scrollRef.current
    if (!pillsEl || !scrollEl) return
    const apply = () => scrollEl.style.setProperty('--pill-h', `${pillsEl.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(pillsEl)
    return () => ro.disconnect()
  }, [])

  if (compact) {
    return (
      <div
        className="float-cards-scroll scroll-body scroll-body--compact"
        data-testid={testid}
        {...pull.handlers}
      >
        <PullIndicator state={pull.state} />
        {pills}
        {children}
      </div>
    )
  }

  return (
    <>
      <div ref={scrollRef} className="float-cards-scroll" data-testid={testid} {...pull.handlers}>
        <PullIndicator state={pull.state} />
        {children}
      </div>
      <div ref={pillsRef} className="float-pills-layer">
        {pills}
      </div>
    </>
  )
}

/** 冇浮起統計卡嗰啲版（表單、設定）：第一張卡就係普通捲動子元素。 */
export function ScrollBody({
  children,
  testid,
  compact,
  className,
  onRefresh,
}: {
  children: ReactNode
  testid?: string
  /** 個別畫面自己嘅微調（例如工程列表上內距唔同）。 */
  className?: string
  /** 配 `BotanicalHeader compact` —— 冇波浪就唔使留波浪嗰段位。 */
  compact?: boolean
  /**
   * 向下拉刷新。**⛔ 唔傳就完全冇呢件事**（連 touch handler 都唔會掛）。
   *
   * ⛔⛔ **有未儲存輸入嘅畫面⛔ 一律唔准傳**（Jason 2026-09-13 第 3 條）——
   *    報價表、現場資料表、客戶資料表、樹木表、單價設定。
   *    ⚠️ 嗰啲畫面嘅 state 喺 component 入面，一 reload 就會蓋走人哋打咗嘅字。
   *    ⭐ 唔傳 ＝ 冇路徑，⛔ 唔係靠記得唔好拉。
   */
  onRefresh?: () => Promise<unknown>
}) {
  const pull = usePullToRefresh(onRefresh)
  return (
    <div
      className={`float-cards-scroll scroll-body${compact ? ' scroll-body--compact' : ''}${
        className ? ' ' + className : ''
      }`}
      data-testid={testid}
      {...pull.handlers}
    >
      <PullIndicator state={pull.state} />
      {children}
    </div>
  )
}

export function BackChip({ onClick, label = '返回' }: { onClick: () => void; label?: string }) {
  return <ChipButton icon={ICONS.back} label={label} onClick={onClick} testid="back" />
}
