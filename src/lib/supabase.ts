import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig, type ConfigResult } from './env'

export const configResult: ConfigResult = readSupabaseConfig(
  import.meta.env as unknown as Record<string, string | undefined>,
)

/**
 * 冇環境變數就唔建 client（createClient 會 throw），而係留 null，
 * 由 App 顯示「未設定 Supabase 連線」。
 */
export const supabase: SupabaseClient | null = configResult.ok
  ? createClient(configResult.config.url, configResult.config.publishableKey)
  : null
