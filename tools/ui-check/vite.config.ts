import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 對數用嘅獨立 build。⛔ 唔關正式 app 事 —— 佢自己一個 root、自己一個 dist，
 * `npm run build` 唔會掃到呢度。
 */
export default defineConfig({
  root: __dirname,
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [react()],
  // `src/ui/version.ts` 讀呢兩個。⛔ 唔定義嘅話成頁 render 唔到，
  // 而對數就會靜靜咁量到零項 —— 睇落好似「全對」。
  define: {
    __BUILD_SHA__: JSON.stringify('uicheck'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    /*
     * ⛔⛔ **一定要有一個值，⛔ 唔可以留空。**
     *
     * ⚠️⚠️ 2026-09-20 揾到：呢度冇定過佢 ⇒ `photoWorkerBase()` 回空字串
     *    ⇒ **每一格相上面都多咗一段 102px 嘅「未設定相片上傳服務」黃色警告**
     *    ⇒ 一張相片卡由現場真實嘅 **212px 發水到 328px**。
     *
     * ⭐⭐ 即係話：喺呢個 harness 度量相片頁，量到嘅**唔係 Jason 部機嗰個畫面**。
     *    ⚠️ 而量錯嘅方向係「**比現場差**」—— 同 #40 嗰次「比現場鬆」係一對。
     *    ⛔ 兩邊都係假嘅。（我自己 2026-09-20 就係用呢個發水版量出咗一個
     *      錯嘅 `y 885`，然後拎住佢去問 Jason。）
     *
     * ⭐ 呢個網址**永遠唔會被呼叫**：對數用嘅係 `fixtures.ts` 嗰個假 API，
     *   一個 byte 都唔會上載。`.invalid` 係 RFC 2606 保留嘅，⛔ 解析唔到。
     *
     * ⛔ 驗過：加咗佢之後，其餘 15 組尺嘅數字**一個都冇變**。
     */
    'import.meta.env.VITE_PHOTO_WORKER_URL': JSON.stringify('https://ui-check.invalid'),
  },
})
