/**
 * 全 app 唯一嘅版本來源，格式照 tree-app-v7 `src/ui/screens.tsx` 嘅 VERSION_LABEL：
 *   v0.1 · Build <short sha> · <HHmm>
 * 產品版本同 Build ID 分開；HHmm 係裝置本地時間，方便部機一眼確認攞咗最新 bundle。
 */
const APP_VERSION = 'v0.1'

export const BUILD_SHA = __BUILD_SHA__.replace(/-dirty$/, '')

function buildStamp(): string {
  const d = new Date(__BUILD_TIME__)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${p(d.getHours())}${p(d.getMinutes())}`
}

const BUILD_STAMP = buildStamp()

export const VERSION_LABEL = `${APP_VERSION} · Build ${BUILD_SHA}${
  BUILD_STAMP ? ` · ${BUILD_STAMP}` : ''
}`
