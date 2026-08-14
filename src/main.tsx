import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const container = document.getElementById('root')

if (!container) {
  throw new Error('搵唔到 #root，index.html 有問題')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
