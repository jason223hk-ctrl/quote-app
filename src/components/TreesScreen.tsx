import { useCallback, useEffect, useState } from 'react'
import { MITIGATION_OPTIONS, MITIGATION_OTHER, optionLabels } from '../lib/options'
import {
  duplicateTreeNos,
  nextTreeNo,
  type QuoteTree,
  type TreeInput,
  type TreesApi,
} from '../lib/trees'
import type { QuoteRecord } from '../lib/records'
import TreeFormPage from './TreeFormPage'

type Props = {
  api: TreesApi
  record: QuoteRecord
  onBack: () => void
}

type View = { kind: 'list' } | { kind: 'form'; id: string | null }

/** 一棵樹嘅尺寸摘要。未量度嘅唔會顯示成 0。 */
function sizeLine(tree: QuoteTree): string {
  const parts: string[] = []
  if (tree.height_m !== null) parts.push(`高 ${tree.height_m}m`)
  if (tree.dbh_mm !== null) parts.push(`DBH ${tree.dbh_mm}mm`)
  if (tree.crown_m !== null) parts.push(`冠 ${tree.crown_m}m`)
  return parts.join('　')
}

function mitigationLine(tree: QuoteTree): string {
  const labels = optionLabels(MITIGATION_OPTIONS, tree.mitigations ?? [])
  if ((tree.mitigations ?? []).includes(MITIGATION_OTHER) && tree.mitigation_other.trim() !== '') {
    return labels.map((label) => (label === '其他' ? `其他：${tree.mitigation_other}` : label)).join('、')
  }
  return labels.join('、')
}

export default function TreesScreen({ api, record, onBack }: Props) {
  const [trees, setTrees] = useState<QuoteTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'list' })

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTrees(await api.list(record.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [api, record.id])

  useEffect(() => {
    void reload()
  }, [reload])

  const editing =
    view.kind === 'form' && view.id !== null
      ? (trees.find((tree) => tree.id === view.id) ?? null)
      : null

  async function afterWrite(write: () => Promise<QuoteTree>) {
    await write()
    await reload()
    setView({ kind: 'list' })
  }

  if (view.kind === 'form') {
    return (
      <TreeFormPage
        tree={editing}
        suggestedTreeNo={nextTreeNo(trees)}
        otherTreeNos={trees
          .filter((tree) => tree.id !== editing?.id)
          .map((tree) => tree.tree_no.trim())
          .filter((no) => no !== '')}
        onSave={(input: TreeInput) =>
          afterWrite(() =>
            editing ? api.update(editing.id, input) : api.create(record.id, input, trees.length),
          )
        }
        onDelete={() =>
          afterWrite(() => {
            if (!editing) throw new Error('搵唔到呢棵樹，請返清單再試。')
            return api.softDelete(editing.id)
          })
        }
        onBack={() => setView({ kind: 'list' })}
      />
    )
  }

  const duplicates = duplicateTreeNos(trees)

  return (
    <section className="list">
      <div className="page-head">
        <button className="link-button" type="button" onClick={onBack}>
          ← 返基本資料
        </button>
        <h2 className="card__title">樹木清單</h2>
        <p className="page-head__sub">
          {record.name} · 共 {trees.length} 棵
        </p>
      </div>

      {duplicates.length > 0 && (
        <p className="notice notice--warning" role="status">
          有樹撞咗編號：{duplicates.join('、')}。照儲存得，記住之後分得返邊棵就得。
        </p>
      )}

      {error && (
        <p className="notice notice--error" role="alert">
          攞唔到樹木清單：{error}{' '}
          <button className="link-button" type="button" onClick={() => void reload()}>
            再試
          </button>
        </p>
      )}

      {loading && <p className="loading">載入中…</p>}

      {!loading && !error && trees.length === 0 && (
        <p className="home__empty">仲未加樹。撳下面「＋ 加樹」開始。</p>
      )}

      <ul className="cards">
        {trees.map((tree) => (
          <li key={tree.id}>
            <button
              className="card card--tappable"
              type="button"
              onClick={() => setView({ kind: 'form', id: tree.id })}
            >
              <span className="card__top">
                <span className="card__name">
                  #{tree.tree_no || '—'} {tree.species || '（未填品種）'}
                </span>
                {duplicates.includes(tree.tree_no.trim()) && <span className="tag tag--warning">撞編號</span>}
              </span>

              {sizeLine(tree) !== '' && <span className="card__meta">{sizeLine(tree)}</span>}
              {mitigationLine(tree) !== '' && (
                <span className="card__meta">{mitigationLine(tree)}</span>
              )}
              {tree.note.trim() !== '' && <span className="card__meta">備註：{tree.note}</span>}
            </button>
          </li>
        ))}
      </ul>

      <button className="fab" type="button" onClick={() => setView({ kind: 'form', id: null })}>
        ＋ 加樹
      </button>
    </section>
  )
}
