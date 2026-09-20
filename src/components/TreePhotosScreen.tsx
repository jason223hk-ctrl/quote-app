import { useState } from 'react'
import { MITIGATION_OPTIONS, MITIGATION_OTHER, REMOVAL_OPTION } from '../lib/options'
import type { PhotosApi } from '../lib/photos'
import type { QuoteTree } from '../lib/trees'
import PhotoSlot from './PhotoSlot'
import { BackChip, BotanicalHeader, ChipButton, HeaderTitle, ScrollBody } from '../ui/shell'
import { ICONS } from '../ui/Icon'

type Props = {
  photos: PhotosApi
  accessToken: string
  recordId: string
  recordName: string
  tree: QuoteTree
  /** 撳個樹牌號 → 開改樹（原型：撳個名本身就開，⛔ 冇鉛筆仔）。 */
  onEdit: () => void
  onDelete: () => void
  onBack: () => void
}

/**
 * 樹木頁。版面照原型 stage57 `#screenTree`：**相片做主角**。
 *
 * 由上到下：全景相一格，跟住揀咗幾多個工序就幾多格。
 * ⭐ 撳個樹牌號 ＝ 開「改樹」（原型原文註解：唔要鉛筆仔，撳個名本身就開）。
 * ⭐ 右上角 `×` ＝ 刪除這棵樹（P3f §3.7），⛔ 唔喺改樹入面。
 *
 * ⛔ 揀咗「移除」嗰格照出，但冇拍攝／相簿 —— 寫住「全景相已經足夠，唔使再影」
 *    （Jason 2026-08-24）。⚠️ 同一棵樹嘅其他工序照樣要影。
 */
export default function TreePhotosScreen({
  photos,
  accessToken,
  recordId,
  recordName,
  tree,
  onEdit,
  onDelete,
  onBack,
}: Props) {
  /**
   * 向下拉刷新：個數一加，下面**每一格** `PhotoSlot` 都攞多次。
   * ⛔⛔ 刷新淨係「攞」—— 四條保證（唔取消／唔重傳／唔消失／唔傳兩次）
   *    喺 `src/lib/photoRefresh.ts`，四條各有測試釘住。
   */
  const [refreshToken, setRefreshToken] = useState(0)

  const picked = tree.mitigations ?? []

  // 只出揀咗嗰啲，⛔ 唔會將十幾個工序全部排出嚟。
  const slots = MITIGATION_OPTIONS.filter((option) => picked.includes(option.value))

  const labelOf = (value: string, label: string) =>
    value === MITIGATION_OTHER && tree.mitigation_other.trim() !== ''
      ? `其他：${tree.mitigation_other}`
      : label

  return (
    <>
      <BotanicalHeader
        compact
        left={
          <HeaderTitle
            back={<BackChip onClick={onBack} label="返樹木清單" />}
            name={
              <button className="head-name-btn" type="button" onClick={onEdit}>
                {/* 原型個標題淨係樹牌號，⛔ 冇 `#`。 */}
                {tree.tree_no || '—'}
              </button>
            }
            sub={recordName}
          />
        }
        right={<ChipButton icon={ICONS.del} label="刪除這棵樹" testid="tree-delete" onClick={onDelete} />}
      />

      <ScrollBody
        testid="tree-photos-scroll"
        compact
        onRefresh={async () => setRefreshToken((n) => n + 1)}
      >
        <PhotoSlot
          api={photos}
          accessToken={accessToken}
          recordId={recordId}
          treeId={tree.id}
          mitigation={null}
          title="全景相"
          hint={null}
          refreshToken={refreshToken}
        />

        {slots.map((option) => (
          <PhotoSlot
            key={option.value}
            api={photos}
            accessToken={accessToken}
            recordId={recordId}
            treeId={tree.id}
            mitigation={option.value}
            title={labelOf(option.value, option.label)}
            hint={null}
            readOnly={option.value === REMOVAL_OPTION.value}
            readOnlyNote="全景相已經足夠，不需要再拍攝。"
            refreshToken={refreshToken}
          />
        ))}

        {slots.length === 0 && (
          <p className="hint">尚未勾選工序。請點擊上方的樹牌號進入「改樹」勾選，這裡就會出現拍攝格。</p>
        )}
      </ScrollBody>
    </>
  )
}
