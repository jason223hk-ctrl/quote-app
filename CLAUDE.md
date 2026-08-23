# quote-app —— 開工前必讀

呢份嘢係俾任何開始喺呢個 repo 做嘢嘅人（人或者 AI）睇嘅。**未睇完唔好改 code。**

**匯報格式（點樣同 Jason 講嘢）睇 `docs/匯報格式.md`** —— 呢度唔重複寫。

---

## 0. 呢個 app 係做乜

**森伝現場報價記錄**（Sylvan quotation site-record）。

同事去到現場，喺手機開單記低：工程基本資料、有幾多棵樹、每棵樹做咩處理、
現場要幾多人、點清垃圾、用咩機械、起唔起樹頭。之後喺公司計價、出報價單俾客人。
中標之後呢單嘢會轉去 **tree app** 繼續做（影相、進度、交付）——即係**同一件工程嘅兩個階段**。

用家：Jason、阿耀、聰、Isaac。**現場手機用，戴住手套，成日冇訊號。**
所以設計取向永遠係：少啲自由度、多啲確定性；寧願畫面多一句字，都唔好靜靜雞出錯。

---

## 1. ⛔ 三個名一定要一模一樣

```
資料夾名   quote-app
GitHub repo  quote-app   （jason223hk-ctrl/quote-app）
app 名     quote-app   （package.json 個 name）
```

**全公司只可以有一個 quote-app repo、一個 working copy。**
唔准 `git init` 開多個、唔准 `gh repo create` 開同名嘅第二個、唔准喺第二個路徑再 clone 一份。

正式位置（Jason 部 Mac）：

```
~/Documents/Claude/Projects/Quote/quote-app
```

### 點解要咁嚴

2026-08-14 tree app 就係喺呢度出事：資料夾叫 `tra-app`、repo 叫 `tree-app-v7`、
口頭叫「tree app」——**三個名**，然後部機真係出現咗兩個唔同 repo，
搞到要查返「今日啲嘢究竟改咗邊個」。quote app 一開始就對齊三個名，就永遠唔會有呢個問題。

### 開工前自己驗一次

```bash
basename $(pwd)                            # → quote-app
git remote get-url origin                  # → https://github.com/jason223hk-ctrl/quote-app.git
node -p "require('./package.json').name"   # → quote-app
```

三行都係 `quote-app` 先好開工。如果搵到第二個目錄／第二個 repo：**停低，問 Jason**，
唔好自己揀一個嚟用，亦都唔好自己刪。

---

## 2. ⛔ 硬規矩（違反任何一條 = 唔准 merge）

### 2.1 零真刪

**冇任何嘢係真刪嘅。** 刪除只係寫 `deleted_at`，封存只係寫 `archived`。
Schema 特登**冇 delete policy、冇 grant DELETE**，所以真刪喺資料庫層面都做唔到。

- 軟刪咗嘅 row 喺 server 側就隔走（`.is('deleted_at', null)`），冇任何前端篩選攞得返出嚟。
- `archived` 同 `deleted_at` 係兩個獨立旗標，唔好撈埋一齊。
- 唔准抄 tree app 嗰個 `SECURITY DEFINER` 刪除 RPC。

### 2.2 開新表：RLS 同 GRANT 缺一不可

GRANT 決定「入唔入到張表」，RLS 決定「入到之後睇到／改到邊幾行」。
淨係開 RLS 而冇 GRANT，app 一開就會紅字 `permission denied for table quote_xxx`,
睇落好似 RLS 寫錯，其實係權限未開（2026-08-13 P1 中過一次）。

每開一張 `quote_` 表要諗齊：

- `grant select, insert, update ... to authenticated;`
- **唔 grant DELETE**（見 2.1）
- **唔 grant 俾 `anon`** —— 未登入唔應該掂到任何報價資料
- **將來如果有 Worker／背景工作要用 `service_role`，一樣要明文 grant，唔准靠預設。**
  唔明文寫，佢就會喺半夜 cron 度靜靜哋失敗，而冇人喺現場見到。

### 2.3 前端永遠唔送 `null` 落文字欄；數字欄留空就係 `null`

