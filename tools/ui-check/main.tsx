import { createRoot } from 'react-dom/client'
import HomeScreen from '../../src/components/HomeScreen'
import RecordHubScreen from '../../src/components/RecordHubScreen'
import PriceScreen from '../../src/components/PriceScreen'
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

const body =
  screen === 'price' ? (
    <PriceScreen api={fx.fullPriceApi} canEdit onBack={() => {}} />
  ) : screen === 'hub' ? (
    <RecordHubScreen
      api={fx.trees}
      siteFormApi={fx.siteFormApi}
      priceApi={fx.priceApi}
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
        active={screen === 'price' ? 'settings' : screen === 'hub' ? 'records' : 'home'}
        nav={fx.nav}
      />
    </div>
  </>,
)
