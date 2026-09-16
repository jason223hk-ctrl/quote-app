# quote-photos-sign

**一句講晒：呢個 Worker 淨係簽網址，一個 byte 都唔會經過佢。**

P3a 用。部機影完相之後問佢攞一條 R2 上傳網址，跟住**部機自己直接上 R2**。

## 部署狀態

**已經部署：`https://quote-photos-sign.jason223hk.workers.dev`**

⚠️ 呢一段本來寫住「⛔ 未部署」，一直冇更新過 —— 2026-09-03 查實先發現佢已經
上咗（真相入咗 Drive、`/sign` 同 `/mirror` 都行緊）。⛔ 一份講「乜都未上」嘅
README 比冇 README 更差：睇嘅人會以為線上冇嘢，然後放心改。

⛔ 部署 Worker、改 Cloudflare secrets 一律 Jason 親手做。

## 三條路

- **`POST /sign`**（P3a）—— 簽 R2 上傳網址
- **`POST /mirror`**（P3b）—— 抄一份上 Google Drive，寫返 `drive_file_id`
- **`POST /read`**（P5，匯出 PDF）—— 出一條**淨係讀**嘅簽名網址，攞返張相嘅 bytes

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

## `/rename-tree`（2026-09-16 加，⛔ **未部署**）

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

## 部署完之後

前端要有 `VITE_PHOTO_WORKER_URL`（Cloudflare Pages 嗰邊加），
**改完環境變數要重新 build 先生效**（Vite 係 build 時 inline）。

未設定嘅話 app **唔會白畫面亦唔會靜靜失敗**：相照影、照存落部機，
但畫面會明寫「未設定相片上傳服務」。

## ⛔ 冇 cron

`/mirror` 讀嗰兩張表要用家個 token，**即係只做得到喺用家仲登住入嗰陣**。

⛔ **唔可以有一條半夜自己行嘅 cron** —— 嗰陣冇人嘅 token。
補做係「用家下次開返 app 嗰陣」做，詳情見 `docs/P3b-計劃書.md` §7.5。
