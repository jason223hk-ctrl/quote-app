import { useEffect, useState } from 'react'
import { clientAddressLine, regionLabel, shiftLabel, statusLabel } from '../lib/labels'
import type { QuoteRecord } from '../lib/records'
import type { TreesApi } from '../lib/trees'
import type { Nav } from '../ui/routes'
import { BackChip, BotanicalHeader, FloatBody, HeaderTitle } from '../ui/shell'

type Props = {
  api: TreesApi
  record: QuoteRecord
  nav: Nav
}

/**
 * 03 工程詳情 hub。照 tree-app-v7 `ProjectDetailScreen` 嘅殼：
 * 頂部 stat-band 摘要浮喺波浪頂，下面係入口。
 * 基本資料／樹木清單／現場資料表三個入口全部由呢度入，唔再塞喺表單底。
 */
export default function RecordHubScreen({ api, record, nav }: Props) {
  const [treeCount, setTreeCount] = useState<number | null>(null)

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

  const line = clientAddressLine(record.client, record.address)

  return (
    <>
      <BotanicalHeader
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
        testid="hub-scroll"
        pills={
          <div className="stat-band" data-testid="record-summary">
            <div className="stat-col">
              <span className="stat-label">狀態</span>
              <span className={`status status--${record.status}`}>
                <span className="status__dot" aria-hidden="true" />
                {statusLabel(record.status)}
              </span>
            </div>
            <div className="stat-col">
              <span className="stat-label">樹木</span>
              <span className="stat-value">{treeCount ?? '—'}</span>
            </div>
            <div className="stat-col">
              <span className="stat-label">地區</span>
              <span className="stat-value" style={{ fontSize: 15 }}>
                {regionLabel(record.region)}
              </span>
            </div>
          </div>
        }
      >
        {record.archived && <p className="notice notice--warning">呢單已經封存。</p>}

        <button
          className="hub-row"
          data-testid="hub-basic"
          onClick={() => nav.go({ name: 'record-form', recordId: record.id })}
        >
          <span className="hub-main">
            <span className="hub-title">基本資料</span>
            <span className="hub-sub">日期、日／夜、地址、地區、客戶、聯絡人、電話</span>
          </span>
          <span className="hub-chev" aria-hidden="true">
            ›
          </span>
        </button>

        <button
          className="hub-row"
          data-testid="hub-trees"
          onClick={() => nav.go({ name: 'trees', recordId: record.id })}
        >
          <span className="hub-main">
            <span className="hub-title">樹木清單</span>
            <span className="hub-sub">
              {treeCount === null ? '每棵樹嘅品種、尺寸、處理方法' : `共 ${treeCount} 棵`}
            </span>
          </span>
          <span className="hub-chev" aria-hidden="true">
            ›
          </span>
        </button>

        <button
          className="hub-row"
          data-testid="hub-site-form"
          onClick={() => nav.go({ name: 'site-form', recordId: record.id })}
        >
          <span className="hub-main">
            <span className="hub-title">現場資料表</span>
            <span className="hub-sub">人手、垃圾處理、機械、起樹頭</span>
          </span>
          <span className="hub-chev" aria-hidden="true">
            ›
          </span>
        </button>
      </FloatBody>
    </>
  )
}