Schema 嘅 text 欄係 `not null default ''`。空白**一定要送空字串**。
送 `null` 就會逐個欄爆 not-null constraint，現場同事填漏一欄就落唔到單。

數字欄**相反**：留空就係 `null`，**唔准變 0**。未量度同零係兩件事——
樹高 0m 同「未量」對報價完全兩回事。

呢兩條由**一個位**負責，唔好喺個別欄位散修：

- `src/lib/records.ts` → `inputToRow()`
- `src/lib/trees.ts` → `treeInputToRow()`
- `src/lib/siteForm.ts` → `siteFormToRow()`
- `src/lib/forms.ts` → `toNumberOrNull()`

全部有 regression test 睇住。

### 2.4 表單拿走欄位 ≠ 資料庫刪欄位

欄位喺畫面消失，唔代表可以喺 DB 抹走。`main_con`、`site`、`start_time`、`odoo_ref`
由 P2.5 起唔再顯示，但舊單資料要永遠查得返，所以**呢幾個 key 完全唔會出現喺 payload**——
唔喺 payload 出現，`update` 就唔會郁佢哋。如果照送空字串，等於每次開返舊單再儲存
都靜靜刪一次資料。

### 2.5 唔准 `window.confirm`，要畫面內兩段式

現場戴住手套，瀏覽器彈窗易撳錯，而且自動化驗唔到。
做法：撳「刪除」→ 個掣變「再撳一次確認刪除」＋旁邊出「取消」→ 再撳先真正寫入。
登出都係一樣。

### 2.6 寫入之後一定要 readback

用 server 回傳嗰行做準（`.select().maybeSingle()`），然後重新攞清單。
**唔准本機砌一份 state 扮寫咗入去。**

RLS 唔會 throw，佢只係令 0 行受影響——所以「冇報錯」唔等於「做咗嘢」。
0 行一定要當被拒絕，並且同用家講清楚點解。

### 2.7 錯誤訊息一律中文，而且要寫明搵邊個、做乜嘢

阿耀、聰、Isaac 睇唔明英文 DB error。規矩：

- 畫面出**中文**，並且**指名邊個欄位**（例如「『地址』未填好，請檢查返再儲存。」）
- 求助指示要具體：**搵邊個 + 做乜**（例如「請截圖搵 Jason」、
  「資料庫嗰邊未 GRANT 俾 authenticated，要 admin 補返」）
- **英文原文照樣寫落 `console.error`**，方便查
- 唔識嘅 error 都要出中文，唔可以原封不動彈英文出嚟

實作喺 `src/lib/records.ts` 嘅 `translateDbError()`，全部 api 共用。

### 2.10 ⛔ quote app 唔會分階段推出

**要全部做好晒先至俾阿耀／聰／Isaac／Anna 用。**

**Jason 2026-08-22 原話：「qa要完全做好晒先推出比大家用」。**

**兩個直接後果：**

1. ⛔ **唔准再問「而家 merge 定遲啲 merge」** ——
   **根本冇中途 merge。**
2. ⛔ **唔准用「呢個 merge 之後先做都得」做理由去推遲任何嘢。**
   件事**照樣要做**，只係次序排後啲。

**即係話上線清單得一張：「推出前全部要做」。**
⛔ **冇 (甲)／(乙) 兩堆。**

⚠️ **驗收唔到嘅嘢照樣要留喺清單**，標「已知未驗」，
⛔ **唔准因為驗唔到就當佢消失。**

### 2.8 一張 live 相任何時候至少有兩份雲端副本

R2 加 Drive。**未鏡像到 Drive 嗰啲，唔准刪佢嘅 R2 副本**（嗰份係剩返嘅唯一一份）。
細節見 `docs/開發紀錄.md` §九。

### 2.9 Worker 要用家嘅資料，一律行用家自己個 token

**任何 Worker 需要讀用家嘅資料，行用家自己個 token，靠 RLS 攔。**
（Jason 2026-08-22 拍板，唔止一個 Worker，係通則。）

⛔ **要用 `service_role` 讀多一張表之前，一定要返嚟攞 Jason 本人批。**
⛔ **唔准當「反正 Worker 係自己人」就開。**

