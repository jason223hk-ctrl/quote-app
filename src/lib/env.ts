/**
 * 環境變數讀取。刻意寫成純函數，方便測試，亦確保「冇環境變數」係一個明確狀態，
 * 唔會靜靜雞變白畫面（v7 教訓）。
 */

export const REQUIRED_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const

export type SupabaseConfig = {
  url: string
  publishableKey: string
}

export type ConfigResult =
  | { ok: true; config: SupabaseConfig }
  | { ok: false; missing: string[] }

type EnvSource = Record<string, string | undefined>

export function readSupabaseConfig(env: EnvSource): ConfigResult {
  const missing = REQUIRED_ENV_KEYS.filter((key) => {
    const value = env[key]
    return typeof value !== 'string' || value.trim() === ''
  })

  if (missing.length > 0) return { ok: false, missing }

  return {
    ok: true,
    config: {
      url: (env.VITE_SUPABASE_URL as string).trim(),
      publishableKey: (env.VITE_SUPABASE_PUBLISHABLE_KEY as string).trim(),
    },
  }
}
