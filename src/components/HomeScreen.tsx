import { useMemo } from 'react'
import { EMPTY_FILTERS, filterRecords } from '../lib/filters'
import type { QuoteRecord } from '../lib/records'
import type { Nav } from '../ui/routes'
import { PullIndicator } from '../ui/shell'
import { usePullToRefresh } from '../ui/usePullToRefresh'
import { Icon, ICONS } from '../ui/Icon'
import brandMark from '../assets/brand-lockup.png'
import RecordCard from './RecordCard'

type Props = {
  records: QuoteRecord[]
  loading: boolean
  nav: Nav
  /** 向下拉刷新。⛔ 唔傳就冇下拉（同 `ScrollBody` 同一套規矩）。 */
  onRefresh?: () => Promise<unknown>
  /** 向左推刪除。⛔ 唔傳就冇推（見 `RecordCard`）。 */
  onDeleteRecord?: (record: QuoteRecord) => Promise<void>
}

/**
 * 01 首頁。版面照已批准嘅原型 `stage57-autoupload.html` `#screenHome`。
 *
 * ⛔ 冇波浪 header、⛔ 冇 user pill、⛔ 冇版本號 —— 原型首頁一樣都冇，
 *    最頂就係品牌字，主角係下面三個數同待報價清單。
 *    （帳號同版本號喺「設定」入面照樣睇得返，⛔ 冇整走。）
 *
 * ⚠️ 原型嗰句「你好，Jason」同「今日有 N 個工程待報價」喺 stage57 度係
 *    `display:none` —— 即係最後決定咗唔出。⛔ 所以呢度都唔做，唔係漏咗。
 */
export default function HomeScreen({ records, loading, nav, onRefresh, onDeleteRecord }: Props) {
  /**
   * ⚠️⚠️ 首頁**唔用 `ScrollBody`**，⛔ 唔係懶。
   *
   * 2026-09-14 試過將 `<main className="hmain">` 換成 `ScrollBody` ——
   * **`ui:check` 照樣 90 項 / 對唔上 0 項**，但實測用 `elementFromPoint` 打過：
   * ⛔⛔ **「待報價」嗰粒數字卡撳唔到** —— `.float-cards-scroll` 帶住
   * `position:absolute; inset:0`，成個捲動區蓋咗上面三個數同品牌字。
   *
   * ⭐ 即係話：**對數量嘅係位置，⛔ 唔量撳唔撳得到。** 綠燈唔等於冇壞。
   *
   * ⇒ 所以呢度改為**用返共用嗰個 hook 同共用嗰個指示器**，
   *   ⛔ 唔郁容器、⛔ 亦冇另外砌一套下拉邏輯。
   */
  const pull = usePullToRefresh(onRefresh)
  const live = useMemo(() => filterRecords(records, EMPTY_FILTERS), [records])

  const counts = useMemo(
    () => ({
      pending: live.filter((r) => r.status === 'pending').length,
      quoted: live.filter((r) => r.status === 'quoted').length,
      won: live.filter((r) => r.status === 'won').length,
    }),
    [live],
  )

  // 首頁淨係出待報價 —— 原型個標題就係「待報價工程」，⛔ 唔係「最近工程」。
  const pending = useMemo(() => live.filter((r) => r.status === 'pending'), [live])

  const goRecords = () => nav.go({ name: 'records' })

  return (
    <>
      <section className="hhero">
        <div className="hbrand">
          <img className="hmark" src={brandMark} alt="森伝報價 SYLVAN QUOTATION" />
        </div>
      </section>

      <div className="stats hstats" data-testid="home-stats">
        <button className="stat" onClick={goRecords} data-testid="stat-pending">
          <span className="sic">
            <Icon name={ICONS.statusPending} />
          </span>
          <span className="k">待報價</span>
          <span className="v gold">{counts.pending}</span>
        </button>
        <button className="stat" onClick={goRecords} data-testid="stat-quoted">
          <span className="sic">
            <Icon name={ICONS.statusQuoted} />
          </span>
          <span className="k">已報價</span>
          <span className="v">{counts.quoted}</span>
        </button>
        <button className="stat" onClick={goRecords} data-testid="stat-won">
          <span className="sic">
            <Icon name={ICONS.statusWon} />
          </span>
          <span className="k">已中標</span>
          <span className="v">{counts.won}</span>
        </button>
      </div>

      <main className="hmain" data-testid="home-scroll" {...pull.handlers}>
        <PullIndicator state={pull.state} />

        <div className="sect">
          <h3>待報價工程</h3>
          <button className="link sect-more" onClick={goRecords}>
            查看全部
            <Icon name={ICONS.chevron} className="chev" />
          </button>
        </div>

        {loading && <div className="muted empty">載入中…</div>}

        <ul className="list" data-testid="home-list">
          {pending.map((record) => (
            <li key={record.id}>
              <RecordCard
                record={record}
                onOpen={() => nav.go({ name: 'record', recordId: record.id })}
                onDelete={onDeleteRecord}
              />
            </li>
          ))}
        </ul>

        {!loading && pending.length === 0 && <div className="muted empty">冇工程待報價</div>}
      </main>

      {/* ⭐ 圓形 FAB（原型 58px）。⛔ 唔係工程列表嗰個長條掣 —— 嗰版下一輪先改。 */}
      <button
        className="fab fab--round"
        data-testid="home-add"
        aria-label="加工程"
        onClick={() => nav.go({ name: 'record-form', recordId: null })}
      >
        <Icon name={ICONS.add} />
      </button>
    </>
  )
}
