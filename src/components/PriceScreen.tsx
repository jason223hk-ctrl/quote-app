import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PriceApi, PricePatch, PriceRow, PriceTable } from '../lib/prices'
import {
  groupPrices,
  parseMoney,
  patchFor,
  shapeOf,
  unitLabel,
  valueOf,
  type AreaCol,
} from '../lib/priceGroups'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'

type Props = {
  api: PriceApi
  /** 淨係辦公室（quote_admins）改得。⛔ 唔准收埋 —— 要見到但改唔到。 */
  canEdit: boolean
  onBack: () => void
}

/** 一格嘅身分：`key|col`，`col` 空白代表單一價。 */
const fieldId = (key: string, col: AreaCol | null) => `${key}|${col ?? ''}`

/**
 * 09 單價設定。版面照原型 stage57 `#screenPrice`。
 *
 * ⭐⭐ 成版最緊要一條：**價錢 null ≠ 0**。
 *    所以打空咗一格 ⛔ 唔會寫落 DB，個掣會鎖住並且講明邊格出事。
 *    ⛔ 冇「清空做逐次報價」呢個功能 —— 要改一個項目變逐次報價，
 *    影響所有待報價工程嘅成本，唔可以靠打空一格就做到。
 *
 * ⚠️ 原型右上角有粒「管理」掣（改名／刪除／新增 項目、類別、地區）。
 *    呢度**冇做**：`quote_prices` 特登冇 DELETE policy（零真刪），
 *    亦都冇改名／新增嘅 API。⛔ 唔係漏咗 —— 要做就要先動 DB。
 */
export default function PriceScreen({ api, canEdit, onBack }: Props) {
  const [table, setTable] = useState<PriceTable | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setError(null)
    void api
      .list()
      .then(setTable)
      .catch((e: Error) => setError(e.message))
  }, [api])

  useEffect(load, [load])

  const groups = useMemo(() => (table ? groupPrices(table) : []), [table])

  /** 改咗、而且真係同原本唔同嗰啲格。 */
  const changed = useMemo(() => {
    if (!table) return []
    const out: { row: PriceRow; col: AreaCol | null; text: string }[] = []
    for (const row of table) {
      const shape = shapeOf(row)
      const cols: (AreaCol | null)[] =
        shape.kind === 'byArea' ? shape.areas.map((a) => a.col) : [null]
      for (const col of cols) {
        const text = draft[fieldId(row.key, col)]
        if (text === undefined) continue
        const now = parseMoney(text)
        if (now !== null && now === valueOf(row, col)) continue
        out.push({ row, col, text })
      }
    }
    return out
  }, [table, draft])

  const bad = changed.filter((c) => parseMoney(c.text) === null)
  const dirty = changed.length > 0

  const onEdit = (key: string, col: AreaCol | null, text: string) => {
    // ⛔ 只收數字 —— 唔好等人打完成句嘢先話佢知唔得。
    const clean = text.replace(/[^\d.]/g, '')
    setDraft((d) => ({ ...d, [fieldId(key, col)]: clean }))
  }

  async function save() {
    if (!table || bad.length > 0) return
    setSaving(true)
    setError(null)
    try {
      // 同一個項目改咗幾格就合埋一次過寫，⛔ 唔好逐格打一次 DB。
      const byKey = new Map<string, PricePatch>()
      for (const { row, col, text } of changed) {
        const value = parseMoney(text)
        if (value === null) continue
        const patch = patchFor(shapeOf(row), col, value)
        byKey.set(row.key, { ...(byKey.get(row.key) ?? {}), ...patch })
      }
      for (const [key, patch] of byKey) await api.update(key, patch)
      setDraft({})
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const cell = (row: PriceRow, col: AreaCol | null) => {
    const id = fieldId(row.key, col)
    const raw = draft[id]
    const current = valueOf(row, col)
    const text = raw ?? (current === null ? '' : String(current))
    const invalid = raw !== undefined && parseMoney(raw) === null

    return (
      <span className={`price-input${canEdit ? '' : ' locked'}${invalid ? ' invalid' : ''}`}>
        <span className="price-dollar" aria-hidden="true">
          $
        </span>
        <input
          type="text"
          inputMode="numeric"
          data-testid={`price-${id}`}
          value={text}
          readOnly={!canEdit}
          aria-label={`${row.label}${col ? '' : ''} 單價`}
          onChange={(e) => onEdit(row.key, col, e.target.value)}
        />
      </span>
    )
  }

  return (
    <>
      <BotanicalHeader
        compact
        left={
          <HeaderTitle
            back={<BackChip onClick={onBack} />}
            name="單價設定"
            sub={<div className="head-sub-line">報價時自動套用</div>}
          />
        }
      />

      <ScrollBody testid="price-scroll" compact>
        <p className="note-box">
          此處只設定單價。每張報價實際用多少，由該工程的「工程資料」決定。
          <br />
          標示「逐次報價」的項目沒有固定單價，出報價時須逐次填寫。
          <br />
          修改單價即時影響所有「待報價」工程。已報價及已中標的工程沿用報價當日的單價。
          <br />
          所有改動儲存後會同步給全公司所有用戶。
        </p>

        {!canEdit && <p className="note-box note-box--warn">你可以查看，但不能修改 —— 單價設定只有辦公室可以修改。</p>}

        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}

        {table === null && !error && <div className="muted empty">載入中…</div>}

        {groups.map((group) => (
          <section className="card price-card" key={group.category}>
            <h2 className="price-group">{group.title}</h2>

            {group.rows.map((row) => {
              const shape = shapeOf(row)
              return (
                <div className="price-item" key={row.key}>
                  <div className="prow">
                    <div className="price-label">
                      {row.label}
                      <div className="price-unit">{unitLabel(row)}</div>
                    </div>

                    {shape.kind === 'ask' && <span className="price-ask">逐次報價</span>}
                    {shape.kind === 'single' && cell(row, null)}
                  </div>

                  {shape.kind === 'byArea' &&
                    shape.areas.map((area) => (
                      <div className="prow prow--sub" key={area.col}>
                        <div className="price-label">{area.label}</div>
                        {cell(row, area.col)}
                      </div>
                    ))}
                </div>
              )
            })}
          </section>
        ))}

        {bad.length > 0 && (
          <p className="notice notice--warning" role="alert">
            有 {bad.length} 格未填好。⛔ 空白唔等於 $0，亦唔等於「逐次報價」——
            填返個數先儲存得。
          </p>
        )}

      </ScrollBody>

      {/* ⚠️ 儲存掣特登擺喺捲動層外面，釘喺 nav 上面。
          原型嗰粒係 `position:sticky;bottom:12px`，但佢個 main 唔係捲動層，
          結果實測釘咗喺 774px —— 正正俾底部 nav 遮住（nav 頂 763px）。
          ⛔ 唔照抄：一個㩒唔到嘅儲存掣，等於冇。 */}
      {table !== null && (
        <div className="price-save-bar">
          <button
            className="button"
            type="button"
            data-testid="price-save"
            disabled={!canEdit || !dirty || bad.length > 0 || saving}
            onClick={() => void save()}
          >
            {saving ? '儲存中…' : dirty ? `儲存改動（${changed.length}）` : '已儲存'}
          </button>
        </div>
      )}
    </>
  )
}
