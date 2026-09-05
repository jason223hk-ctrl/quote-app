import { useCallback, useEffect, useState } from 'react'
import { clientAddressLine, regionLabel, shiftLabel, statusLabel } from '../lib/labels'
import type { QuoteRecord, QuoteStatus } from '../lib/records'
import type { TreesApi } from '../lib/trees'
import type { SiteFormApi, SiteForm } from '../lib/siteForm'
import type { PriceApi, PriceTable, PriceSnapshot } from '../lib/prices'
import type { PhotosApi } from '../lib/photos'
import { quoteLines, type Quote, type PricingInput } from '../lib/pricing'
import type { Nav } from '../ui/routes'
import { BackChip, BotanicalHeader, FloatBody, HeaderTitle } from '../ui/shell'
import { Icon, ICONS } from '../ui/Icon'
import CostCard from './CostCard'
import StatusCard from './StatusCard'

type Props = {
  api: TreesApi
  photosApi: PhotosApi
  siteFormApi: SiteFormApi
  priceApi: PriceApi
  record: QuoteRecord
  /** 加成％ 淨係辦公室改得。⛔ 唔准收埋，要見到但改唔到。 */
  canEditMarkup: boolean
  onMarkupSave: (pct: number | null) => Promise<unknown>
  /** 「已中標」淨係辦公室撳得（`docs/交接-CO.md`）。 */
  canSetWon: boolean
  /** `snapshot` ＝ true 就要順手影低而家嗰份單價表先寫落去。 */
  onStatusChange: (to: QuoteStatus, snapshot: boolean) => Promise<unknown>
  nav: Nav
}

const EMPTY_QUOTE: Quote = { lines: [], ask: [], total: 0 }

/**
 * 03 工程詳情 hub。照 tree-app-v7 `ProjectDetailScreen` 嘅殼：
 * 頂部 stat-band 摘要浮喺波浪頂，下面係入口。
 * 基本資料／樹木清單／現場資料表三個入口全部由呢度入，唔再塞喺表單底。
 *
 * 2026-09-01 加咗成本卡：現場資料表填咗嘢就即刻計到成本同報價價錢。
 */
