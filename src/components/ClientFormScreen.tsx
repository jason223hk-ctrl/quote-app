import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { rowToInput, type QuoteRecord, type RecordInput } from '../lib/records'
import { clientLabel, matchClients, type ClientsApi, type QuoteClient } from '../lib/clients'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'

type Props = {
  record: QuoteRecord
  clientsApi: ClientsApi
  onSave: (input: RecordInput) => Promise<void>
  onBack: () => void
  /** 去客戶簿加新客戶。⛔ 唔喺呢度加 —— 加咗要即刻見到，行返同一條路最穩陣。 */
  onOpenBook: () => void
}

/**
 * 客戶資料。原型 stage57 `#screenBasic` —— 得三格：客戶、聯絡人、電話。
 *
 * ⚠️ 呢三格本來喺「基本資料」入面，同工程日期地址等等溝埋一齊。
 * 原型分開兩版，所以呢度搬咗出嚟。⛔ 欄位一個都冇加冇減，
 * 寫入行返同一條路（`quote_records`），⛔ 唔係另一張表。
 *
 * ⭐⭐ 「揀客戶」係**複製一份**入呢個工程（原型 `usePickClient()`）——
 *    ⛔ 唔係指去客戶簿嗰筆。所以之後改客戶簿、刪客戶，
 *    ⛔ 都唔會郁到呢單已經填咗嘅嘢。DB 嗰邊亦特登冇 foreign key。
 *
 * ⚠️ 揀完**仲未存**：三格填咗，人仲要撳「儲存」。
 *    ⛔ 唔自動存 —— 呢一版本身就係一版有「儲存」掣嘅表單，
 *    揀完靜靜咁入咗 DB 會同粒掣講緊嘅嘢唔一致。
 */
export default function ClientFormScreen({
  record,
  clientsApi,
  onSave,
  onBack,
  onOpenBook,
}: Props) {
  const [input, setInput] = useState<RecordInput>(() => rowToInput(record))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  /** 揀客戶個彈窗。 */
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  /** null ＝ 攞唔到本簿。⛔ 唔准當佢係「本簿空咗」。 */
  const [book, setBook] = useState<QuoteClient[] | null>(null)
  const [bookError, setBookError] = useState<string | null>(null)

  const loadBook = useCallback(async () => {
    setBookError(null)
    try {
      setBook(await clientsApi.list())
    } catch (caught) {
      setBook(null)
      setBookError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [clientsApi])

  useEffect(() => {
    if (picking) void loadBook()
  }, [picking, loadBook])

  function patch(values: Partial<RecordInput>) {
    setInput((current) => ({ ...current, ...values }))
    setSaved(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(input)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const field = (
    key: 'client' | 'contact' | 'phone',
    label: string,
    type: 'text' | 'tel' = 'text',
  ) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="field__input"
        type={type}
        inputMode={type === 'tel' ? 'tel' : undefined}
        value={input[key]}
        disabled={busy}
        onChange={(event) => patch({ [key]: event.target.value } as Partial<RecordInput>)}
      />
    </label>
  )

  return (
    <>
      <BotanicalHeader
        compact
        left={
          <HeaderTitle
            back={<BackChip onClick={onBack} />}
            name="客戶資料"
            sub={record.name}
          />
        }
      />

      <ScrollBody testid="client-form-scroll" compact>
        <form className="card" onSubmit={handleSubmit} noValidate>
          <button
            className="button button--secondary"
            type="button"
            data-testid="pick-client"
            disabled={busy}
            onClick={() => setPicking(true)}
          >
            由客戶簿選擇
          </button>

          {field('client', '客戶')}
          {field('contact', '聯絡人')}
          {field('phone', '電話', 'tel')}

          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}

          {saved && !error && (
            <p className="notice notice--ok" role="status">
              已經存好。
            </p>
          )}

          <button className="button" type="submit" disabled={busy}>
            {busy ? '儲存中…' : '儲存'}
          </button>
        </form>
      </ScrollBody>

      {picking && (
        <div className="search-overlay" onClick={() => setPicking(false)}>
          <div className="popover" data-testid="client-picker" onClick={(e) => e.stopPropagation()}>
            <h3>搜尋 · 客戶</h3>

            <input
              className="field__input"
              type="search"
              aria-label="輸入客戶、聯絡人或電話"
              placeholder="輸入客戶、聯絡人或電話"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            {bookError !== null && (
              <p className="notice notice--error" role="alert">
                {bookError}{' '}
                <button className="link-button" type="button" onClick={() => void loadBook()}>
                  再試一次
                </button>
              </p>
            )}

            {book === null && bookError === null && <p className="loading">載入中⋯</p>}

            {book !== null && (
              <div className="cbscroll">
                {matchClients(book, query).length === 0 ? (
                  <div className="muted empty">
                    {book.length === 0 ? '客戶簿未有記錄' : '沒有符合的客戶'}
                  </div>
                ) : (
                  matchClients(book, query).map((one) => (
                    <button
                      key={one.id}
                      className="cbrow"
                      type="button"
                      data-testid="client-pick-row"
                      onClick={() => {
                        // ⛔ 複製一份，⛔ 唔係指過去。
                        patch({ client: one.client, contact: one.contact, phone: one.phone })
                        setPicking(false)
                      }}
                    >
                      <b>{one.client.trim() === '' ? '（未填客戶）' : one.client}</b>
                      <small>{clientLabel({ ...one, client: '' }) || '—'}</small>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="popover-actions">
              <button className="ghost" type="button" onClick={() => setPicking(false)}>
                關閉
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => {
                  setPicking(false)
                  onOpenBook()
                }}
              >
                去客戶簿新增
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
