import { describe, expect, it } from 'vitest'
import { readSupabaseConfig } from './env'

describe('readSupabaseConfig', () => {
  it('兩個變數齊全時回傳 config', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    })

    expect(result).toEqual({
      ok: true,
      config: { url: 'https://example.supabase.co', publishableKey: 'publishable-key' },
    })
  })

  it('完全冇環境變數時報缺失，唔會 throw（避免白畫面）', () => {
    const result = readSupabaseConfig({})

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.missing).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])
  })

  it('空字串或空白當作未設定', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: '   ',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.missing).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY'])
  })

  it('會 trim 頭尾空白', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: '  https://example.supabase.co  ',
      VITE_SUPABASE_PUBLISHABLE_KEY: ' key ',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'key',
    })
  })
})
