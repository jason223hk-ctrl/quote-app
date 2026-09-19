import { useCallback, useEffect, useState } from 'react'
import { clientAddressLine, regionLabel, shiftLabel, statusLabel } from '../lib/labels'
import type { QuoteRecord, QuoteStatus } from '../lib/records'
import type { TreesApi } from '../lib/trees'
import type { SiteFormApi, SiteForm } from '../lib/siteForm'
import type { PriceApi, PriceTable, PriceSnapshot } from '../lib/prices'
import type { PhotosApi } from '../lib/photos'
import { markupSaveFailed, markupToSave } from '../lib/markup'
import { quoteLines, type Quote, type PricingInput } from '../lib/pricing'
import type { Nav } from '../ui/routes'
import { BackChip, BotanicalHeader, FloatBody, HeaderTitle } from '../ui/shell'
import ErrorNotice from '../ui/ErrorNotice'
import { Icon, ICONS } from '../ui/Icon'
import CostCard from './CostCard'
import DeleteRecordDialog from './DeleteRecordDialog'
import StatusCard from './StatusCard'
import type { SwipeDeleteProps } from './RecordCard'

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
  /**
   * 右上角粒垃圾桶。**⛔ 唔傳就冇粒掣**（對數個殼、桌面嗰啲情況）。
   *
   * ⭐⭐ **⛔ 同工程清單推開張卡嗰粒係同一個 object、同一個 `DeleteRecordDialog`。**
   *    ⚠️ ⛔ 唔准喺呢度另外寫一套確認：同一套字、同一個「連帶消失：N 棵樹、N 張相」、
   *    同一條「數唔到就撳唔落」。兩套文案就等於有一套冇人睇住。
   */
  swipeDelete?: SwipeDeleteProps
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
  swipeDelete,
  nav,
}: Props) {
  const [treeCount, setTreeCount] = useState<number | null>(null)
  /** null ＝ 未影過（或者數唔到）。⛔ 數唔到唔可以扮 0。 */
  const [envCount, setEnvCount] = useState<number | null>(null)
  const [quote, setQuote] = useState<Quote>(EMPTY_QUOTE)
  const [costLoading, setCostLoading] = useState(true)
  const [statusBusy, setStatusBusy] = useState(false)
  /** 撳咗右上角粒垃圾桶，等緊確認。 */
  const [asking, setAsking] = useState(false)
  /**
   * 加成 ％ 存唔到嗰句。**⛔ `null` ＝ 冇事。**
   *
   * ⛔⛔ 呢格係全 app **唯一一格冇儲存掣、打一個字存一次**嘅嘢，
   *    ⚠️ 而佢一直**存唔到都完全冇聲**（實測：兩次 unhandled rejection、
   *    畫面一個字都冇）。⇒ 同 PR #17「撳咗冇反應」係同一條。
   */
  const [markupError, setMarkupError] = useState<string | null>(null)
  /*
   * ⛔⛔ 轉狀態失敗嗰句。⚠️ 2026-09-19 之前**根本冇呢個 state** ——
   *    即係話伺服器拒絕嗰陣，畫面**一隻字都冇**。
   */
  const [statusError, setStatusError] = useState<string | null>(null)
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
      // ⛔ 打錯字唔好寫落 DB（`undefined` ＝ 乜都唔好做），畫面照樣顯示佢打咗嘅嘢。
      const next = markupToSave(value)
      if (next === undefined) return

      /**
       * ⛔⛔ **一定要接住** —— ⚠️ 舊寫法係 `void onMarkupSave(n)`，
       *    存唔到就變咗一個 unhandled rejection，**畫面一個字都冇**。
       * ⭐ 出返伺服器嗰句原因（`refusalReason()` 三句入面啱嗰一句），
       *    ⛔ 唔准食咗佢換一句通用嘢。
       * ⚠️ `ErrorNotice` 見到同一句嘢⛔ 唔會再捲一次，
       *    所以一路打字一路失敗⛔ 唔會不停抢畫面。
       */
      void onMarkupSave(next)
        .then(() => setMarkupError(null))
        .catch((caught: unknown) => {
          console.error('[quote-app] markup save failed:', caught)
          setMarkupError(
            markupSaveFailed(caught instanceof Error ? caught.message : String(caught)),
          )
        })
    },
    [onMarkupSave],
  )

  const line = clientAddressLine(record.client, record.address)
  /*
   * ⚠️ 2026-09-17：本來呢度算一個 `markupPct` 餵落 `CostCard`。**拆咗。**
   * ⭐ `CostCard` 而家自己由 `markupInput`（人打咗乜）算 —— **一個來源。**
   * ⛔ 點解要拆：`markupToPct()` 對「**空格**」同「**打咗 `abc`**」
   *    **兩樣都回 `null`** ⇒ 落到 `CostCard` 就**分唔開**，
   *    而兩樣嘅答案完全相反（一個照出成本價，一個⛔ 唔出價）。
   *    見 `src/lib/markup.ts` 個 `askingState()`。
   */

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
        right={
          /**
           * ⭐⭐ **工程詳情頁嘅刪除入口**（Jason 2026-09-15：「加多個垃圾桶係呢頁既右上角」）。
           *
           * ⭐ 佢同時解決咗一個實際問題：**桌面冇得推卡**，拆咗 danger zone 之後
           *    冇咗呢粒掣就桌面刪唔到嘢。
           *
           * ⛔⛔ **44×44**（`.head-trash`）—— ⚠️ 旁邊粒返回掣係 34×34，
           *    嗰個係舊嘢、⛔ 呢個 PR 唔郁（郁佢會推歪每一版嘅 header，
           *    而 `ui:check` 嗰 90 項對數就係量緊呢啲位）。已知，寫咗落 PR。
           * ⛔ 一定要有中文 `aria-label`，⛔ 唔可以淨係一個圖。
           */
          swipeDelete === undefined ? undefined : (
            <button
              className="head-trash"
              type="button"
              aria-label={`刪除 ${record.name}`}
              data-testid="hub-delete"
              onClick={() => setAsking(true)}
            >
              <Icon name={ICONS.del} />
            </button>
          )
        }
      />

      {asking && swipeDelete !== undefined && (
        <DeleteRecordDialog
          record={record}
          apis={swipeDelete.apis}
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            await swipeDelete.run(record)
            // ⛔ 刪完一定要離開呢版 —— ⚠️ 單嘢已經冇咗，留喺度就係望住一版
            //    再撳落去乜都唔會 work 嘅嘢。（推卡嗰邊啱啱相反：人本來就喺清單。）
            setAsking(false)
            nav.go({ name: 'records' })
          }}
        />
      )}

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
        {/* ⛔⛔ 轉狀態卡擺**最頂**，⛔ 唔准搬落去 —— 呢個係 2026-09-17 Jason 撳過原型之後
            拍板嘅（丙）。⚠️ 而佢贏嘅理由⛔ 唔係「撳咗有反應」，係**根本唔使撳**。

            ⭐⭐ **點解要釘死 —— ⛔ 唔准淨係記住結論**

            佢本來擺喺「匯出 PDF」之後（即係五行入口之後）。實測：
                三粒狀態 chip 個頂喺 761px，而底部 nav 個頂喺 642px
                ⇒ **褪咗 119px 喺 nav 後面** —— 一開個工程頁根本見唔到。

            ⚠️ Jason 當日嗰句「我撳狀態冇反應」就係由呢度嚟：佢見到嘅係
               上面三粒**唔係掣**嘅頂格（狀態／樹木／地區），真嘅掣喺底下睇唔到。

            ⇒ 所以 `ui:check` 有一把 `firstSight` 尺量住：scrollTop 0、⛔ 冇撳過
              任何嘢嗰陣，張卡同三粒 chip 要完整見到，而且⛔ 唔准褪落 nav 後面。
              搬返落去 ⇒ 把尺會紅，而且數得出褪咗幾多 px。 */}
        <StatusCard
          record={record}
          canSetWon={canSetWon}
          busy={statusBusy}
          onChange={(to, snapshot) => {
            setStatusBusy(true)
            /*
             * ⛔⛔ **一定要接住。**
             *
             * ⚠️ 舊寫法係 `void onStatusChange(to, snapshot).finally(…)` ——
             *    `.finally()` 淨係熄返個 busy，**⛔ 佢⛔ 唔會處理拒絕**。
             *    ⇒ 撳落去：「改緊⋯」閃一閃 → promise reject → 冇人接
             *      → **畫面回復原狀，⛔ 冇字、⛔ 冇紅、⛔ 冇 chip 著**。
             *    ⭐ 2026-09-19 Jason 真機報「狀態撳唔到」就係呢個。
             *
             * ⚠️⚠️ 呢條係**同一條字第二次出事** —— 上面加成嗰格
             *    （`onMarkupSave`）本來一模一樣，修咗；⛔ 但冇人掃返其餘嗰啲。
             *    ⭐ 一次係巧合，兩次係圖案。
             *
             * ⛔ `void` 喺呢個 repo 由今日起等於「我保證呢條 promise 唔會 reject」——
             *    `no-floating-promises` 本來嘈得到，`void` 就係叫佢收聲。
             *    ⇒ 證唔到就⛔ 唔准用 `void`。
             */
            void onStatusChange(to, snapshot)
              .then(() => setStatusError(null))
              .catch((caught: unknown) => {
                // ⛔ 英文原文照樣入 console（CLAUDE.md §2.7）。
                console.error('[quote-app] status change failed:', caught)
                setStatusError(caught instanceof Error ? caught.message : String(caught))
              })
              .finally(() => setStatusBusy(false))
          }}
        />

        {/*
          ⛔⛔ 呢句一定要**貼住張卡**，⛔ 唔准擺落版尾。
          ⚠️ 我第一版擺咗喺加成錯誤隔籬（成版落底四百幾 px）——
             撳咗頂部粒 chip、句錯出咗喺畫面外面，**同冇出冇分別**。
          ⭐ 同「訊息睇得到」嗰把尺同一個道理：出咗字 ⛔ 唔等於見到。
          `inline` ⇒ ⛔ 唔搶 focus（同加成嗰句同一個做法）。
        */}
        <ErrorNotice message={statusError} testId="status-error" inline />

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

        {/* ⛔ 淨係存唔到先出，平時⛔ 一個 pixel 都冇加。⭐ 用返已批准嗰行紅字。
            ⛔⛔ `inline` 缺唔得：呢格係一路打字一路存，唔開就會搶咗輸入格個
            focus，下一個掣打咗落紅字度（把尺 2026-09-16 即刻捉到）。 */}
        <ErrorNotice message={markupError} testId="markup-error" inline />

        <CostCard
          quote={quote}
          typedMarkup={markupInput}
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
