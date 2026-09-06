import type { PendingPhoto } from './photoUpload'

/**
 * 「未上載 N 張」個 N。**純函數，唔掂 IndexedDB、唔掂 React。**
 *
 * 規格：`docs/上線清單.md` 第 1 條第 2 項
 * 「畫面永遠見到**未上載 N 張**，⛔ N 唔係零就唔准收埋」。
 * 五條細節係 Jason 2026-09-06 睇完原型 `public/proto-pending-count.html` 拍板。
 */

/**
 * ⛔⛔ N **只數「一份雲端副本都未有」嗰啲** —— 即係部機有，但**未上到 R2**。
 *
 * ⛔ **唔數「R2 有咗但 Drive 未抄」嗰啲**（Jason 2026-09-06 揀甲）。
 *
 * ⚠️ 點解唔數埋：嗰啲相**唔會冇咗**（R2 已經有一份），但佢哋成日都未抄完 ——
 *    數埋就即係個數**長期唔會係零**。人見親都係一個數字，好快就當佢唔存在，
 *    ⭐ 咁個計數器就死咗 —— 佢淨係喺「唔係零」真係有事嗰陣先有用。
 *
 * ⚠️ `uploading` 都要數 —— 未寫得成 R2 之前，佢仍然係「得部機一份」。
 */
export function pendingCount(items: PendingPhoto[]): number {
  return items.filter((item) => item.status !== 'uploaded').length
}

/** 條 bar 上面嗰句字。⛔ 永遠淨係呢一句 —— 見 `celebrateFor` 下面嗰段。 */
export function pendingLabel(count: number): string {
  return `未上載 ${count} 張`
}

/** 上晒之後嗰句。 */
export const ALL_DONE_LABEL = '✓ 全部上晒'

/**
 * 「全部上晒」停幾耐先消失（Jason 2026-09-06 拍板：兩秒）。
 *
 * ⭐ 點解唔即刻收：阿耀要見到「做完咗」呢一下。
 * ⛔ 一個數字無端端唔見咗，同「傳完咗」係兩種感覺。
 */
export const ALL_DONE_MS = 2000

/**
 * 要唔要出「全部上晒」。
 *
 * ⭐ 只有**由有變冇**嗰一下先算 —— 開 app 嗰陣本身就係零，⛔ 唔會慶祝。
 */
export function celebrateFor(previous: number, next: number): boolean {
  return previous > 0 && next === 0
}

/**
 * ⛔⛔ 呢度**冇「冇網」版本**，係 Jason 2026-09-06 明文拍板嘅。
 *
 * 原話：**訊息要一致** —— 有網冇網都係同一句「未上載 N 張」，
 * ⛔ 唔變灰、⛔ 唔加「冇網」兩個字。
 *
 * ⚠️ 所以將來有人見到呢度冇睇 `navigator.onLine`，⛔ 唔係漏咗，⛔ 唔准補返。
 * 理由：條 bar 講嘅係**一件事實**（仲有幾多張淨喺部機），
 * 而嗰件事實同有冇網無關 —— 有網都可能傳緊、傳緊都仲係未上到。
 */
