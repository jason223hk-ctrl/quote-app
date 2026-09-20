# quote-photos-sign

**一句講晒：呢個 Worker 淨係簽網址，一個 byte 都唔會經過佢。**

P3a 用。部機影完相之後問佢攞一條 R2 上傳網址，跟住**部機自己直接上 R2**。

## 部署狀態

**已經部署：`https://quote-photos-sign.jason223hk.workers.dev`**

⚠️ 呢一段本來寫住「⛔ 未部署」，一直冇更新過 —— 2026-09-03 查實先發現佢已經
上咗（真相入咗 Drive、`/sign` 同 `/mirror` 都行緊）。⛔ 一份講「乜都未上」嘅
README 比冇 README 更差：睇嘅人會以為線上冇嘢，然後放心改。

⛔ 部署 Worker、改 Cloudflare secrets 一律 Jason 親手做。

## 四條路

- **`POST /sign`**（P3a）—— 簽 R2 上傳網址
- **`POST /mirror`**（P3b）—— 抄一份上 Google Drive，寫返 `drive_file_id`
- **`POST /read`**（P5，匯出 PDF）—— 出一條**淨係讀**嘅簽名網址，攞返張相嘅 bytes
- **`POST /purge`**（P8 步 3）—— 一單工程刪咗之後，**真係清走**雲端嗰兩份相

  ⛔ 點解唔用 `/sign`：`/sign` 個 key 係 `{呼叫者 userId}/{影相編號}.jpg`，
  即係你淨係簽得到**自己**影嗰啲。阿耀影嘅相，Jason 喺辦公室匯出 PDF 就簽唔到，
  出嚟嘅 PDF 會靜靜咁少咗幾張。⇒ `/read` 一律用行入面嗰個 `r2_key`。

  ⭐ 把關全部交返 RLS：由頭到尾用**用家個 token** 去 select，佢睇唔到嗰行就 404。
  ⛔ 冇用 service role key、⛔ 只出 GET、⛔ 未上到 R2 就回 409（唔出條網址扮有）。

## 佢做咩、唔做咩

**做：**

1. 收一個 Supabase 登入 token，問 Supabase「呢個 token 係邊個」
2. 用**佢自己驗返嚟嘅用戶 id** 砌檔名 `{用戶id}/{影相編號}.jpg`
3. 簽一條 PUT（上傳）同一條 GET（讀返出嚟對數）網址，15 分鐘到期

**⛔ 唔做：**

- **唔中轉 bytes** —— `docs/P3-現場影相-設計.md` 第三章寫死嘅
- **`/sign` 唔查資料庫** —— P3a 零 DB 查詢
- **`/mirror` 由頭到尾行用家自己個 token**，靠 RLS 攔（`CLAUDE.md` §2.9）。
  ⛔ **唔開新 grant，亦都冇 `service_role` key。**
  三個動作用家自己都做得到：讀相片嗰行（`select using (true)`）、
  讀工程同棵樹（一樣）、寫返 Drive 狀態
  （`update using can_edit_quote_record(record_id)`）
- ⛔ **`/mirror` 唔會再壓一次啲 bytes** —— 由 R2 讀出嚟原封不動上 Drive，
  再壓 `sha256` 就唔同，「仲剩幾多份」個契約即刻驗唔到
- **唔信前端俾嘅檔名** —— 前端只講得出影相編號，講唔到自己係邊個
- **唔掂 `tree-photos`** —— 只寫 `quote-photos`

## `/rename-tree`（2026-09-16 加，✅ **2026-09-19 已部署**，Version `77d5eeb9`）

改樹牌 ⇒ 連 Drive 舊檔名一齊改（**Jason 2026-08-24 拍板**，`docs/P3f-全app版面-實作計劃.md` §4）。

```
POST /rename-tree     { "treeId": "…" }      Authorization: Bearer <用家個 token>
```

- ⛔ **由頭到尾用家自己個 token**（`CLAUDE.md` §2.9）—— ⛔ 冇 `service_role`。
  ⚠️ 即係話呢條路**淨係喺人仲登住入嗰陣行得**，⛔ 唔可以有 cron 幫手補。
- ⛔ **唔收呼叫者傳入嚟嘅樹牌** —— 讀返 DB 嗰個新 `tree_no`。
  ⚠️ 收就會出現「DB 一個名、Drive 另一個名」而兩邊都以為自己啱。
- ⛔ **冇開新欄、冇 migration。** 「個檔而家叫乜」問 Drive 攞
  （`fields=name,parents`，一個請求攞埋兩樣）——
  ⭐ Drive 自己先係真相，一份存喺 DB 嘅副本只會同佢飄開。
- ⛔ 一次最多 `RENAME_BATCH_MAX`（12）個，改唔晒回 `hitLimit: true`。
  ⛔ **唔准靜靜咁改一半就報成功。**
- ⛔ 撞名保護（I7）照行：改之前查 Drive 有冇另一個檔已經叫嗰個名，有就唔改、出聲。
- ⭐ **重試係安全嘅**：個檔已經叫啱就跳過。

