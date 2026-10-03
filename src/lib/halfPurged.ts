import type { SupabaseClient } from '@supabase/supabase-js'
import { translateDbError } from './records'

/**
 * P8 步 5：「刪咗一半」嘅工程 —— `quote_records.deleted_at` 有值，
 * 但仲有相 `quote_photos.purged_at` 係空（計劃書 §3.1：呢個狀態本身就係記帳，
 * ⛔ 唔使另開一張表）。
 *
 * ⭐ 設定頁「診斷資料」用嚟出一行「有 N 張相片刪了一半」＋ 一粒「繼續清」。
 * ⛔ N 係零就成行唔出（同 PR #19 同一條規矩）。
 */

/**
 * 由幾時開始刪嘅工程先算。
 *
 * ⚠️⚠️ **AI 代揀，待 Jason 確認。**
 *   呢個 PR 之前刪嘅工程，刪嗰陣個彈窗寫住「後台**仍可取回**」——
 *   嗰陣嘅人係**照住「攞得返」去撳**。⛔ 唔可以而家喺設定頁擺一粒掣，
 *   當佢哋係「清咗一半」咁叫人清走。
 *   ⇒ 揀保守嗰邊：**呢個時間之前刪嘅單，⛔ 一律唔出、⛔ 唔清。**
 *   ⇒ 要清舊單，另外問 Jason。
 *   ⚠️ merge 嗰陣應該改做 merge 嘅時間（UTC）：由今日到 merge 之間喺正式版刪嘅單，
 *      刪嗰陣仍然係「仍可取回」嗰套字。
 */
export const PURGE_FEATURE_SINCE = '2026-10-03T08:00:00Z'

export type HalfPurgedRecord = {
  recordId: string
  name: string
  /** 仲未 stamp `purged_at` 嘅相。 */
  photos: number
}

/** 純邏輯：分組數。⛔ 唔喺已刪清單入面嘅相唔數（佢哋嘅單仲喺度）。 */
export function groupHalfPurged(
  deleted: { id: string; name: string; deleted_at: string | null }[],
  unpurged: { record_id: string; purged_at: string | null }[],
  since: string = PURGE_FEATURE_SINCE,
): HalfPurgedRecord[] {
  const sinceMs = Date.parse(since)
  const byId = new Map<string, HalfPurgedRecord>()
  for (const record of deleted) {
    if (record.deleted_at === null) continue
    if (!(Date.parse(record.deleted_at) >= sinceMs)) continue
    byId.set(record.id, { recordId: record.id, name: record.name, photos: 0 })
  }
  for (const row of unpurged) {
    if (row.purged_at !== null) continue
    const hit = byId.get(row.record_id)
    if (hit) hit.photos += 1
  }
  return [...byId.values()].filter((item) => item.photos > 0)
}

export function halfPurgedPhotoCount(items: HalfPurgedRecord[]): number {
  return items.reduce((sum, item) => sum + item.photos, 0)
}

/** 設定頁嗰行字。⛔ 零就回 `null`（成行唔出）。 */
export function halfPurgedNote(items: HalfPurgedRecord[]): string | null {
  const photos = halfPurgedPhotoCount(items)
  if (photos <= 0) return null
  return `有 ${photos} 張相片刪了一半（雲端未清乾淨），屬於 ${items.length} 單已刪除的工程`
}

export const HALF_PURGED_CHECK_FAILED =
  '現在無法檢查有沒有清了一半的相片。請檢查網絡連線後，向下拉重新整理。'

/**
 * 讀「刪咗一半」嗰批。**⛔ 失敗要 throw，⛔ 唔准回 `[]`** —— `[]` 會令人以為冇嘢未清。
 *
 * ⭐ 兩張表條 select policy 都係 `using (true)`，用家自己個 token 讀得到已刪嘅單。
 */
export async function listHalfPurged(client: SupabaseClient): Promise<HalfPurgedRecord[]> {
  const { data: records, error: recordsError } = await client
    .from('quote_records')
    .select('id,name,deleted_at')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', PURGE_FEATURE_SINCE)
  if (recordsError) {
    console.error('[quote-app] DB error:', recordsError.message)
    throw new Error(translateDbError(recordsError.message))
  }
  const deleted = (records ?? []) as { id: string; name: string; deleted_at: string | null }[]
  if (deleted.length === 0) return []

  const unpurged: { record_id: string; purged_at: string | null }[] = []
  const ids = deleted.map((record) => record.id)
  // ⭐ 分段問，⛔ 唔好砌一條過長嘅網址。
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await client
      .from('quote_photos')
      .select('id,record_id,purged_at')
      .is('purged_at', null)
      .in('record_id', ids.slice(i, i + 50))
    if (error) {
      console.error('[quote-app] DB error:', error.message)
      throw new Error(translateDbError(error.message))
    }
    unpurged.push(...((data ?? []) as { record_id: string; purged_at: string | null }[]))
  }

  return groupHalfPurged(deleted, unpurged)
}
