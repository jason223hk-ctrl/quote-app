import { useState, type FormEvent, type ReactNode } from 'react'
import { toggleValue } from '../lib/forms'
import {
  MITIGATION_OTHER,
  OTHER_WORK_OPTIONS,
  PRUNING_OPTIONS,
  REMOVAL_OPTION,
  hasLegacyMitigation,
  optionLabel,
  LEGACY_MITIGATION_OPTIONS,
} from '../lib/options'
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
  /** P3a 嗰格全景相。由上面餵落嚟，呢一版唔洗識得相片係點運作。 */
  photoSlot?: ReactNode
}

export default function TreeFormPage({
  tree,
  suggestedTreeNo,
  otherTreeNos,
  recordName,
  onSave,
  onDelete,
  onBack,
  photoSlot,
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
        compact
        left={
          <HeaderTitle
            back={<BackChip onClick={onBack} label="返樹木清單" />}
            name={tree ? `改樹 #${tree.tree_no || '—'}` : '加樹'}
            sub={recordName}
          />
        }
      />

      <ScrollBody testid="tree-form-scroll" compact>
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

        {/*
          「修剪」係群組標題，唔係一個揀得嘅選項 —— 所以佢做 legend，
          真正揀嘅永遠係下面四個細項之一。咁樣就冇可能出現
          「淨係揀咗修剪、冇細分」呢種新資料。
        */}
        <OptionGroup
          legend="修剪"
          hint="揀修剪就要揀返係邊一種"
          options={PRUNING_OPTIONS}
          values={input.mitigations}
          disabled={busy !== null}
          onToggle={(value) => patch({ mitigations: toggleValue(input.mitigations, value) })}
        />

        {/*
          「移除」自己一個位，同「修剪」同一級 —— 斬走成棵樹係一件同修剪同級嘅大事，
          唔應該收埋喺「其他」。

          ⚠️ 佢同「修剪」唔同嘅地方：「修剪」係純標題剔唔到，「移除」本身剔得。
          所以呢度唔用 OptionGroup —— 用咗就會出一個 legend「移除」加一個
          label 又係「移除」，同一個字出兩次。呢度得一個掣，直接畫。
        */}
        <fieldset className="group">
          <div className="group__options">
            <div>
              <label className="option">
                <input
                  type="checkbox"
                  checked={input.mitigations.includes(REMOVAL_OPTION.value)}
                  disabled={busy !== null}
                  onChange={() =>
                    patch({ mitigations: toggleValue(input.mitigations, REMOVAL_OPTION.value) })
                  }
                />
                <span>{REMOVAL_OPTION.label}</span>
              </label>
            </div>
          </div>
        </fieldset>

        <OptionGroup
          legend="其他處理方法"
          hint="可以揀多過一個"
          options={OTHER_WORK_OPTIONS}
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

        {/*
          舊單專用。⛔ 唔准消失、唔准報錯、唔准自動幫佢揀一個細項 ——
          呢兩行係 P2 試用期留低嘅真資料（`docs/開發紀錄.md` §5.4）。
          佢淨係顯示，冇 checkbox，所以撳唔郁亦都刪唔走。
        */}
        {hasLegacyMitigation(input.mitigations) && (
          <p className="notice notice--warning" role="status">
            呢棵樹記低咗「{optionLabel(LEGACY_MITIGATION_OPTIONS, 'pruning')}」，
            係舊格式。<strong>照留住，唔會冇咗。</strong>
            想寫清楚係邊一種修剪，就喺上面「修剪」揀返一個 ——
            <strong>揀咗之後先影得到嗰個工序嘅相</strong>。
          </p>
        )}

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

      {photoSlot}

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