⚠️ **前端仲未接** —— 呢個 endpoint 而家係 inert，⛔ 冇人叫佢。
P3f §4.6 兩個要出錯嘅位（樹木頁黃橫幅、設定頁診斷）係**新畫面元素**，
⇒ `CLAUDE.md` §2.11 要原型先行，⛔ 未做。

## `/purge`（2026-09-20 加，⏳ **未部署**）

一單工程刪咗之後，**真係清走**雲端嗰兩份相（**Jason 2026-09-14 拍板**，
`docs/P8-真清相-計劃書.md`）。

```
POST /purge     { "recordId": "…" }      Authorization: Bearer <用家個 token>
```

⭐⭐ **佢係全個 app 唯一一條救唔返嘅路。** 其餘所有「刪除」都係寫一個
`deleted_at`，撳錯咗改返個欄就有返；⛔ 呢條唔係。

- ⛔ **由頭到尾用家自己個 token**（`CLAUDE.md` §2.9）—— ⛔ 冇 `service_role`。
- ⛔ **`quote_records` 嗰行、`quote_photos` 嗰行都⛔ 唔刪**，只 stamp
  `purged_at`。⭐ 零真刪對 DB row 嚟講仲然成立，變嘅淨係**實物**。

### ⛔⛔ 兩道閘，喺掂任何 bytes 之前

1. **母單一定要真係刪咗**（`quote_records.deleted_at` 有值）⇒ 唔係就 409。
   ⚠️ `quote_records` 條 select policy 係 `using (true)` ⇒ **人人讀得晒**
   ⇒ ⛔「攞到個 recordId」完全唔係一個權限。
2. **問准** —— 一個⛔ 唔改值嘅 `PATCH`（寫 `purged_at = null`，即係佢本來嗰個值）。
   ⚠️ 同一行、同一條 policy。0 行 ⇒ RLS 拒絕 ⇒ ⛔ 一個 byte 都唔掂。
   ⭐ 用**同一個寫入**去試，⛔ 唔另外寫一套「邊個刪得」嘅判斷 ——
   兩套講法一定會有一日唔一致，而唔一致嗰邊就係漏。

### ⛔⛔ 次序係定死嘅

```
① 問准  →  ② R2 刪 bytes  →  ③ Drive 掉垃圾桶  →  ④ stamp purged_at
（⑤ 部機 IndexedDB —— ⛔ 唔喺 Worker，前端做，⭐ 一定要最尾）
```

- ⭐ **R2 行先、Drive 行後**：掉咗入垃圾桶嘅 Drive 檔⛔ 唔算一份生存中嘅副本
  （30 日就冇）。⇒「R2 最後刪」嗰個次序，喺刪 R2 嗰一刻 R2 係**唯一一份生存中**
  嘅副本 —— 反而係危險嗰個。
- ⛔ **④ 一定要最後**：`purged_at` 一寫就冇人再撳得返呢張相；寫咗但實物仲喺，
  就變成「帳面清咗、實物留住」，而且**永遠冇人會再去清**。
- ⭐ 中間任何一步掟錯 ⇒ `purged_at` 留空 ⇒ **嗰行就係「未清完」呢個狀態本身**。

### 其餘

- ⛔ Drive 係**掉垃圾桶**，⛔ 唔係真刪（Jason 2026-09-19 拍板）。多一道 30 日嘅網；
  而「無法還原」呢句喺 **app 層面**仍然係真嘅 —— ⛔ 只有人手入垃圾桶先撈得返。
- ⭐ **重試係安全嘅**：`purged_at` 已經有值就跳過。
- ⛔ 一次最多 `PURGE_BATCH_MAX`（10）張，做唔晒回 `hitLimit: true`。
  ⛔ **唔准靜靜咁清一半就報成功。**（`4 + 10×4 = 44` ≤ Cloudflare 個 50 subrequest 上限。）
- R2／Drive 回 **404 ＝ 當清咗**（我哋要嘅係「嗰份 bytes 唔喺度」）；
  ⛔ 403／500 ⛔ 唔算 —— 嗰啲係「我哋唔知佢仲喺唔喺度」。

### ⛔⛔ deploy 之前一定要做嘅兩樣

1. **跑 `docs/P8-purged_at-草稿.sql`** —— `quote_photos` 而家**冇** `purged_at` 呢個欄。
   ⛔ 冇佢，第 ④ 步一定失敗。
   ⚠️ 嗰份稿第 0 段有**一條要先答嘅問題**（`can_edit_quote_record()` 入面有冇
   `deleted_at is null`）—— 答錯嗰邊，`/purge` **一張相都清唔到而且唔會報錯**。
2. **deploy 完當日**改 `src/lib/deleteDialog.ts` 個 `PHOTOS_REALLY_PURGED = true`。
   ⛔ 唔准早過 deploy 改：改咗就變成「畫面講永久刪除，但實物一件都冇清」。
   ⛔ 亦唔准拖過夜。

⚠️ **前端仲未接** —— 同 `/rename-tree` 一樣，呢個 endpoint deploy 咗之後
仍然係 inert，⛔ 冇人叫佢（計劃書 §7 步 4）。

