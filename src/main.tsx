import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { IconSprite } from './ui/Icon'

const container = document.getElementById('root')

if (!container) {
  throw new Error('檢索不到 #root，index.html 有問題')
}

createRoot(container).render(
  <StrictMode>
    {/* 四十六個 icon symbol 一次過入 DOM。⛔ 要喺 App 之上，唔係逐版插一次。 */}
    <IconSprite />
    <App />
  </StrictMode>,
)
