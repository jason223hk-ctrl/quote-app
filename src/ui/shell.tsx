import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { VERSION_LABEL } from './version'
import type { Nav, Route } from './routes'

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

export function BotanicalHeader({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header className="bheader">
      {/* 波浪係獨立背景層，header 內容永遠唔會被遮罩剪到 */}
      <div className="bheader-bg" />
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
  glyph,
  label,
  onClick,
  testid,
  small,
}: {
  glyph: string
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
      <span aria-hidden="true">{glyph}</span>
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
  return (
    <div className="head-title">
      <div className="head-name-row">
        {back}
        <div className="head-name">{name}</div>
      </div>
      {sub && <div className="head-sub">{sub}</div>}
    </div>
  )
}

export function BottomNav({ active, nav }: { active: string; nav: Nav }) {
  const item = (key: string, glyph: string, label: string, route: Route) => (
    <button
      className={`nav-item ${active === key ? 'active' : ''}`}
      data-testid={`nav-${key}`}
      onClick={() => nav.go(route)}
    >
      <span className="nav-ic" aria-hidden="true">
        {glyph}
      </span>
      <span>{label}</span>
      {active === key && <span className="nav-dot" />}
    </button>
  )
  return (
    <nav className="bottom-nav">
      {item('home', '◆', '首頁', { name: 'home' })}
      {item('records', '▤', '工程', { name: 'records' })}
      {item('settings', '⚙', '設定', { name: 'settings' })}
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
}: {
  pills: ReactNode
  children: ReactNode
  testid?: string
}) {
  const pillsRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  return (
    <>
      <div ref={scrollRef} className="float-cards-scroll" data-testid={testid}>
        {children}
      </div>
      <div ref={pillsRef} className="float-pills-layer">
        {pills}
      </div>
    </>
  )
}

/** 冇浮起統計卡嗰啲版（表單、設定）：第一張卡就係普通捲動子元素。 */
export function ScrollBody({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div className="float-cards-scroll scroll-body" data-testid={testid}>
      {children}
    </div>
  )
}

export function BackChip({ onClick, label = '返回' }: { onClick: () => void; label?: string }) {
  return <ChipButton glyph="‹" label={label} onClick={onClick} testid="back" />
}