## 部署要準備嘅嘢

`[vars]`（唔係 secret，寫喺 `wrangler.toml` 得）：

- `R2_ACCOUNT_ID`
- `R2_BUCKET` = `quote-photos`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` —— publishable (anon) key，**唔係** service_role
- `ALLOWED_ORIGIN` —— 例如 `https://sylvan-quote.pages.dev`，
  preview 要試就用逗號分開加多個

**兩個 secret**（⛔ 唔准寫入 `wrangler.toml`、唔准 commit）：

```bash
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

呢兩個係 R2 嘅 **S3 API token**，喺 Cloudflare R2 → Manage API Tokens 開，
**權限只俾 `quote-photos` 一個 bucket 嘅 Object Read & Write**。

## ⛔ 每次 deploy 之前先做呢四步

```bash
git checkout main && git pull        # ① ⛔ wrangler 部署嘅係部機嗰份，⛔ 唔係 GitHub 嗰份
ls worker/src                        # ② 要見到 driveError.mjs 同 rename.mjs 先好行落去
cd worker && npx wrangler deploy     # ③
# ④ 記低 Version ID
```

### ⛔⛔ 點解要第 ① 同第 ② 步 —— ⛔ 唔准淨係記住結論

**2026-09-19 實測**：Jason 部機嗰份 clone **落後 `origin/main` 101 個 commit**，
而且 checkout 緊 `feat/pricing` —— `worker/src` 入面**根本冇 `driveError.mjs`
同 `rename.mjs`**。

⇒ 如果佢照「就咁 `npx wrangler deploy`」跑，佢會將**兩個禮拜前嗰個 worker
推上線** —— 一次過抹走 `/rename-tree` 同 Drive 429 logging。

⚠️⚠️ **而 `wrangler` 會照樣報「Deploy successful」。**
佢⛔ 唔會問你 branch、⛔ 唔會問你落後幾多個 commit、⛔ 唔會知你想部署邊一版。
**佢淨係將你部機嗰個資料夾嘅嘢推上去。**

⭐ 所以第 ② 步（`ls worker/src`）⛔ 唔係多餘：佢係**唯一**喺 deploy 之前
睇得出「我部機嗰份係咪真係新嗰份」嘅方法。

⚠️ **⛔ 唔好省第 ① 步。** 寫步驟而唔寫點解，下一個人就會省咗佢 ——
⭐ 而個 deploy 會成功，所以⛔ 冇人會即刻知出咗事。

### ⛔⛔ 一句要記住：**改 worker 嘅文案 ＝ 改一個 app 嗰邊可能靠緊嘅嘢**

2026-09-19：worker 四句錯誤訊息由「請截圖搵 Jason」改成「請截圖並聯絡 Jason」，
deploy 咗之後 —— `src/lib/sync.ts` 嗰句 `message.includes('搵 Jason')` **即刻斷咗**，
而一個 Drive HTTP 500 由「要人處理」變成「**無需處理，系統會自動再試**」。

⛔ **冇嘢會紅**：worker 嘅 test 綠、app 嘅 test 綠（佢餵嘅係手寫假訊息）、
書面語尺綠（`'搵 Jason'` 呢個字串仲寫喺 `sync.ts` 度）。

⇒ 而家有一把尺睇住：`src/lib/syncWorkerContract.test.ts` **直接叫真嘅
`driveFailure()`**，再餵落 `syncAdvice` ——⭐ worker 改一個字，佢即刻跟住變。

### 記低 Version ID

| 日期 | Version ID | 帶咗乜上線 |
| --- | --- | --- |
| 2026-09-17 | `5066c4d1-0760-4de9-aec0-39a0d1f448f1` | ⛔ 冇帶 429 logging（序搞錯咗，提前跑咗） |
| 2026-09-19 | `77d5eeb9-d5da-40dd-8674-269746c5aa5e` | ✅ `/rename-tree` ＋ Drive 429 logging（等咗兩日） |
| 2026-09-19 | `81c304b3-2f54-4d57-bed9-50b225dd2576` | ✅ worker 42 句書面語 |
| ⏳ **待 deploy** | —— | 「複製上 Drive 之後**核對不符**」（Jason 2026-09-19 收返「校驗」） |
| ⏳ **待 deploy** | —— | `/purge`（P8 步 3）—— ⛔ **要先跑 `docs/P8-purged_at-草稿.sql`** |

## 部署完之後

前端要有 `VITE_PHOTO_WORKER_URL`（Cloudflare Pages 嗰邊加），
**改完環境變數要重新 build 先生效**（Vite 係 build 時 inline）。

未設定嘅話 app **唔會白畫面亦唔會靜靜失敗**：相照影、照存落部機，
但畫面會明寫「未設定相片上傳服務」。

## ⛔ 冇 cron

`/mirror` 讀嗰兩張表要用家個 token，**即係只做得到喺用家仲登住入嗰陣**。

⛔ **唔可以有一條半夜自己行嘅 cron** —— 嗰陣冇人嘅 token。
補做係「用家下次開返 app 嗰陣」做，詳情見 `docs/P3b-計劃書.md` §7.5。