export default function RecordHubScreen({
  api,
  photosApi,
  siteFormApi,
  priceApi,
  record,
  canEditMarkup,
  onMarkupSave,
  canSetWon,
  onStatusChange,
  nav,
}: Props) {
  const [treeCount, setTreeCount] = useState<number | null>(null)
  /** null ＝ 未影過（或者數唔到）。⛔ 數唔到唔可以扮 0。 */
  const [envCount, setEnvCount] = useState<number | null>(null)
  const [quote, setQuote] = useState<Quote>(EMPTY_QUOTE)
  const [costLoading, setCostLoading] = useState(true)
  const [statusBusy, setStatusBusy] = useState(false)
  const [markupInput, setMarkupInput] = useState<string>(
    record.markup_pct === null ? '' : String(record.markup_pct),
  )

  useEffect(() => {
    let active = true
    void api
      .list(record.id)
      .then((trees) => {
        if (active) setTreeCount(trees.length)
      })
      .catch(() => {
        // 數唔到就唔顯示數字，唔好因為一個副標題而擋住成版。
        if (active) setTreeCount(null)
      })
    return () => {
      active = false
    }
  }, [api, record.id])

  useEffect(() => {
    let active = true
    void photosApi
      .listByRecord(record.id)
      // 環境相 ＝ 冇樹嗰啲。⛔ 唔可以連樹相一齊數。
      .then((rows) => {
        if (!active) return
        const n = rows.filter((row) => row.tree_id === null).length
        setEnvCount(n === 0 ? null : n)
      })
      .catch(() => {
        if (active) setEnvCount(null)
      })
    return () => {
      active = false
    }
  }, [photosApi, record.id])

  // 成本：要現場資料表 ＋ 單價表兩樣先計到。
  useEffect(() => {
    let active = true
    setCostLoading(true)

    void Promise.all([siteFormApi.get(record.id), priceApi.list()])
      .then(([form, prices]) => {
        if (!active) return
        setQuote(computeQuote(record, form, prices))
      })
      .catch(() => {
        // ⛔ 計唔到就唔好扮計到 —— 出返空白，唔准出一個假嘅 $0。
        if (active) setQuote(EMPTY_QUOTE)
      })
      .finally(() => {
        if (active) setCostLoading(false)
      })

    return () => {
      active = false
    }
  }, [siteFormApi, priceApi, record])

  const onMarkupChange = useCallback(
    (value: string) => {
      setMarkupInput(value)
      const trimmed = value.trim()
      if (trimmed === '') {
        void onMarkupSave(null)
        return
      }
      const n = Number(trimmed)
      // ⛔ 打錯字唔好寫落 DB，畫面照樣顯示佢打咗嘅嘢。
      if (!Number.isFinite(n) || n < 0) return
      void onMarkupSave(n)
    },
    [onMarkupSave],
  )

  const line = clientAddressLine(record.client, record.address)
  const markupPct = markupInput.trim() === '' ? null : Number(markupInput)

  return (
    <>
      <BotanicalHeader
        compact="project"
        left={
          <HeaderTitle
            back={<BackChip onClick={() => nav.go({ name: 'records' })} />}
            name={record.name}
            sub={
              <>
                <div className="head-sub-line">
                  {record.record_date} · {regionLabel(record.region)} · {shiftLabel(record.shift)}
                </div>
                {line !== '' && <div className="head-sub-line">{line}</div>}
              </>
            }
          />
        }
      />

      <FloatBody
        compact
        testid="hub-scroll"
        pills={
          <div className="stats stats--project" data-testid="record-summary">
            <div className="stat">
              <span className="sic">
                <Icon name={ICONS.statusQuote} />
              </span>
              <span className="k">狀態</span>
              <span className="v v--sm">{statusLabel(record.status)}</span>
            </div>
            <div className="stat">
              <span className="sic">
                <Icon name={ICONS.treeCount} />
              </span>
              <span className="k">樹木</span>
              <span className="v">{treeCount ?? '—'}</span>
            </div>
            <div className="stat">
              <span className="sic">
                <Icon name={ICONS.districtPin} />
              </span>
              <span className="k">地區</span>
              <span className="v v--sm">{regionLabel(record.region)}</span>
            </div>
          </div>
        }
      >
        {record.archived && <p className="notice notice--warning">呢單已經封存。</p>}

        <button
          className="hub-row"
          data-testid="hub-client"
          onClick={() => nav.go({ name: 'client-form', recordId: record.id })}
        >
          <span className="hub-ic">
            <Icon name={ICONS.customer} />
          </span>
          <span className="hub-main">
            <span className="hub-title">客戶資料</span>
            <span className="hub-sub">客戶、聯絡人、電話</span>
          </span>
          <span className="hub-chev">
            <Icon name={ICONS.chevron} />
          </span>
        </button>


        <button
          className="hub-row"
          data-testid="hub-record-form"
          onClick={() => nav.go({ name: 'record-form', recordId: record.id })}
        >
          <span className="hub-ic">
            <Icon name={ICONS.projectInfo} />
          </span>
          <span className="hub-main">
            <span className="hub-title">工程資料</span>
            <span className="hub-sub">日期、日／夜、地址、地區、人手、垃圾、機械、起樹頭</span>
          </span>
          <span className="hub-chev">
            <Icon name={ICONS.chevron} />
          </span>
        </button>

        <button
          className="hub-row"
          data-testid="hub-trees"
          onClick={() => nav.go({ name: 'trees', recordId: record.id })}
        >
          <span className="hub-ic">
            <Icon name={ICONS.treeList} />
          </span>
          <span className="hub-main">
            <span className="hub-title">樹木清單</span>
            <span className="hub-sub">
              {treeCount === null ? '每棵樹嘅品種、尺寸、處理方法' : `共 ${treeCount} 棵`}
            </span>
          </span>
          <span className="hub-chev">
            <Icon name={ICONS.chevron} />
          </span>
        </button>

        <button
          className="hub-row"
          data-testid="hub-env"
          onClick={() => nav.go({ name: 'env-photos', recordId: record.id })}
        >
          <span className="hub-ic">
            <Icon name={ICONS.envCamera} />
          </span>
          <span className="hub-main">
            <span className="hub-title">環境相</span>
            <span className="hub-sub">{envCount === null ? '尚未拍攝' : `${envCount} 張`}</span>
          </span>
          <span className="hub-chev">
            <Icon name={ICONS.chevron} />
          </span>
        </button>

        <button
          className="hub-row"
          data-testid="hub-export"
          onClick={() => nav.go({ name: 'export-pdf', recordId: record.id })}
        >
          <span className="hub-ic">
            <Icon name={ICONS.exportPdf} />
          </span>
          <span className="hub-main">
            <span className="hub-title">匯出 PDF</span>
            {/* ⛔ 唔寫「報價單」—— 呢份 PDF 由頭到尾冇一個價錢（成本／收客價永遠唔上 PDF）。 */}
            <span className="hub-sub">相片報告。⛔ 環境相唔會入</span>
          </span>
          <span className="hub-chev">
            <Icon name={ICONS.chevron} />
          </span>
        </button>

        <StatusCard
          record={record}
          canSetWon={canSetWon}
          busy={statusBusy}
          onChange={(to, snapshot) => {
            setStatusBusy(true)
            void onStatusChange(to, snapshot).finally(() => setStatusBusy(false))
          }}
        />

        <CostCard
          quote={quote}
          markupPct={markupPct}
          canEditMarkup={canEditMarkup}
          onMarkupChange={onMarkupChange}
          loading={costLoading}
        />
      </FloatBody>
    </>
  )
}

/** 由一單嘅資料砌計價輸入。抽出嚟係為咗令上面個 effect 讀得明。 */
function computeQuote(
  record: QuoteRecord,
  form: SiteForm | null,
  prices: PriceTable,
): Quote {
  if (!form) return EMPTY_QUOTE

  const input: PricingInput = {
    workDays: form.work_days,
    crewTotal: form.crew_total,
    climbersPerDay: form.climbers_per_day,
    wasteOptions: form.waste_options ?? [],
    wasteT24Qty: form.waste_t24_qty,
    wasteT30Qty: form.waste_t30_qty,
    machineOptions: form.machine_options ?? [],
    stumpOptions: form.stump_options ?? [],
    region: record.region,
    shift: record.shift,
  }

  // 已報價／已中標用當日嗰份快照；待報價用現價。
  const snapshot = (record.price_snapshot ?? null) as PriceSnapshot | null
  return quoteLines(input, prices, snapshot, record.status)
}