**理由**：`service_role` 一旦有咗 `quote_records` / `quote_trees` 嘅 `SELECT`，
**Worker 出事就等於全公司所有報價單曝光，而唔止出事嗰一張相。**

**今日已批嘅 `service_role` 權限維持原狀** —— **淨係 `quote_photos` 一張表**
（2026-08-22 Jason 本人批，為咗 P3b 寫返 Drive 狀態）。
⛔ **唔准趁機擴大。**

#### ✅ 2026-08-22 收咗埋：quote app 嗰邊 `service_role` 零權限

P3b 寫落去嗰陣發現**根本唔使用到佢** ——
寫返 `drive_file_id` / `drive_synced_at` 嗰個 update policy 係
`can_edit_quote_record(record_id)`，**用家自己個 token 就過到**。

**Jason 拍板收埋**，已經 `revoke all on` 五張 `quote_` 表 `from service_role`。
**實測驗返**（`information_schema.role_table_grants` 查晒成個 `public` schema）：
**五張 `quote_` 表一行都冇。**

`worker/wrangler.toml` 亦寫明 ⛔ **唔准加 `SUPABASE_SERVICE_ROLE_KEY`**。
（2026-08-22 `wrangler secret list` 實測：五個 secret，冇佢。）

#### ⛔ tree app 嗰啲 `service_role` 權限，一句都唔准收

同一份查詢見到 tree app 嘅 `projects` / `photos` / `trees` /
`pair_counters` / `photo_health` **仲有 `SELECT` / `UPDATE`（／`INSERT`）**。

⛔ **嗰啲係刻意保留，唔准順手清。**
**點解**：**tree app 個 webhook 冇用家 token** ——
佢係 Supabase 打過去嘅，嗰陣根本冇人登住入。
收咗佢個鏡像就會靜靜死。

#### ⚠️ 常設規矩：每開一張新 `quote_` 表，就要 revoke 一次

**Supabase 預設會喺每張新開嘅表再派權限俾 `service_role`。**

⛔ **所以「收 `service_role` 權限」唔係一次性動作，係一條常設規矩** ——
**每開一張新 `quote_` 表都要做多次。**

**唔寫低嘅話，三個月後冇人記得，而張表會靜靜咁帶住權限。**

⚠️ **連帶後果**：行用家 token 即係**只做得到喺用家仲登住入嗰陣**。
⛔ **所以唔可以有一條半夜自己行嘅 cron** —— 嗰陣冇人嘅 token。
詳情見 `docs/P3b-計劃書.md` §7.5。

---

## 3. ⛔ 邊啲嘢一定要問 Jason，唔准自己做

| 事項 | 規矩 |
| --- | --- |
| **SQL** | **一律由 Jason 跑。** 開發者／AI 唔准寫 migration、唔准改 schema、唔准 alter/drop/加 trigger |
| **改權限**（RLS、GRANT、admin） | **要 Jason 本人批**，任何人唔准代批 |
| **push 上 `main`** | **等於一次生產部署**（Cloudflare Pages 自動 build 上線）。要有意識，唔好順手 push |
| 刪除／搬移任何已有資料 | 一律問 |

### ✅ push 之前**唔使**每次攞批准（Jason 2026-08-21 拍板）

**tree app 嗰邊係每次 push 前都要攞批准，quote app 唔使。**

⚠️ **呢一條係特登同 tree app 唔同，唔係漏咗寫、唔係手民之誤。**
將來有人揸住 tree app 嗰套嚟對，會覺得呢度少咗一條規矩 —— **唔係少咗，係定咗唔要。**

**但上面張表照計數**：push 上 `main` 仍然**等於一次生產部署**，
`npm run gate` 仍然要**全綠先 push**。唔使攞批准 ≠ 可以隨手 push。

### 唔准掂嘅嘢

- **`tree-app-v7`**（Tree app，v8 生產中）—— 只可以讀嚟參考寫法，**一個字都唔准寫返去**。
  如果 clone 咗落本機做參考，clone 完即刻 `git remote remove origin`，令 push 物理上做唔到。
- **`tra-app`**
- **`tree-drive-mirror`**（Cloudflare Worker）、`tree-photos`（R2）、
  Google Drive 個 `Sylvan Tree Photos` folder —— 連 config 都唔准改。

