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
import type { PhotosApi } from '../lib/photos'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'
import { Icon, ICONS } from '../ui/Icon'
import { regionLabel } from '../lib/labels'
import TreeFormPage from './TreeFormPage'
import TreePhotosScreen from './TreePhotosScreen'

type Props = {
  api: TreesApi
  photos: PhotosApi
  accessToken: string
  record: QuoteRecord
  onBack: () => void
}

type View =
  | { kind: 'list' }
  /** 樹木頁 ＝ 相片。撳個樹牌號先入「改樹」。 */
  | { kind: 'photos'; id: string }
  | { kind: 'form'; id: string | null }

function mitigationLine(tree: QuoteTree): string {
  const labels = optionLabels(MITIGATION_OPTIONS, tree.mitigations ?? [])
  if ((tree.mitigations ?? []).includes(MITIGATION_OTHER) && tree.mitigation_other.trim() !== '') {
    return labels
      .map((label) => (label === '其他' ? `其他：${tree.mitigation_other}` : label))
      .join('、')
  }
  return labels.join('、')
}

/**
 * 卡上面嗰行摘要：`清理樹冠、縮減樹冠 · 6 張相`（原型嗰個格式）。
 *
 * ⛔ 數唔到相就唔出張數，⛔ 唔准出「0 張相」—— 冇影同數唔到係兩件事。
 */
function summaryLine(tree: QuoteTree, counts: Record<string, number> | null): string {
  const works = mitigationLine(tree)
  const bits = [works === '' ? '未勾選工序' : works]
  if (counts !== null) bits.push(`${counts[tree.id] ?? 0} 張相`)
  return bits.join(' · ')
}

/** 04 樹木清單。殼照 tree-app-v7 `ProjectDetailScreen` 嘅樹卡清單。 */
export default function TreesScreen({ api, photos, accessToken, record, onBack }: Props) {
  const [trees, setTrees] = useState<QuoteTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'list' })
  /** 每棵樹幾多張相。⛔ null ＝ 數唔到，唔准扮 0。 */
  const [photoCounts, setPhotoCounts] = useState<Record<string, number> | null>(null)

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

  // 一次過攞成單嘅相，逐棵樹數。⛔ 唔好逐棵樹打一次 DB。
  useEffect(() => {
    let active = true
    void photos
      .listByRecord(record.id)
      .then((rows) => {
        if (!active) return
        const map: Record<string, number> = {}
        for (const row of rows) {
          if (row.tree_id === null) continue
          map[row.tree_id] = (map[row.tree_id] ?? 0) + 1
        }
        setPhotoCounts(map)
      })
      .catch(() => {
        if (active) setPhotoCounts(null)
      })
    return () => {
      active = false
    }
  }, [photos, record.id, view])

  useEffect(() => {
    void reload()
  }, [reload])

  const editing =
    view.kind === 'form' && view.id !== null
      ? (trees.find((tree) => tree.id === view.id) ?? null)
      : null

  async function afterWrite(write: () => Promise<QuoteTree>, next: View = { kind: 'list' }) {
    const saved = await write()
    await reload()
    // 儲存咗一棵樹就入返佢個相片頁 —— 影相先係現場真正要做嘅嘢。
    setView(next.kind === 'photos' && next.id === '' ? { kind: 'photos', id: saved.id } : next)
  }

  if (view.kind === 'photos') {
    const tree = trees.find((item) => item.id === view.id)
    if (!tree) {
      return (
        <div className="content">
          <p className="loading">載入中…</p>
        </div>
      )
    }
    return (
      <TreePhotosScreen
        photos={photos}
        accessToken={accessToken}
        recordId={record.id}
        recordName={record.name}
        tree={tree}
        onEdit={() => setView({ kind: 'form', id: tree.id })}
        onDelete={() => void afterWrite(() => api.softDelete(tree.id))}
        onBack={() => setView({ kind: 'list' })}
      />
    )
  }

  if (view.kind === 'form') {
    return (
      <TreeFormPage
        tree={editing}
        recordName={record.name}
        suggestedTreeNo={nextTreeNo(trees)}
        otherTreeNos={trees
          .filter((tree) => tree.id !== editing?.id)
          .map((tree) => tree.tree_no.trim())
          .filter((no) => no !== '')}
        onSave={(input: TreeInput) =>
          afterWrite(
            () =>
              editing ? api.update(editing.id, input) : api.create(record.id, input, trees.length),
            { kind: 'photos', id: editing ? editing.id : '' },
          )
        }
        onDelete={() =>
          afterWrite(() => {
            if (!editing) throw new Error('檢索不到這棵樹，請返回清單再試。')
            return api.softDelete(editing.id)
          })
        }
        onBack={() =>
          setView(editing ? { kind: 'photos', id: editing.id } : { kind: 'list' })
        }
      />
    )
  }

  const duplicates = duplicateTreeNos(trees)

  return (
    <>
      <BotanicalHeader
        compact
        left={
          <HeaderTitle
            back={<BackChip onClick={onBack} />}
            name="樹木清單"
            sub={`${record.name} · ${record.record_date} · ${regionLabel(record.region)}`}
          />
        }
      />

      {/* ⛔ 原型呢版一張統計卡都冇。「撞編號」個數本來就喺下面條警告度講返，
          留住兩張卡只係阻住睇樹。 */}
      <ScrollBody testid="tree-scroll" compact onRefresh={reload}>
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
          <div className="muted empty">尚未加樹。請點擊右下角「＋ 加樹」開始。</div>
        )}

        <ul className="list" data-testid="tree-list">
          {trees.map((tree) => (
            <li key={tree.id}>
              <button
                className="proj-card proj-card--tree"
                data-testid="tree-row"
                onClick={() => setView({ kind: 'photos', id: tree.id })}
              >
                <div className="proj-main">
                  {/* 原型：標題淨係樹牌號，⛔ 冇品種（品種已經唔喺 qa 出現）。 */}
                  <div className="proj-title">{tree.tree_no || '—'}</div>
                  <div className="proj-meta">
                    <span className="meta-item wrap">{summaryLine(tree, photoCounts)}</span>
                  </div>
                  {tree.note.trim() !== '' && (
                    <div className="proj-meta">
                      <span className="meta-item wrap">備註：{tree.note}</span>
                    </div>
                  )}
                </div>
                {duplicates.includes(tree.tree_no.trim()) && (
                  <div className="proj-side">
                    <span className="badge amber">撞編號</span>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </ScrollBody>

      <button
        className="fab fab--round"
        data-testid="fab-new-tree"
        aria-label="加樹"
        onClick={() => setView({ kind: 'form', id: null })}
      >
        <Icon name={ICONS.add} />
      </button>
    </>
  )
}
