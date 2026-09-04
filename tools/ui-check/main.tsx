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
const screen = new URLSearchParams(location.search).get('screen') ?? 'home'

const noop = async () => {}

const body =
  screen === 'settings' ? (
    <SettingsScreen
      user={{ email: 'jason223hk@gmail.com', initial: 'J' }}
      userId="00000000-0000-0000-0000-000000000000"
      recordCount={6}
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
