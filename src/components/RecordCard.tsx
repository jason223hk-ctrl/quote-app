import { clientAddressLine, regionLabel, shiftLabel, statusLabel } from '../lib/labels'
import type { QuoteRecord } from '../lib/records'

/**
 * 工程卡。結構同 class 照 tree-app-v7 `ProjectCard`
 * （.proj-card / .proj-main / .proj-title / .proj-meta / .proj-side），
 * 右邊嗰個進度環換成報價用嘅狀態色點。
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
      <div className="proj-main">
        <div className="proj-title">{record.name}</div>

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
      </div>

      <div className="proj-side">
        <span className={`status status--${record.status}`}>
          <span className="status__dot" aria-hidden="true" />
          {statusLabel(record.status)}
        </span>
        {record.archived && <span className="badge grey">已封存</span>}
      </div>
    </button>
  )
}
