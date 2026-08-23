import PhotoSlot from './PhotoSlot'
import { LEGACY_NO_SLOT_MESSAGE, needsLegacyNotice, slotsFor } from '../lib/photoSlots'
import type { PhotosApi } from '../lib/photos'
import type { QuoteTree } from '../lib/trees'

type Props = {
  photos: PhotosApi
  accessToken: string
  recordId: string
  tree: QuoteTree
}

/**
 * 一棵樹上面全部影相格：全景格 ＋ 每個揀咗嘅工序一格（D7 甲）。
 *
 * ⛔ 揀咗幾多個工序就出幾多格，唔另開一版（Jason 2026-08-23）。
 */
export default function TreePhotoSlots({ photos, accessToken, recordId, tree }: Props) {
  const mitigations = tree.mitigations ?? []
  const slots = slotsFor(mitigations)

  return (
    <>
      {slots.map((slot) => (
        <PhotoSlot
          key={slot.mitigation ?? '__whole__'}
          api={photos}
          accessToken={accessToken}
          recordId={recordId}
          treeId={tree.id}
          mitigation={slot.mitigation}
          title={slot.title}
          hint={slot.hint}
        />
      ))}

      {/* ⛔ 只有 legacy 代號嘅樹唔出工序格（D8）。要講到明點做，唔好淨係冇咗個掣。 */}
      {needsLegacyNotice(mitigations) && (
        <p className="notice notice--warning" role="status">
          {LEGACY_NO_SLOT_MESSAGE}
        </p>
      )}
    </>
  )
}
