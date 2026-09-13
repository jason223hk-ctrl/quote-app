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
import SettingsScreen from '../../src/components/SettingsScreen'
import SyncScreen from '../../src/components/SyncScreen'
import ExportPdfScreen from '../../src/components/ExportPdfScreen'
import PendingBar from '../../src/components/PendingBar'
import { photoStore } from '../../src/lib/photoStore'
import type { PendingPhoto } from '../../src/lib/photoUpload'
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
 * `?pending=N` ⇒ 落 N 張「未上載」嘅相入部機，然後掛埋條「未上載 N 張」bar。
 *
 * ⭐⭐ **點解要落真種、⛔ 唔係自己畫一條 bar 出嚟**：
 *    條 bar 個數係 `usePendingCount()` 讀 IndexedDB 數出嚟嘅，而佢擺幾高
 *    係 `ResizeObserver` 度返 nav 實際高度再計。⛔ 自己畫一條就三樣都係假：
 *    假個數、假位置、假高度 —— ⚠️ 咁量出嚟嘅係我自己畫嘅嘢，唔係真 app。
 *
 * ⛔ 冇呢個參數就一張都唔落、條 bar 唔會出 ⇒ 其餘 13 個畫面量到嘅嘢**一模一樣**。
 */
const pendingSeed = Number(params.get('pending') ?? '0')

function seedPending(count: number): Promise<unknown> {
  const items: PendingPhoto[] = Array.from({ length: count }, (_, i) => ({
    operationId: `對數-${i}`,
    recordId: '1',
    treeId: null,
    mitigation: null,
    capturedAt: '2026-09-14T09:00:00.000Z',
    size: 10,
    sha256: 'x',
    blob: new Blob(['x']),
    status: 'error',
    error: '',
    attempts: 1,
  }))
  return Promise.all(items.map((item) => photoStore.put(item)))
}

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

const shell = (
  <>
    <IconSprite />
    <div className="app app--float">
      {body}
      {/* ⛔ 冇 `?pending=N` 就唔掛 —— 唔係嘅話 13 個畫面全部要重新對數。 */}
      {pendingSeed > 0 && <PendingBar onOpenSync={() => {}} />}
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
  </>
)

// ⭐ 落完種先 render —— ⛔ 唔係嘅話條 bar 第一次量嗰陣個數仲係 0，
//    而對數個 script 唔知要等幾耐（⚠️ 「等 700ms」係一個賭，唔係一個保證）。
const ready = pendingSeed > 0 ? seedPending(pendingSeed) : Promise.resolve()
void ready
  .catch((caught: unknown) => {
    console.error('[ui-check] seed pending failed:', caught)
  })
  .then(() => {
    createRoot(document.getElementById('root')!).render(shell)
  })
