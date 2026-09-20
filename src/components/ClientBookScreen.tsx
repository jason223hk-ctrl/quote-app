import { useCallback, useEffect, useState } from 'react'
import {
  EMPTY_CLIENT,
  clientLabel,
  findDuplicate,
  isBlank,
  BLANK_MESSAGE,
  DUPLICATE_MESSAGE,
  type ClientInput,
  type ClientsApi,
  type QuoteClient,
} from '../lib/clients'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'
import { Icon, ICONS } from '../ui/Icon'

type Props = {
  api: ClientsApi
  onBack: () => void
}

/**
 * 客戶簿。原型 stage57 `#screenClients`。
 *
 * ⭐ 一筆 ＝ 客戶 ＋ 聯絡人 ＋ 電話成組（Jason 2026-08-25）。
 *
 * ⛔⛔ 「刪除」係 soft delete（寫 `deleted_at`）—— DB 冇 DELETE policy，
 *    真刪根本做唔到。⚠️ 所以確認嗰句一定要照原型咁講清楚：
 *    **「已填入工程的資料不會改變」** —— 因為工程係當時嘅快照，冇 FK。
 *    ⛔ 唔講清楚嘅話，人會以為刪咗客戶就會搞亂啲舊單，跟住唔敢清。
 *
 * ⛔ 兩段式確認，⛔ 唔用 `window.confirm`（同 `SettingsScreen` 登出一樣）。
 */
export default function ClientBookScreen({ api, onBack }: Props) {
  /** null ＝ 攞唔到。⛔ 唔准當佢係「本簿係空嘅」—— 咁會叫人重新入過一次。 */
  const [list, setList] = useState<QuoteClient[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** 開緊個編輯格。`id` ＝ null 就係新增。 */
  const [editing, setEditing] = useState<{ id: string | null; input: ClientInput } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  /** 等緊確認刪邊個。 */
  const [deleting, setDeleting] = useState<QuoteClient | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      setList(await api.list())
    } catch (caught) {
      setList(null)
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  async function save() {
    if (editing === null) return
    setFormError(null)

    if (isBlank(editing.input)) {
      setFormError(BLANK_MESSAGE)
      return
    }
    // ⛔ 前端擋一次，DB 個唯一索引再擋一次。⭐ 兩把尺一樣（見 `clients.ts` `sameClient`）。
    if (list !== null && findDuplicate(list, editing.input, editing.id) !== null) {
      setFormError(DUPLICATE_MESSAGE)
      return
    }

    setBusy(true)
    try {
      if (editing.id === null) await api.create(editing.input)
      else await api.update(editing.id, editing.input)
      setEditing(null)
      await reload()
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (deleting === null) return
    setBusy(true)
    try {
      await api.softDelete(deleting.id)
      setDeleting(null)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const count = list === null ? null : list.length

  return (
    <>
      <BotanicalHeader
        compact="project"
        left={
          <HeaderTitle
            back={<BackChip onClick={onBack} />}
            name="客戶簿"
            sub={<div className="head-sub-line">{count === null ? '—' : `${count} 個客戶`}</div>}
          />
        }
      />

      <ScrollBody testid="clients-scroll" compact onRefresh={reload}>
        <p className="muted soon">
          此處的客戶可在「客戶資料」直接選用。修改只影響日後選用，已填入工程的資料不會變。
        </p>

        {error !== null && (
          <p className="notice notice--error" role="alert">
            {error}{' '}
            <button className="link-button" type="button" onClick={() => void reload()}>
              再試一次
            </button>
          </p>
        )}

        {list === null && error === null && <p className="loading">載入中⋯</p>}

        {list !== null && list.length === 0 && <div className="muted empty">未有客戶</div>}

        {list?.map((one) => (
          <div key={one.id} className="card pcard" data-testid="client-row">
            <button className="client-main" type="button" onClick={() => setEditing({ id: one.id, input: one })}>
              <span className="proj-title">{one.client.trim() === '' ? '（未填客戶）' : one.client}</span>
              {one.contact.trim() !== '' && <span className="meta-item wrap">{one.contact}</span>}
              {one.phone.trim() !== '' && <span className="meta-item wrap">{one.phone}</span>}
            </button>
            <button
              className="button button--secondary button--small"
              type="button"
              data-testid="client-delete"
              disabled={busy}
              onClick={() => setDeleting(one)}
            >
              刪除
            </button>
          </div>
        ))}
      </ScrollBody>

      <button
        className="fab"
        type="button"
        aria-label="加客戶"
        data-testid="client-add"
        onClick={() => {
          setFormError(null)
          setEditing({ id: null, input: EMPTY_CLIENT })
        }}
      >
        <Icon name={ICONS.add} />
      </button>

      {editing !== null && (
        <div className="search-overlay" onClick={() => setEditing(null)}>
          <div className="popover" data-testid="client-form" onClick={(e) => e.stopPropagation()}>
            <h3>{editing.id === null ? '新增客戶' : '修改客戶'}</h3>

            <label htmlFor="cb-co">客戶</label>
            <input
              id="cb-co"
              className="field__input"
              type="text"
              value={editing.input.client}
              onChange={(e) =>
                setEditing({ ...editing, input: { ...editing.input, client: e.target.value } })
              }
            />

            <label htmlFor="cb-person">聯絡人</label>
            <input
              id="cb-person"
              className="field__input"
              type="text"
              value={editing.input.contact}
              onChange={(e) =>
                setEditing({ ...editing, input: { ...editing.input, contact: e.target.value } })
              }
            />

            <label htmlFor="cb-tel">電話</label>
            <input
              id="cb-tel"
              className="field__input"
              type="text"
              inputMode="tel"
              value={editing.input.phone}
              onChange={(e) =>
                setEditing({ ...editing, input: { ...editing.input, phone: e.target.value } })
              }
            />

            {formError !== null && (
              <p className="notice notice--error" role="alert" data-testid="client-form-error">
                {formError}
              </p>
            )}

            <div className="popover-actions">
              <button className="ghost" type="button" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="primary" type="button" disabled={busy} onClick={() => void save()}>
                {busy ? '儲存中⋯' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting !== null && (
        <div className="search-overlay" onClick={() => setDeleting(null)}>
          <div className="popover" data-testid="client-delete-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>刪除客戶？</h3>
            {/* ⛔ 呢句係原型原文，⛔ 唔准縮成「確定嗎」。 */}
            <p className="muted">
              「{clientLabel(deleting)}」將從客戶簿移除。已填入工程的資料不會改變。
            </p>
            <div className="popover-actions">
              <button className="ghost" type="button" onClick={() => setDeleting(null)}>
                取消
              </button>
              <button className="primary" type="button" disabled={busy} onClick={() => void remove()}>
                {busy ? '刪除中⋯' : '刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
