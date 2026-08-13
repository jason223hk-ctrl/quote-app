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

const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ')
const buildId = `${resolveShortSha()} · ${buildTime}Z`

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
