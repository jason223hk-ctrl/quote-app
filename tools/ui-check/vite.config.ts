import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 對數用嘅獨立 build。⛔ 唔關正式 app 事 —— 佢自己一個 root、自己一個 dist，
 * `npm run build` 唔會掃到呢度。
 */
export default defineConfig({
  root: __dirname,
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [react()],
  // `src/ui/version.ts` 讀呢兩個。⛔ 唔定義嘅話成頁 render 唔到，
  // 而對數就會靜靜咁量到零項 —— 睇落好似「全對」。
  define: {
    __BUILD_SHA__: JSON.stringify('uicheck'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
