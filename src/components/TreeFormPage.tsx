import { useState, type FormEvent } from 'react'
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
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const duplicated =
    input.tree_no.trim() !== '' && otherTreeNos.includes(input.tree_no.trim())

  function patch(values: Partial<TreeInput>) {
    setInput((current) => ({ ...current, ...values }))
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
    // ⚠️ 呢三格（樹高／DBH／冠幅）2026-09-02 由畫面拎走咗，
    //    所以錯嘅話冇一格可以標紅 —— 一定要喺表底出一句，
    //    ⛔ 唔可以靜靜哋擋住儲存，令人以為撳咗冇反應。
    const errors = validateTree(input)
    if (Object.keys(errors).length > 0) {
      setError(`舊資料有數字唔啱：${Object.values(errors).join('、')}。請截圖搵 Jason。`)
      return
    }

    await run('save', () => onSave(input))
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

        {/*
          ⛔ 品種／樹高／DBH／冠幅四格 2026-09-02 由畫面拎走
          （Jason：「已經唔會再需要出現係 qa」）。
          ⚠️ `quote_trees` 嗰四個欄**冇 drop** —— 零真刪，舊樹嘅數留喺庫入面。
          `treeToInput` 照樣讀返出嚟、`inputToRow` 照樣寫返落去，
          所以改一棵舊樹⛔ 唔會將佢哋洗白。
        */}


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
