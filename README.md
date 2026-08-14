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

## 資料庫規矩（開新表之前一定要睇）

**每開一張 `quote_` 表，除咗 RLS policy，一定要有對應嘅 GRANT，兩樣缺一不可。**

GRANT 決定「入唔入到張表」，RLS 決定「入到之後睇到／改到邊幾行」。淨係開 RLS 而冇
GRANT，app 一開就會紅字 `permission denied for table quote_xxx`，睇落好似 RLS 寫錯，
其實係權限未開。（2026-08-13 P1 就係咁中過一次。v7 張 `projects` 表一直有 GRANT，新表要跟返。）

現時已經跑咗嘅（P1，由 Jason 執行）：

```
grant select, insert, update on quote_records, quote_admins to authenticated;
grant execute on function is_quote_admin() to authenticated;
```

刻意唔做嘅兩樣，之後開新表都要跟：

- **唔 grant DELETE** —— 唔可以真刪，只可以寫 `deleted_at`。
- **唔 grant 俾 `anon`** —— 未登入唔應該掂到任何報價資料。

另外，schema 側 text 欄係 `not null default ''`，所以前端**永遠唔可以送 `null`**，
空白要送空字串。呢個規矩由 `src/lib/records.ts` 嘅 `inputToRow()` 一個位負責，
有 regression test 睇住，唔好喺個別欄位度散修。

數字欄相反：**留空就係 `null`，唔准變 0**。未量度同零係兩件事（樹高 0m 同「未量」
對報價完全兩回事）。

### 表單拿走欄位嘅時候

欄位喺表單消失 ≠ 喺 DB 消失。`main_con`、`site`、`start_time`、`odoo_ref` 由 P2.5
起唔再顯示，但舊單資料要永遠查得返，所以**呢幾個 key 完全唔會出現喺 `inputToRow()`
嘅 payload**——唔喺 payload 出現，`update` 就唔會郁佢哋。如果照送空字串，等於每次
開返舊單再儲存都靜靜刪一次資料。有 regression test 睇住。

## GPS 同地址反查

- 反查用 OpenStreetMap Nominatim 嘅 `/reverse`（`format=jsonv2`、`zoom=18`、
  `accept-language=zh-HK,zh,en`）。
- **只可以喺用家撳「用 GPS 定位」嗰陣發一次請求**：冇 debounce、冇 autocomplete、
  冇連環快發，同一組座標唔會查第二次（`coordsKey` 記住上次結果）。
- 地址欄附近長期顯示「地址資料來自 OpenStreetMap」，係佢哋條款要求嘅出處標示。
- 十八區 → 地區嘅對應喺 `src/lib/districts.ts`，係**整格比對唔係包含比對**：
  「North Point」喺東區（HK），用包含就會誤中「North」＝北區（NT），夾車同吊機價
  即刻報錯。認唔到就留返地區未揀 + 出「認唔到地區，請自己揀」，**唔准估**。
- `address_source` / `region_source` 係 `gps` 嗰陣，欄位下面出「由 GPS 自動填，請確認」；
  用家一改嗰個欄，來源即刻變返 `manual`。
- 攞唔到定位、反查失敗、冇網，全部出中文一句，而且地址欄照打得字、照儲存得。
  座標攞到但反查失敗，一定要照存座標。

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
