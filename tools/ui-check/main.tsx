import { createRoot } from 'react-dom/client'
import HomeScreen from '../../src/components/HomeScreen'
import RecordHubScreen from '../../src/components/RecordHubScreen'
import PriceScreen from '../../src/components/PriceScreen'
import TreesScreen from '../../src/components/TreesScreen'
import RecordFormPage from '../../src/components/RecordFormPage'
import ClientFormScreen from '../../src/components/ClientFormScreen'
import EnvPhotosScreen from '../../src/components/EnvPhotosScreen'
import TreePhotosScreen from '../../src/components/TreePhotosScreen'
import TreeFormPage from '../../src/components/TreeFormPage'
import RecordListPage from '../../src/components/RecordListPage'
import DeleteRecordDialog from '../../src/components/DeleteRecordDialog'
import SettingsScreen from '../../src/components/SettingsScreen'
import SyncScreen from '../../src/components/SyncScreen'
import ExportPdfScreen from '../../src/components/ExportPdfScreen'
import { IconSprite } from '../../src/ui/Icon'
import { BottomNav } from '../../src/ui/shell'
import * as fx from './fixtures'
import '../../src/styles/app.css'

/**
 * 對數用嘅殼。⛔ 唔會入正式 bundle（自己一個 vite root）。
 *
 * 用真 component、真 CSS，淨係換走 Supabase —— 咁量出嚟先算數。
 * ⛔ 唔准喺呢度另外寫 markup 扮個畫面，嗰樣量嘅係我自己畫嘅嘢，唔係真 app。
 */
const params = new URLSearchParams(location.search)
const screen = params.get('screen') ?? 'home'

/**
 * ⭐⭐ 刪工程確認彈窗，**兩個極端**：內容最短、內容最長。
 *
 * ⛔⛔ 兩邊量出嚟嘅兩粒掣座標**一定要一樣** —— 呢個就係 2026-08-11
 *    tree app 嗰單真實誤刪嘅解藥（內容變長 ⇒ 掣換咗位 ⇒ 撳錯）。
 *    ⚠️ 而且⛔ 唔止量位置，仲要量**撳唔撳得到**（見 `measure.mjs` 個 `hits`）。
 */
const LONG_NAME =
  '天水圍天恆邨恆貴樓對開行人路連停車場出入口一帶行道樹修剪及移除工程（第二期・夜更）'
const dialogRecord = {
  ...fx.RECORD,
  name: params.get('long') === '1' ? LONG_NAME : '石籬邨',
}
/** ⛔ 唔掂真 IndexedDB —— 對數要一個定死嘅樣本。 */
const dialogPhotos = async () =>
  params.get('long') === '1'
    ? Array.from({ length: 7 }, (_, i) => ({
        operationId: `對數-${i}`,
        recordId: dialogRecord.id,
        treeId: null,
        mitigation: null,
        capturedAt: '2026-09-14T09:00:00.000Z',
        size: 10,
        sha256: 'x',
        blob: new Blob(['x']),
        status: 'error' as const,
        error: '',
        attempts: 1,
      }))
    : []

const noop = async () => {}

