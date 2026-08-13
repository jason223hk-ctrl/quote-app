# quote-app — 森伝現場報價記錄

Sylvan quotation site-record app。獨立 repo，同 tree-app-v7 冇任何共用檔案或設定
（只係共用同一個 Supabase project 做認證）。

現時階段：**P0 骨架 + 部署鏈驗證**。只有登入 / 登出 / 空白主頁 / Build ID，
未有任何報價資料表、樹木、相片、成本、PDF、地圖功能。

## Stack

| 項目 | 用咩 |
| --- | --- |
| Build | Vite 7 |
| UI | React 19 + TypeScript 5.9 |
| 認證 | Supabase Auth（email + password，publishable key） |
| 樣式 | 純 CSS + design tokens（`src/styles/tokens.css`），冇 Tailwind |
| Lint | ESLint 9 flat config + typescript-eslint |
| Test | Vitest |

品牌主色：Hedge Green `#768A75`。手機優先（`max-width: 480px` 單欄、觸控目標 48px、
輸入框 16px 避免 iOS 自動 zoom）。

## 本機開發

```bash
npm install
cp .env.example .env.local   # 再填返真值
npm run dev
```

### Scripts

| 指令 | 做咩 |
| --- | --- |
| `npm run dev` | 開發 server |
| `npm run build` | `tsc -b && vite build` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | `eslint .` |
| `npm run test` | `vitest run` |
| `npm run gate` | typecheck → lint → test → build 一次過（push 前一定要全綠） |

## 環境變數

| 變數 | 用途 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |

規則：

- 只用 **publishable (anon) key**。`service_role` / secret key 絕對唔可以入前端或者 repo。
- `.env.local` 已經喺 `.gitignore`，真值唔會 commit。`.env.example` 只留空值做範本。
- **冇環境變數唔會白畫面**：`src/lib/env.ts` 會檢查兩個變數，缺任何一個就顯示
  「未設定 Supabase 連線」同埋列明邊個變數未設定，唔會 crash。

## Build ID

`vite.config.ts` 用 Vite `define` 注入 `__BUILD_ID__` = git short SHA + build 時間。
SHA 來源優先次序：Cloudflare Pages 嘅 `CF_PAGES_COMMIT_SHA` → 本機 `git rev-parse` → `nogit`。

畫面底部長期顯示 `Build ID：v0.1 · <sha> · <build time>Z`，用嚟核對線上跑緊邊個 commit。

## Cloudflare Pages 部署

| 設定 | 值 |
| --- | --- |
| Project | `sylvan-quote` |
| 網址 | https://sylvan-quote.pages.dev |
| Production branch | `main` |
| Framework preset | React (Vite) |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` |

Push 上 `main` 就會自動 build 同部署到 production。驗收方法：開網址睇底部 Build ID
入面嘅 short SHA，要同最新 commit 對得返。

部署鏈已經喺 P0 驗證過：main 每次收到新 commit，線上 Build ID 入面個 short SHA 都會跟住轉。

改咗環境變數之後要重新 build 先生效（Vite 係 build 時 inline 環境變數，唔係 runtime 讀）。
