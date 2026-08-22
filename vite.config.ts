import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Build ID = git short SHA + build time（同 tree-app-v7 做法）。
 * Cloudflare Pages 嘅 build container 有 CF_PAGES_COMMIT_SHA，本機就用 git。
 * 兩者都攞唔到就寫 'nogit'，唔可以令 build 失敗。
 */
function resolveShortSha(): string {
  const fromPages = process.env.CF_PAGES_COMMIT_SHA
  if (fromPages) return fromPages.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'nogit'
  }
}

// 同 tree-app-v7 一樣分開兩個常數（BUILD_SHA / BUILD_TIME），
// 版本字串喺 src/ui/version.ts 砌，格式跟佢：v0.1 · Build <sha> · <HHmm>
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(resolveShortSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: 'node',
    // Worker 嗰邊嘅純函數（檔名規則）都要測 —— 佢係 .mjs，唔喺 src/ 入面。
    // ⚠️ 呢一行淨係屬於呢條 branch。`main` 冇 worker/，所以 main 唔應該有佢。
    include: ['src/**/*.test.ts', 'worker/**/*.test.mjs'],
  },
})
