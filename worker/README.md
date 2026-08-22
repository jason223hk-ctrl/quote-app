# quote-photos-sign

**一句講晒：呢個 Worker 淨係簽網址，一個 byte 都唔會經過佢。**

P3a 用。部機影完相之後問佢攞一條 R2 上傳網址，跟住**部機自己直接上 R2**。

## ⛔ 未部署

**呢個 Worker 仲未部署過。** Code 喺度，但要 Jason 自己部署 ——
部署 Worker、改 Cloudflare secrets 都係要批准嘅嘢。

## 兩條路

- **`POST /sign`**（P3a）—— 簽 R2 上傳網址
- **`POST /mirror`**（P3b）—— 抄一份上 Google Drive，寫返 `drive_file_id`

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
