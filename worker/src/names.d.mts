/**
 * ⛔ 呢個 `.d.mts` **淨係** 畀 `src/lib/pdfNames.test.ts` 用 ——
 *    嗰條測試要 import worker 真嗰份嚟同前端對答案。
 *
 * ⛔ 唔准喺 `src/` 嘅**正式 code** 度 import 呢個 module：
 *    worker 行喺 Cloudflare，唔喺 browser bundle 入面。
 */
export function safeFilename(name: string): string
export function projectFolderName(workDate: string | null, name: string | null): string
export function pairedNumber(seq: number): string | null
export function photoFilename(
  treeNo: string,
  token: string | null | undefined,
  seq: number,
): string | null
export function sitePhotoFilename(seq: number): string | null
export const MITIGATION_TOKENS: Record<string, string | undefined>
