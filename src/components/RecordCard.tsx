import { clientAddressLine, regionLabel, shiftLabel, statusLabel } from '../lib/labels'
import type { QuoteRecord } from '../lib/records'

/**
 * 工程卡。版面照已批准嘅原型 stage57 `.pcard`：
 * 上面一行係「名稱 ＋ 狀態膠囊」，下面兩行係日期／地區／更同客戶／地址。
 *
 * ⚠️ 狀態膠囊一定要同名稱**同一行**（原型 `.pcard .top`）——
 * 分開兩個直行嘅話，卡高過內容嗰陣個膠囊會浮咗喺半空，對唔正個名。
 */
export default function RecordCard({
  record,
  onOpen,
}: {
  record: QuoteRecord
  onOpen: () => void
}) {
  const line = clientAddressLine(record.client, record.address)

  return (
    <button className="proj-card" data-testid="record-row" onClick={onOpen}>
      <div className="proj-top">
        <div className="proj-title">{record.name}</div>

        <div className="proj-side">
          <span className={`status status--${record.status}`}>
            <span className="status__dot" aria-hidden="true" />
            {statusLabel(record.status)}
          </span>
          {record.archived && <span className="badge grey">已封存</span>}
        </div>
      </div>

      <div className="proj-meta">
        <span className="meta-item">{record.record_date}</span>
        <span className="meta-divider" />
        <span className="meta-item">{regionLabel(record.region)}</span>
        <span className="meta-divider" />
        <span className="meta-item">{shiftLabel(record.shift)}</span>
      </div>

      {line !== '' && (
        <div className="proj-meta">
          <span className="meta-item wrap">{line}</span>
        </div>
      )}
    </button>
  )
}
