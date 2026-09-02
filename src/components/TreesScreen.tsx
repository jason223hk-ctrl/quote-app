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
import PhotoSlot from './PhotoSlot'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'
import { Icon, ICONS } from '../ui/Icon'
import { regionLabel } from '../lib/labels'
import TreeFormPage from './TreeFormPage'

type Props = {
  api: TreesApi
  photos: PhotosApi
  accessToken: string
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
  return parts.join(' · ')
}

function mitigationLine(tree: QuoteTree): string {
  const labels = optionLabels(MITIGATION_OPTIONS, tree.mitigations ?? [])
  if ((tree.mitigations ?? []).includes(MITIGATION_OTHER) && tree.mitigation_other.trim() !== '') {
    return labels
      .map((label) => (label === '其他' ? `其他：${tree.mitigation_other}` : label))
      .join('、')
  }
  return labels.join('、')
}

/** 04 樹木清單。殼照 tree-app-v7 `ProjectDetailScreen` 嘅樹卡清單。 */
export default function TreesScreen({ api, photos, accessToken, record, onBack }: Props) {
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
        recordName={record.name}
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
        photoSlot={
          // 新樹未有 id，未有 id 就冇嘢可以掛住張相。儲存咗先影得。
          editing ? (
            <PhotoSlot
              api={photos}
              accessToken={accessToken}
              recordId={record.id}
              treeId={editing.id}
            />
          ) : (
            <p className="hint">先儲存呢棵樹，之後就影得全景相。</p>
          )
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
      <ScrollBody testid="tree-scroll" compact>
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
          <div className="muted empty">仲未加樹。撳右下角「＋ 加樹」開始。</div>
        )}

        <ul className="list" data-testid="tree-list">
          {trees.map((tree) => (
            <li key={tree.id}>
              <button
                className="proj-card proj-card--tree"
                data-testid="tree-row"
                onClick={() => setView({ kind: 'form', id: tree.id })}
              >
                <div className="proj-main">
                  <div className="proj-title">
                    #{tree.tree_no || '—'} {tree.species || '（未填品種）'}
                  </div>
                  {sizeLine(tree) !== '' && (
                    <div className="proj-meta">
                      <span className="meta-item">{sizeLine(tree)}</span>
                    </div>
                  )}
                  {mitigationLine(tree) !== '' && (
                    <div className="proj-meta">
                      <span className="meta-item wrap">{mitigationLine(tree)}</span>
                    </div>
                  )}
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
