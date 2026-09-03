import type { PhotosApi } from '../lib/photos'
import type { QuoteRecord } from '../lib/records'
import PhotoSlot from './PhotoSlot'
import { BackChip, BotanicalHeader, HeaderTitle, ScrollBody } from '../ui/shell'

type Props = {
  api: PhotosApi
  accessToken: string
  record: QuoteRecord
  onBack: () => void
}

/**
 * 環境相。原型 stage57 `#screenEnv`。
 *
 * ⭐ 成個工程一份，⛔ 唔屬於任何一棵樹（`tree_id = null`）——
 *   所以亦都 ⛔ 唔受樹木頁「要先影全景相」條閘限制（Jason 2026-08-24 拍板）。
 *
 * ⛔ 唔分類（入口／泊車位／垃圾位嗰啲全部唔做）：環境相通常得一兩三張，
 *   分類嘅好處唔抵每張多撳一下。
 *
 * ⛔ 環境相唔入 PDF（Jason 2026-08-25）。但要計入同步頁張數。
 *
 * Drive 檔名 `Site_01.jpg`、`Site_02.jpg`⋯，喺 worker 度砌
 * （`worker/src/names.mjs` 個 `sitePhotoFilename`）。
 */
export default function EnvPhotosScreen({ api, accessToken, record, onBack }: Props) {
  return (
    <>
      <BotanicalHeader
        compact
        left={
          <HeaderTitle back={<BackChip onClick={onBack} />} name="環境相" sub={record.name} />
        }
      />

      <ScrollBody testid="env-photos-scroll" compact>
        <PhotoSlot
          api={api}
          accessToken={accessToken}
          recordId={record.id}
          treeId={null}
          title="環境相"
          hint="成個工程一份，唔屬於任何一棵樹。想影幾多影幾多。"
        />
      </ScrollBody>
    </>
  )
}
