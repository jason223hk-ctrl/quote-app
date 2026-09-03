import { useState, type FormEvent } from 'react'
import { rowToInput, type QuoteRecord, type RecordInput } from '../lib/records'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'

type Props = {
  record: QuoteRecord
  onSave: (input: RecordInput) => Promise<void>
  onBack: () => void
}

/**
 * 客戶資料。原型 stage57 `#screenBasic` —— 得三格：客戶、聯絡人、電話。
 *
 * ⚠️ 呢三格本來喺「基本資料」入面，同工程日期地址等等溝埋一齊。
 * 原型分開兩版，所以呢度搬咗出嚟。⛔ 欄位一個都冇加冇減，
 * 寫入行返同一條路（`quote_records`），⛔ 唔係另一張表。
 */
export default function ClientFormScreen({ record, onSave, onBack }: Props) {
  const [input, setInput] = useState<RecordInput>(() => rowToInput(record))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

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
    </>
  )
}