const body =
  screen === 'settings' ? (
    <SettingsScreen
      user={{ email: 'jason223hk@gmail.com', initial: 'J' }}
      userId="00000000-0000-0000-0000-000000000000"
      recordCount={6}
      photos={fx.photosApi}
      // ⛔ `null` ＝ 唔知邊啲工程仲喺度 ⇒ 孤兒相嗰行唔會出。
      //    ⭐ 對數要量嘅係「平時嗰個樣」，⛔ 唔係一個有警示行嘅樣。
      liveRecordIds={null}
      onOpenPrices={() => {}}
      onSignOut={noop}
    />
  ) : screen === 'records' ? (
    <RecordListPage
      records={fx.RECORDS}
      loading={false}
      error={null}
      user={{ email: 'jason@x.com', initial: 'J' }}
      onOpen={() => {}}
      onCreate={() => {}}
      onRetry={() => {}}
    />
  ) : screen === 'basic' ? (
    <RecordFormPage
      record={fx.RECORD}
      siteFormApi={fx.siteFormApi}
      onSave={noop}
      onArchiveToggle={noop}
      onDelete={noop}
      onBack={() => {}}
    />
  ) : screen === 'dialog' ? (
    /* ⭐⭐ 特登照返真 app 嘅巢狀：捲動層 → swipe-wrap → 彈窗。
       ⚠️ 2026-09-14 中過：對數個殼本來就咁 render 個彈窗（唔喺捲動層裏面），
       於是把尺量唔到「俾底 nav 蓋住」嗰個 bug —— ⛔ 而真 app 就係中咗。
       ⛔ 呢兩層 div 一層都唔准拆。 */
    <div className="float-cards-scroll scroll-body scroll-body--compact">
      <div className="swipe-wrap">
        <DeleteRecordDialog
          record={dialogRecord}
          listLocal={dialogPhotos}
          onCancel={() => {}}
          onConfirm={async () => {
            // ⛔ 內容最長嗰個要出埋錯誤 —— 對數個 script 會撳一下先量。
            throw new Error(
              '伺服器唔俾改呢一單，但部機睇落你就係開單嗰個、亦都冇鎖定 —— 即係權限設定嗰邊有嘢唔對，⛔ 唔係你做錯嘢。請截圖，用 WhatsApp 搵 Jason。',
            )
          }}
        />
      </div>
    </div>
  ) : screen === 'env' ? (
    <EnvPhotosScreen api={fx.photosApi} accessToken="" record={fx.RECORD} onBack={() => {}} />
  ) : screen === 'client' ? (
    <ClientFormScreen record={fx.RECORD} onSave={noop} onBack={() => {}} />
  ) : screen === 'treephotos' ? (
    <TreePhotosScreen
      photos={fx.photosApi}
      accessToken=""
      recordId="r1"
      recordName="彩"
      tree={fx.TREES[0]}
      onEdit={() => {}}
      onDelete={() => {}}
      onBack={() => {}}
    />
  ) : screen === 'tree' ? (
    <TreeFormPage
      tree={fx.TREES[0]}
      suggestedTreeNo="6"
      otherTreeNos={['2', '3']}
      recordName="彩"
      onSave={noop}
      onDelete={noop}
      onBack={() => {}}
    />
  ) : screen === 'trees' ? (
    <TreesScreen
      api={fx.trees}
      photos={fx.photosApi}
      accessToken=""
      record={fx.RECORD}
      onBack={() => {}}
    />
  ) : screen === 'export' ? (
    <ExportPdfScreen
      trees={fx.trees}
      photos={fx.exportPhotosApi}
      accessToken=""
      record={fx.RECORD}
      onBack={() => {}}
    />
  ) : screen === 'sync' ? (
    <SyncScreen
      photos={fx.syncPhotosApi}
      trees={fx.trees}
      records={fx.RECORDS}
      onOpenRecord={() => {}}
    />
  ) : screen === 'price' ? (
    <PriceScreen api={fx.fullPriceApi} canEdit onBack={() => {}} />
  ) : screen === 'hub' ? (
    <RecordHubScreen
      api={fx.trees}
      siteFormApi={fx.siteFormApi}
      priceApi={fx.priceApi}
      photosApi={fx.photosApi}
      record={fx.RECORD}
      canEditMarkup
      onMarkupSave={async () => {}}
      nav={fx.nav}
    />
  ) : (
    <HomeScreen records={fx.RECORDS} loading={false} nav={fx.nav} />
  )

createRoot(document.getElementById('root')!).render(
  <>
    <IconSprite />
    <div className="app app--float">
      {body}
      <BottomNav
        active={
          screen === 'price' || screen === 'settings'
            ? 'settings'
            : screen === 'sync'
              ? 'sync'
              : screen === 'home'
                ? 'home'
                : 'records'
        }
        nav={fx.nav}
      />
    </div>
  </>,
)
