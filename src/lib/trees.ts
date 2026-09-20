import type { SupabaseClient } from '@supabase/supabase-js'
import { translateDbError } from './records'
import {
  isBlankOrNonNegativeNumber,
  numberToInput,
  toNumberOrNull,
  type Errors,
} from './forms'
import { MITIGATION_OTHER } from './options'

/** quote_trees 一行。lat / lng / location_adjusted 係後面 phase 嘅嘢，呢度唔碰。 */
export type QuoteTree = {
  id: string
  record_id: string
  sort_order: number
  tree_no: string
  species: string
  height_m: number | null
  dbh_mm: number | null
  crown_m: number | null
  mitigations: string[]
  mitigation_other: string
  note: string
  lat: number | null
  lng: number | null
  location_adjusted: boolean
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TreeInput = {
  tree_no: string
  species: string
  height_m: string
  dbh_mm: string
  crown_m: string
  mitigations: string[]
  mitigation_other: string
  note: string
}

export const EMPTY_TREE_INPUT: TreeInput = {
  tree_no: '',
  species: '',
  height_m: '',
  dbh_mm: '',
  crown_m: '',
  mitigations: [],
  mitigation_other: '',
  note: '',
}

export type TreeErrors = Errors<TreeInput>

/**
 * 表單 → DB。
 * 文字欄永遠送空字串唔送 null（P1 教訓）；數字欄留空就係 null，唔准變零。
 */
export function treeInputToRow(input: TreeInput): Record<string, unknown> {
  const mitigations = input.mitigations
  return {
    tree_no: input.tree_no.trim(),
    species: input.species.trim(),
    height_m: toNumberOrNull(input.height_m),
    dbh_mm: toNumberOrNull(input.dbh_mm),
    crown_m: toNumberOrNull(input.crown_m),
    mitigations,
    // 冇揀 other 就唔應該留低舊嘅其他描述。
    mitigation_other: mitigations.includes(MITIGATION_OTHER) ? input.mitigation_other.trim() : '',
    note: input.note.trim(),
  }
}

export function treeToInput(tree: QuoteTree): TreeInput {
  return {
    tree_no: tree.tree_no ?? '',
    species: tree.species ?? '',
    height_m: numberToInput(tree.height_m),
    dbh_mm: numberToInput(tree.dbh_mm),
    crown_m: numberToInput(tree.crown_m),
    mitigations: tree.mitigations ?? [],
    mitigation_other: tree.mitigation_other ?? '',
    note: tree.note ?? '',
  }
}

export function validateTree(input: TreeInput): TreeErrors {
  const errors: TreeErrors = {}
  if (!isBlankOrNonNegativeNumber(input.height_m)) errors.height_m = '樹高要填數字（米），或者留空'
  if (!isBlankOrNonNegativeNumber(input.dbh_mm)) errors.dbh_mm = 'DBH 要填數字（毫米），或者留空'
  if (!isBlankOrNonNegativeNumber(input.crown_m)) errors.crown_m = '冠幅要填數字（米），或者留空'
  return errors
}

/** 新樹自動派下一個號：睇現有最大嘅數字編號 +1，改得。 */
export function nextTreeNo(trees: QuoteTree[]): string {
  const numbers = trees
    .map((tree) => Number(tree.tree_no))
    .filter((value) => Number.isFinite(value))
  const max = numbers.length > 0 ? Math.max(...numbers) : 0
  return String(Math.max(max, trees.length) + 1)
}

/**
 * 撞編號嘅樹。只係出黃字警告，唔會禁止儲存——現場真係會撞。
 * 空編號唔當撞。
 */
export function duplicateTreeNos(trees: QuoteTree[]): string[] {
  const seen = new Map<string, number>()
  for (const tree of trees) {
    const key = tree.tree_no.trim()
    if (key === '') continue
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key)
}

export type TreesApi = {
  list: (recordId: string) => Promise<QuoteTree[]>
  /** 成間公司所有樹。同步頁要靠佢將 `tree_id` 換返做樹牌號，⛔ 唔可以逐棵樹打一次 DB。 */
  listAll: () => Promise<QuoteTree[]>
  create: (recordId: string, input: TreeInput, sortOrder: number) => Promise<QuoteTree>
  update: (id: string, input: TreeInput) => Promise<QuoteTree>
  softDelete: (id: string) => Promise<QuoteTree>
}

function reportError(message: string): Error {
  console.error('[quote-app] DB error:', message)
  return new Error(translateDbError(message))
}

const NO_ROW_MESSAGE = '無法修改這棵樹。可能所屬工程已經鎖定，或者不是你建立的工程。'

export function createTreesApi(client: SupabaseClient, userId: string): TreesApi {
  async function writeBack(
    promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<QuoteTree> {
    const { data, error } = await promise
    if (error) throw reportError(error.message)
    if (!data) throw new Error(NO_ROW_MESSAGE)
    return data as QuoteTree
  }

  function patch(id: string, values: Record<string, unknown>) {
    return client
      .from('quote_trees')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle()
  }

  return {
    async listAll() {
      const { data, error } = await client
        .from('quote_trees')
        .select('*')
        .is('deleted_at', null)

      if (error) throw reportError(error.message)
      return (data ?? []) as QuoteTree[]
    },

    async list(recordId) {
      const { data, error } = await client
        .from('quote_trees')
        .select('*')
        .eq('record_id', recordId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw reportError(error.message)
      return (data ?? []) as QuoteTree[]
    },

    create(recordId, input, sortOrder) {
      return writeBack(
        client
          .from('quote_trees')
          .insert({
            ...treeInputToRow(input),
            record_id: recordId,
            sort_order: sortOrder,
            created_by: userId,
          })
          .select()
          .maybeSingle(),
      )
    },

    update(id, input) {
      return writeBack(patch(id, treeInputToRow(input)))
    },

    softDelete(id) {
      // 零真刪：只寫 deleted_at。
      return writeBack(patch(id, { deleted_at: new Date().toISOString() }))
    },
  }
}
