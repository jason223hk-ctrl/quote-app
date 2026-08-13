import { useState, type FormEvent } from 'react'
import { REGION_OPTIONS, SHIFT_OPTIONS, todayIso } from '../lib/labels'
import {
  EMPTY_INPUT,
  rowToInput,
  validateInput,
  type FieldErrors,
  type QuoteRecord,
  type Region,
  type RecordInput,
  type Shift,
} from '../lib/records'

type Props = {
  /** null = 新增；有 record = 編輯 */
  record: QuoteRecord | null
  onSave: (input: RecordInput) => Promise<void>
  onArchiveToggle: () => Promise<void>
  onDelete: () => Promise<void>
  /** 只有已經存低咗嘅單先入得去（要有 record_id） */
  onOpenTrees?: () => void
  onOpenSiteForm?: () => void
  onBack: () => void
}

type Busy = 'save' | 'archive' | 'delete' | null

export default function RecordFormPage({
  record,
  onSave,
  onArchiveToggle,
  onDelete,
  onOpenTrees,
  onOpenSiteForm,
  onBack,
}: Props) {
  const [input, setInput] = useState<RecordInput>(() =>
    record ? rowToInput(record) : { ...EMPTY_INPUT, record_date: todayIso(new Date()) },
  )
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function patch(values: Partial<RecordInput>) {
    setInput((current) => ({ ...current, ...values }))
    // 改咗邊個欄就即刻清返嗰欄嘅提示，唔會一路紅住。
    setFieldErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(values) as (keyof RecordInput)[]) delete next[key]
      return next
    })
  }

  /** 所有寫入行同一條路：鎖住畫面 → 等 server 回覆 → 錯就出訊息，唔會靜靜雞當成功。 */
  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>) {
    setBusy(kind)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setBusy(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // 未填齊就唔好送去 DB，喺欄位下面講清楚爭啲乜。
    const errors = validateInput(input)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('有欄位未填好，請檢查返下面紅色嗰幾行。')
      return
    }

    setFieldErrors({})
    await run('save', () => onSave(input))
  }

  function fieldError(key: keyof RecordInput) {
    const message = fieldErrors[key]
    if (!message) return null
    return (
      <span className="field__error" role="alert">
        {message}
      </span>
    )
  }

  return (
    <section className="card">
      <div className="page-head">
        <button className="link-button" type="button" onClick={onBack} disabled={busy !== null}>
          ← 返清單
        </button>
        <h2 className="card__title">{record ? '編輯報價單' : '新一單'}</h2>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field__label">日期</span>
          <input
            className="field__input"
            type="date"
            value={input.record_date}
            disabled={busy !== null}
            onChange={(event) => patch({ record_date: event.target.value })}
          />
          {fieldError('record_date')}
        </label>

        <label className="field">
          <span className="field__label">個名</span>
          <input
            className="field__input"
            type="text"
            value={input.name}
            disabled={busy !== null}
            onChange={(event) => patch({ name: event.target.value })}
          />
          {fieldError('name')}
        </label>

        <label className="field">
          <span className="field__label">大判</span>
          <input
            className="field__input"
            type="text"
            value={input.main_con}
            disabled={busy !== null}
            onChange={(event) => patch({ main_con: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">地點</span>
          <input
            className="field__input"
            type="text"
            value={input.site}
            disabled={busy !== null}
            onChange={(event) => patch({ site: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">客戶／聯絡人</span>
          <input
            className="field__input"
            type="text"
            value={input.client}
            disabled={busy !== null}
            onChange={(event) => patch({ client: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">地區</span>
          <select
            className="field__input"
            value={input.region}
            disabled={busy !== null}
            onChange={(event) => patch({ region: event.target.value as Region | '' })}
          >
            <option value="">未選</option>
            {REGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldError('region')}
        </label>

        <label className="field">
          <span className="field__label">日／夜更</span>
          <select
            className="field__input"
            value={input.shift}
            disabled={busy !== null}
            onChange={(event) => patch({ shift: event.target.value as Shift | '' })}
          >
            <option value="">未選</option>
            {SHIFT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldError('shift')}
        </label>

        <label className="field">
          <span className="field__label">預計開工</span>
          <input
            className="field__input"
            type="text"
            placeholder="例如：下星期一朝早"
            value={input.start_time}
            disabled={busy !== null}
            onChange={(event) => patch({ start_time: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">Odoo REF#（選填）</span>
          <input
            className="field__input"
            type="text"
            value={input.odoo_ref}
            disabled={busy !== null}
            onChange={(event) => patch({ odoo_ref: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">內部備註</span>
          <textarea
            className="field__input field__input--area"
            rows={4}
            value={input.internal_note}
            disabled={busy !== null}
            onChange={(event) => patch({ internal_note: event.target.value })}
          />
        </label>

        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}

        <button className="button" type="submit" disabled={busy !== null}>
          {busy === 'save' ? '儲存中…' : '儲存'}
        </button>
      </form>

      {record && (onOpenTrees || onOpenSiteForm) && (
        <div className="sub-pages">
          {onOpenTrees && (
            <button
              className="button button--secondary"
              type="button"
              disabled={busy !== null}
              onClick={onOpenTrees}
            >
              樹木清單 →
            </button>
          )}
          {onOpenSiteForm && (
            <button
              className="button button--secondary"
              type="button"
              disabled={busy !== null}
              onClick={onOpenSiteForm}
            >
              現場資料表 →
            </button>
          )}
        </div>
      )}

      {record && (
        <div className="danger-zone">
          <button
            className="button button--secondary"
            type="button"
            disabled={busy !== null}
            onClick={() => run('archive', onArchiveToggle)}
          >
            {busy === 'archive' ? '處理中…' : record.archived ? '取消封存' : '封存'}
          </button>

          {/* 兩段式確認做喺畫面入面，唔用瀏覽器彈窗（手機易撳錯，亦驗唔到）。 */}
          {confirmingDelete ? (
            <>
              <button
                className="button button--danger"
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  run('delete', async () => {
                    await onDelete()
                    setConfirmingDelete(false)
                  })
                }
              >
                {busy === 'delete' ? '處理中…' : '再撳一次確認刪除'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmingDelete(false)}
              >
                取消
              </button>
            </>
          ) : (
            <button
              className="button button--danger"
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirmingDelete(true)}
            >
              刪除
            </button>
          )}

          <p className="danger-zone__note">
            封存同刪除都唔會喺資料庫真刪任何嘢：封存只係喺清單收埋，刪除只係記低刪除時間。
          </p>
        </div>
      )}
    </section>
  )
}