### Supabase 係同 Tree app 真正共用嘅嘢，所以最危險

**只可以掂 `quote_` 開頭嘅表同 `quote` / `is_quote_` 開頭嘅 function。**

`projects`、`photos`、`admins` 呢啲係 Tree app 嘅，**一律唔准 alter、唔准 drop、
唔准加 trigger、唔准改 RLS 或者 GRANT，連 update 一行都唔准。**

admin 判斷用 `quote_admins` + `is_quote_admin()`，**唔係** tree app 嗰個 `admins` 表。
抄 tree app 嘅 code 嗰陣好容易接錯表，呢個係真·危險位。

---

## 4. 部署

| 設定 | 值 |
| --- | --- |
| Cloudflare Pages project | `sylvan-quote` |
| 網址 | https://sylvan-quote.pages.dev |
| Production branch | `main` |
| Build command | `npm run build`（output `dist`） |
| 環境變數 | `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` |

**push 上 `main` = 一次生產部署。** 冇 staging branch。

上線前一定要 `npm run gate` 全綠（typecheck → lint → test → build）。
上線後開網址核對底部／設定頁嘅 Build ID，個 short SHA 要同最新 commit 對得返。

只用 **publishable (anon) key**。`service_role` / secret key 絕對唔可以入前端或者 repo。
`.env.local` 喺 `.gitignore`，真值唔准 commit。

---

## 5. 而家做到邊（P0 → P2.6）

| 階段 | 做咗乜 | Commit |
| --- | --- | --- |
| **P0** | Vite + React + TS 骨架、Supabase Auth 登入、Build ID、部署鏈驗證、冇環境變數唔白畫面 | `27fa873` |
| **P1** | `quote_records` 資料層、永久紀錄清單（搜尋／日期／封存篩選）、基本資料頁、封存＋軟刪 | `15a2acd` |
| **P1 修復** | 空欄位送 `null` 撞 not-null（blocker）、地區／日夜改必填、DB error 譯中文、刪除改兩段式 | `064f06e` |
| **P2** | `quote_trees` 樹木清單（撞編號警告）、`quote_site_form` 四組現場資料表（全部任揀、冇互斥） | `41f1798` |
| **P2.5** | 新增工程表單改版（工程名稱／地址／地區必填）、GPS 定位 + Nominatim 反查 + 十八區對應 | `39b4a3e` |
| **P2.6** | 換皮：抄 tree app 個 shell（波浪頭、浮卡、三粒底 tab、工程詳情 hub），主色改深啡 | `83396fb` |

**Rollback 目標：出事就返上一個階段嘅 commit。** 而家嘅 last-known-good 係 **`83396fb`**。
Cloudflare Pages 側亦可以喺 Deployments 面板 rollback 返上一個 deployment。

未做（唔好自己開）：相片、成本、markup、PDF、地圖、轉工程（P6）、狀態選擇器、同步頁。

詳細嘅技術決定同理由喺 `README.md`（顏色、兩個 app 都叫「工程」、GPS 守則、
十八區點解要整格比對）。

---

## 6. 日常指令

```bash
npm install
cp .env.example .env.local   # 再填返真值
npm run dev

npm run gate                 # typecheck → lint → test → build，push 前一定要全綠
```

測試全部喺 `src/lib/*.test.ts`（純函數，唔依賴 UI）。
換 UI 唔應該令佢哋跌——**跌咗即係郁咗唔應該郁嘅嘢**。

---

## 7. 待決定（唔准自己拍板）

- **`quote-app-prototype.html`**（Jason 由 `~/Downloads` 搬入 repo 嗰個原型稿）：
  要 commit 入 repo 做參考，定係加入 `.gitignore` 當佢係本機草稿？

  **建議**（未批准，等 Jason 決定）：commit 入去。佢係設計原型，值得留低歷史；
  唔會被 build（Vite 只食 `index.html` 同 `src/`），亦唔會影響 bundle。
  如果 Jason 覺得唔想入 repo，就喺 `.gitignore` 加一行 `quote-app-prototype.html`。

  **喺 Jason 講之前，兩樣都唔好做。**
