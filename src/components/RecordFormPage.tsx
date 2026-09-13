import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
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
import ErrorNotice from '../ui/ErrorNotice'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'
import SiteFormFields from './SiteFormFields'
import {
  EMPTY_SITE_FORM_INPUT,
  siteFormToInput,
  validateSiteForm,
  type SiteFormApi,
  type SiteFormErrors,
  type SiteFormInput,
} from '../lib/siteForm'
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
  /** 現場嗰堆格由呢個 API 讀寫。⛔ 同工程本身係兩張表。 */
  siteFormApi: SiteFormApi
  onSave: (input: RecordInput) => Promise<void>
  onArchiveToggle: () => Promise<void>
  onDelete: () => Promise<void>
  onBack: () => void
}

type Busy = 'save' | 'archive' | 'delete' | null

/**
 * 工程資料。版面照原型 stage57 `#screenSite`：
 * 上面一張卡係工程本身（日期、日／夜、名稱、地區、地址、備註），
 * 下面幾張卡係現場（人手、垃圾、機械、起樹頭）。
 *
 * ⚠️ 兩堆嘢寫兩張表（`quote_records` 同 `quote_site_form`），
 *    但用家只見到一粒儲存掣 —— 撳一次，順序寫兩次，
 *    ⛔ 第一次唔成功就停，唔會寫一半。
 *
 * ⚠️ 新增工程嗰陣仲未有 record id，所以現場嗰幾張卡唔會出 ——
 *    建立咗之後入返嚟就見到。⛔ 唔係漏咗。
 *
 * ⛔ 客戶／聯絡人／電話搬咗去「客戶資料」（原型分開兩版），呢度冇咗。
 */
export default function RecordFormPage({
  record,
  siteFormApi,
  onSave,
  onArchiveToggle,
  onDelete,
  onBack,
}: Props) {
  const [input, setInput] = useState<RecordInput>(() =>
    record ? rowToInput(record) : { ...EMPTY_INPUT, record_date: todayIso(new Date()) },
  )
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [site, setSite] = useState<SiteFormInput>(EMPTY_SITE_FORM_INPUT)
  const [siteErrors, setSiteErrors] = useState<SiteFormErrors>({})
  const [siteLoading, setSiteLoading] = useState(record !== null)

  const recordId = record?.id ?? null
  const loadSite = useCallback(() => {
    if (recordId === null) return
    setSiteLoading(true)
    void siteFormApi
      .get(recordId)
      .then((row) => setSite(siteFormToInput(row)))
      // ⛔ 攞唔到現場資料唔可以擋住改工程本身 —— 出返空白就算。
      .catch(() => setSite(EMPTY_SITE_FORM_INPUT))
      .finally(() => setSiteLoading(false))
  }, [siteFormApi, recordId])

  useEffect(loadSite, [loadSite])

  function patchSite(values: Partial<SiteFormInput>) {
    setSite((current) => ({ ...current, ...values }))
    setSiteErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(values) as (keyof SiteFormInput)[]) delete next[key]
      return next
    })
  }

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

    // 現場嗰堆都要驗，⛔ 唔可以工程存咗、現場靜靜哋唔見咗。
    if (record) {
      const siteProblems = validateSiteForm(site)
      if (Object.keys(siteProblems).length > 0) {
        setSiteErrors(siteProblems)
        setError('有欄位未填好，請檢查返下面紅色嗰幾行。')
        return
      }
    }

    setFieldErrors({})
    setSiteErrors({})
    await run('save', async () => {
      // ⭐ 次序：工程本身行先。⛔ 佢唔成功就停 —— 唔會出現「現場存咗、工程冇存」。
      await onSave(input)
      if (record) setSite(siteFormToInput(await siteFormApi.save(record.id, site)))
    })
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
    <>
      <BotanicalHeader
        compact
        left={
          <HeaderTitle
            back={<BackChip onClick={onBack} label="返回" />}
            name={record ? '工程資料' : '新增工程'}
            sub={record ? record.name : '填好之後就可以加樹同現場資料'}
          />
        }
      />

      <ScrollBody testid="record-form-scroll" compact>
        <form className="card" onSubmit={handleSubmit} noValidate>
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

        {/* ⛔ 客戶／聯絡人／電話搬咗去「客戶資料」（原型分兩版）。 */}

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

        {/* ⭐ 自己會拉入畫面。⛔ 唔係普通一行紅字 —— 見 `ErrorNotice` 頂嗰段：
            2026-09-14 真機「撳咗冇反應」，就係因為呢行字出咗喺手指上面 2037px。 */}
        <ErrorNotice message={error} />

        {/* 新增嗰陣仲未有 record id，寫唔到現場資料 —— 建立咗入返嚟就有。 */}
        {record && !siteLoading && (
          <SiteFormFields
            input={site}
            fieldErrors={siteErrors}
            disabled={busy !== null}
            patch={patchSite}
          />
        )}

        <button className="button" type="submit" disabled={busy !== null}>
          {busy === 'save' ? '儲存中…' : record ? '儲存' : '建立工程'}
        </button>
      </form>

      {record && (
        <div className="card danger-zone">
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
      </ScrollBody>
    </>
  )
}
