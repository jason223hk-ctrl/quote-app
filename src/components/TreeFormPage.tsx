import { useState, type FormEvent } from 'react'
import { toggleValue } from '../lib/forms'
import { MITIGATION_OPTIONS, MITIGATION_OTHER } from '../lib/options'
import {
  EMPTY_TREE_INPUT,
  treeToInput,
  validateTree,
  type QuoteTree,
  type TreeErrors,
  type TreeInput,
} from '../lib/trees'
import OptionGroup from './OptionGroup'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'

type Props = {
  /** null = 加新樹 */
  tree: QuoteTree | null
  /** 新樹自動派嘅編號 */
  suggestedTreeNo: string
  /** 同一單入面其他樹嘅編號，用嚟即時提示撞號 */
  otherTreeNos: string[]
  /** 母單名，喺頁頂副題顯示 */
  recordName: string
  onSave: (input: TreeInput) => Promise<void>
  onDelete: () => Promise<void>
  onBack: () => void
}

export default function TreeFormPage({
  tree,
  suggestedTreeNo,
  otherTreeNos,
  recordName,
  onSave,
  onDelete,
  onBack,
}: Props) {
  const [input, setInput] = useState<TreeInput>(() =>
    tree ? treeToInput(tree) : { ...EMPTY_TREE_INPUT, tree_no: suggestedTreeNo },
  )
  const [fieldErrors, setFieldErrors] = useState<TreeErrors>({})
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const duplicated =
    input.tree_no.trim() !== '' && otherTreeNos.includes(input.tree_no.trim())

  function patch(values: Partial<TreeInput>) {
    setInput((current) => ({ ...current, ...values }))
    setFieldErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(values) as (keyof TreeInput)[]) delete next[key]
      return next
    })
  }

  async function run(kind: 'save' | 'delete', action: () => Promise<void>) {
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
    const errors = validateTree(input)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('有欄位未填好，請檢查返下面紅色嗰幾行。')
      return
    }
    setFieldErrors({})
    await run('save', () => onSave(input))
  }

  function fieldError(key: keyof TreeInput) {
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
        left={
          <HeaderTitle
            back={<BackChip onClick={onBack} label="返樹木清單" />}
            name={tree ? `改樹 #${tree.tree_no || '—'}` : '加樹'}
            sub={recordName}
          />
        }
      />

      <ScrollBody testid="tree-form-scroll">
        <form className="card" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field__label">樹編號</span>
          <input
            className="field__input"
            type="text"
            inputMode="numeric"
            value={input.tree_no}
            disabled={busy !== null}
            onChange={(event) => patch({ tree_no: event.target.value })}
          />
          {/* 撞號只係警告，唔會擋住儲存——現場真係會撞。 */}
          {duplicated && (
            <span className="field__warning" role="status">
              呢個編號同另一棵樹一樣。照儲存得，記住之後分得返邊棵就得。
            </span>
          )}
        </label>

        <label className="field">
          <span className="field__label">品種</span>
          <input
            className="field__input"
            type="text"
            value={input.species}
            disabled={busy !== null}
            onChange={(event) => patch({ species: event.target.value })}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field__label">樹高 m</span>
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              value={input.height_m}
              disabled={busy !== null}
              onChange={(event) => patch({ height_m: event.target.value })}
            />
            {fieldError('height_m')}
          </label>

          <label className="field">
            <span className="field__label">DBH mm</span>
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              value={input.dbh_mm}
              disabled={busy !== null}
              onChange={(event) => patch({ dbh_mm: event.target.value })}
            />
            {fieldError('dbh_mm')}
          </label>

          <label className="field">
            <span className="field__label">冠幅 m</span>
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              value={input.crown_m}
              disabled={busy !== null}
              onChange={(event) => patch({ crown_m: event.target.value })}
            />
            {fieldError('crown_m')}
          </label>
        </div>

        <p className="hint">未量度就留空。留空係 null，唔會當咗零。</p>

        <OptionGroup
          legend="處理方法"
          hint="可以揀多過一個"
          options={MITIGATION_OPTIONS}
          values={input.mitigations}
          disabled={busy !== null}
          onToggle={(value) => patch({ mitigations: toggleValue(input.mitigations, value) })}
          renderExtra={(value) =>
            value === MITIGATION_OTHER ? (
              <input
                className="field__input option__extra"
                type="text"
                placeholder="其他處理方法"
                aria-label="其他處理方法"
                value={input.mitigation_other}
                disabled={busy !== null}
                onChange={(event) => patch({ mitigation_other: event.target.value })}
              />
            ) : null
          }
        />

        <label className="field">
          <span className="field__label">備註</span>
          <textarea
            className="field__input field__input--area"
            rows={3}
            value={input.note}
            disabled={busy !== null}
            onChange={(event) => patch({ note: event.target.value })}
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

      {tree && (
        <div className="card danger-zone">
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
              刪除呢棵樹
            </button>
          )}
          <p className="danger-zone__note">刪除只係記低刪除時間，資料庫入面唔會真刪。</p>
        </div>
      )}
      </ScrollBody>
    </>
  )
}
