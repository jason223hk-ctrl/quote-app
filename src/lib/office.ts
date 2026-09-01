import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 係咪辦公室（quote_admins 有你）。
 *
 * ⛔ 呢個淨係用嚟決定「畫面畀唔畀你改」。真正把關係 DB 嘅 RLS ——
 * 就算前端呃到自己係 admin，寫落去一樣會俾 RLS 彈返轉頭。
 * ⭐ 所以呢度出錯（查唔到、斷網）一律當**唔係**辦公室：
 *    寧願見到但改唔到，⛔ 都好過畀你改完先話你知冇權限。
 *
 * 而家用嚟守：加成 %（Jason 2026-08-30 拍板 —— 加成直接決定報畀客嘅價，
 * 同「改單價」係同一類決定）同單價設定。
 */
export async function isOffice(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('quote_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[quote-app] 查唔到辦公室權限：', error.message)
    return false
  }
  return data !== null
}
