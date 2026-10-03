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
import { blockedReason } from '../lib/removalExclusive'
import {
  EMPTY_TREE_INPUT,
  treeToInput,
  validateTree,
  type QuoteTree,
  type TreeInput,
} from '../lib/trees'
import OptionGroup from './OptionGroup'
import ErrorNotice from '../ui/ErrorNotice'
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
  /**
   * 儲存中嗰粒掣寫乜。⭐ 改咗樹牌、等緊 Drive 改名嗰陣，呼叫嗰邊傳
   * 「正在更改 Drive 檔名⋯」入嚟（原型 PR #84「等改完名先返」）。⛔ 唔傳 ⇒「儲存中…」。
   */
  busyLabel?: string
}

export default function TreeFormPage({
  tree,
  suggestedTreeNo,
  otherTreeNos,
  recordName,
  onSave,
  onDelete,
  onBack,
  busyLabel,
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
      setError(`舊資料有數字不正確：${Object.values(errors).join('、')}。請截圖並聯絡 Jason。`)
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
              這個編號與另一棵樹相同。仍然可以儲存，只要之後分得出是哪一棵即可。
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
          hint="勾選了修剪，就要指明是哪一種"
          options={PRUNING_OPTIONS}
          values={input.mitigations}
          disabled={busy !== null}
          onToggle={(value) => patch({ mitigations: toggleValue(input.mitigations, value) })}
          /* ⛔ 規矩喺 `removalExclusive.ts`，⛔ 唔喺呢度。見嗰個檔嘅檔頭：
             兩樣都剔咗 ＝ 一棵已經冇咗嘅樹照計埋修剪錢。 */
          blockedReason={(value) => blockedReason(input.mitigations, value)}
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
              {/* ⚠️ 呢粒掣⛔ 唔行 `OptionGroup`（見上面），所以互斥要喺呢度自己接。
                  ⭐ 但**規矩本身仍然係嗰一條** —— 同上面兩組叫同一個
                  `blockedReason()`，⛔ 冇第二套判斷。 */}
              {(() => {
                const blocked = blockedReason(input.mitigations, REMOVAL_OPTION.value)
                return (
                  <label className={`option${blocked ? ' option--blocked' : ''}`}>
                    <input
                      type="checkbox"
                      data-testid={`pick-${REMOVAL_OPTION.value}`}
                      checked={input.mitigations.includes(REMOVAL_OPTION.value)}
                      disabled={busy !== null || blocked !== null}
                      onChange={() =>
                        patch({ mitigations: toggleValue(input.mitigations, REMOVAL_OPTION.value) })
                      }
                    />
                    <span>{REMOVAL_OPTION.label}</span>
                    {blocked && (
                      <span
                        className="option__blocked"
                        data-testid={`blocked-${REMOVAL_OPTION.value}`}
                      >
                        {blocked}
                      </span>
                    )}
                  </label>
                )
              })()}
            </div>
          </div>
        </fieldset>

        <OptionGroup
          legend="其他處理方法"
          hint="可勾選多項"
          options={OTHER_WORK_OPTIONS}
          values={input.mitigations}
          disabled={busy !== null}
          onToggle={(value) => patch({ mitigations: toggleValue(input.mitigations, value) })}
          /* ⚠️ 呢組入面**淨係「拉索加固」**會俾擋。⭐「起樹頭」⛔ 唔會 ——
             P3f 明文「✅ 移除 ＋ 起樹頭 係正常組合，⛔ 唔准擋」。
             ⛔ 呢個分別由 `removalExclusive.ts` 揸，⛔ 唔喺呢度寫死。 */
          blockedReason={(value) => blockedReason(input.mitigations, value)}
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
            這棵樹記錄了「{optionLabel(LEGACY_MITIGATION_OPTIONS, 'pruning')}」，
            屬於舊格式。<strong>會保留，不會消失。</strong>
            如要寫明是哪一種修剪，請在上面「修剪」勾選一項 ——
            <strong>勾選之後，才可以拍攝該工序的相片</strong>。
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

        {/* ⭐ 同「工程資料」嗰版**一模一樣嘅結構問題**：呢行紅字喺 `</form>` 上面，
            而「刪除這棵樹」粒掣喺下面嗰張 `.card danger-zone`。
            ⛔ 所以呢度都要用會自己拉入畫面嗰個 —— 唔係嘅話「刪一棵樹撳咗冇反應」
            會照樣存在，⚠️ 而且係同一日、同一個原因。 */}
        <ErrorNotice message={error} />

        <button className="button" type="submit" disabled={busy !== null}>
          {busy === 'save' ? (busyLabel ?? '儲存中…') : '儲存'}
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
                {busy === 'delete' ? '處理中…' : '再點擊一次確認刪除'}
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
              刪除這棵樹
            </button>
          )}
          <p className="danger-zone__note">刪除只會記下刪除時間，資料庫內不會真正刪除。</p>
        </div>
      )}
      </ScrollBody>
    </>
  )
}
