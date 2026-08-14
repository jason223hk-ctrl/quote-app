import { useRef, useState, type FormEvent } from 'react'
import { REGION_OPTIONS, SHIFT_OPTIONS, todayIso } from '../lib/labels'
import {
  coordsKey,
  getCurrentCoords,
  OSM_ATTRIBUTION,
  REGION_UNKNOWN_MESSAGE,
  REVERSE_FAILED_MESSAGE,
  reverseGeocode,
  type ReverseResult,
} from '../lib/geo'
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

  const [locating, setLocating] = useState(false)
  const [gpsMessage, setGpsMessage] = useState<string | null>(null)
  /** 同一組座標唔重複查 Nominatim（佢哋條款要求唔好連環發請求）。 */
  const lastReverse = useRef<{ key: string; result: ReverseResult } | null>(null)

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

  /**
   * 撳掣先發一次請求：冇 debounce、冇 autocomplete、冇連環快發。
   * 全程唔會 block 儲存——攞唔到定位一樣打得字、儲存得。
   */
  async function handleLocate() {
    setLocating(true)
    setGpsMessage(null)

    let coords
    try {
      coords = await getCurrentCoords()
    } catch (caught) {
      setGpsMessage(caught instanceof Error ? caught.message : String(caught))
      setLocating(false)
      return
    }

    // 座標一攞到就即刻記低，就算跟住反查失敗都唔會掉咗。
    patch({ gps_lat: coords.lat, gps_lng: coords.lng, gps_at: coords.at })

    const key = coordsKey(coords.lat, coords.lng)
    try {
      const cached = lastReverse.current
      const result = cached?.key === key ? cached.result : await reverseGeocode(coords.lat, coords.lng)
      lastReverse.current = { key, result }

      if (result.address) {
        patch({ address: result.address, address_source: 'gps' })
      }
      if (result.region) {
        patch({ region: result.region, region_source: 'gps' })
      }

      if (!result.address) {
        setGpsMessage(REVERSE_FAILED_MESSAGE)
      } else if (!result.region) {
        // 地區直接影響夾車同吊機價，認唔到就一定要用家自己揀，唔可以估。
        setGpsMessage(REGION_UNKNOWN_MESSAGE)
      }
    } catch (caught) {
      console.error('[quote-app] reverse geocode failed:', caught)
      setGpsMessage(REVERSE_FAILED_MESSAGE)
    } finally {
      setLocating(false)
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
        <h2 className="card__title">{record ? '編輯工程' : '新增工程'}</h2>
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
          <span className="field__label">日／夜工作</span>
          <select
            className="field__input"
            value={input.shift}
            disabled={busy !== null}
            onChange={(event) => patch({ shift: event.target.value as Shift })}
          >
            {SHIFT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">工程名稱</span>
          <input
            className="field__input"
            type="text"
            value={input.name}
            disabled={busy !== null}
            onChange={(event) => patch({ name: event.target.value })}
          />
          {fieldError('name')}
        </label>

        <div className="field">
          <span className="field__label">地址</span>
          <div className="field__with-action">
            <input
              className="field__input"
              type="text"
              aria-label="地址"
              value={input.address}
              disabled={busy !== null}
              // 用家一改地址，來源即刻變返 manual。
              onChange={(event) => patch({ address: event.target.value, address_source: 'manual' })}
            />
            <button
              className="button button--secondary button--inline"
              type="button"
              disabled={busy !== null || locating}
              onClick={handleLocate}
            >
              {locating ? '定位中…' : '用 GPS 定位'}
            </button>
          </div>
          {input.address_source === 'gps' && (
            <span className="field__hint">由 GPS 自動填，請確認</span>
          )}
          {fieldError('address')}
          {gpsMessage && (
            <span className="field__warning" role="status">
              {gpsMessage}
            </span>
          )}
          {input.gps_lat !== null && input.gps_lng !== null && (
            <span className="field__hint">
              已記低座標：{input.gps_lat.toFixed(5)}, {input.gps_lng.toFixed(5)}
            </span>
          )}
          <span className="field__hint">{OSM_ATTRIBUTION}</span>
        </div>

        <label className="field">
          <span className="field__label">地區</span>
          <select
            className="field__input"
            value={input.region}
            disabled={busy !== null}
            // 用家一改地區，來源即刻變返 manual。
            onChange={(event) =>
              patch({ region: event.target.value as Region | '', region_source: 'manual' })
            }
          >
            <option value="">未選</option>
            {REGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {input.region_source === 'gps' && (
            <span className="field__hint">由 GPS 自動填，請確認</span>
          )}
          {fieldError('region')}
        </label>

        <label className="field">
          <span className="field__label">客戶</span>
          <input
            className="field__input"
            type="text"
            value={input.client}
            disabled={busy !== null}
            onChange={(event) => patch({ client: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">聯絡人</span>
          <input
            className="field__input"
            type="text"
            value={input.contact}
            disabled={busy !== null}
            onChange={(event) => patch({ contact: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">電話</span>
          <input
            className="field__input"
            type="tel"
            inputMode="tel"
            value={input.phone}
            disabled={busy !== null}
            onChange={(event) => patch({ phone: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">其他備註</span>
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
