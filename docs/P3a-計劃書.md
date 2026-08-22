# P3a 計劃書 —— 影相上 R2 一條垂直切片

**狀態：等 Jason 批。⛔ 未批之前一行 code 都唔會寫，一句 SQL 都唔會跑。**
出稿日期：2026-08-22

> 格式跟 `docs/匯報格式.md`：先標題、結論、原因，最後你我各自下一步。
> 詳細分析喺下面〈開發方法十項〉，跟 Jason 份《高效率、低風險 App 開發管理指令》第十七條。

---

## 結論

**P3a 只做一條路：影一張全景相 → 上到 R2 → 對到數 → 出「已同步」。**

---

## 原因

呢條路係之後所有相片功能嘅地基：Drive 鏡像、畫線、揀相、PDF 全部都建喺
「一張相真係上到、而且對得返數」上面。地基未通就做上面嘅嘢，出事嗰陣分唔清係邊一層爆。

而且呢一步係**唯一一次**要同時開新表、開新 bucket、寫新上傳路徑。
之後每一步都係加嘢，唔會再郁呢三樣。

⚠️ **但做完 P3a，每張相得 R2 一份雲端副本** —— 照 `docs/開發紀錄.md` §九 張表，
呢個係「**契約已破**」嗰格。詳情見下面〈⛔ 最重要嗰一句〉。

---

## 你下一步

1. **睇完呢份計劃書，批准或者話我知邊度要改。**
2. **你本人喺 Supabase 貼同跑張 SQL**（喺下面第六節，我只可以寫出嚟）。
   **張 SQL 已經冇任何要你揀嘅位** —— 三個欄同 `service_role` 都答咗。
4. **撳一次 Drive 授權** —— 呢個 P3a 用唔著，但 P3b 要，而且冇人代得，早撳早好。
   （留喺 `docs/P3-現場影相-設計.md` 第十章第 3 項。）

## 我下一步

**等你批。** 批咗之後開 branch、寫 code、跑 gate、上 preview，
然後只會叫你做三個動作驗收（見第八節）。

---

## ⛔ 最重要嗰一句

**P3a 做完之後，每張相得 R2 一份雲端副本。**

照 `docs/開發紀錄.md` §九 張「仲剩幾多份」表，一份就係 **🔴 契約已經破咗** 嗰格 ——
**再跌一份就永久失去**。

所以：

- ✅ **P3a 只可以上 preview 做 canary**（一部機、Jason 自己試）
- ⛔ **唔可以叫阿耀、聰、Isaac 開始用嚟做真單**
- **要等 P3b Drive 鏡像做完**，一張相有兩份雲端副本，先開放俾同事用

**呢一句唔係提提你，係 P3a 嘅上線條件。** 做完 gate 全綠都唔會自動改變佢。

---

# 開發方法十項

## 1. 現況

- **last-known-good = 現時 `main`**（`f4f47bf`），gate 全綠，94 個 lib 測試全過。
- 而家有：登入、工程清單、工程詳情 hub、基本資料（連 GPS）、樹木清單、現場資料表、設定。
- **相片功能一樣都未有。** repo 入面冇任何 migration 檔，`quote_photos` 未開。
- **R2 bucket `quote-photos` 已經開好**（2026-08-22，Standard、Public Access Disabled、0 B）。
- **Drive 根資料夾 `Quote App Photos` 已經開好**（2026-08-22 上午 9:24）。
- **Drive 授權未撳。** P3a 用唔著，P3b 要。

## 2. 問題分類

**Feature Mode**，而且係**高風險嗰種**。

點解算高風險：一次過掂**雲端儲存、DB schema、權限**三樣。
方法論明文講呢三樣要當高風險處理，所以先出計劃書、行 Architecture-proof gate，
唔可以直接開工。

**但範圍係一條垂直切片，唔係架構重整。** 冇郁現有任何 source of truth。

## 3. 證據信心

- **已證實**：R2 bucket 同 Drive 資料夾嘅設定（親眼喺 dashboard 核對過）。
- **已證實**：現有三張表嘅 RLS 同 GRANT 寫法（`docs/開發紀錄.md` §七）。
- **未知（要真機先知）**：手機相機出嚟嘅相實際幾大、壓縮到 2048/JPEG 85 之後幾大。
  **所以計劃書入面唔會出現任何「一單佔幾多空間」嘅數。**
- **未知**：手機瀏覽器本機儲存喺低空間時嘅行為。

## 4. 方案比較

**A：Rollback**
唔適用 —— 呢個係新功能，冇嘢要還原。

**B：一次過做晒 P3（影相 + R2 + Drive + 畫線 + 揀相）**
最快見到成品，但**同時郁三個核心模組加兩個外部服務**。
出事嗰陣分唔清係本機存唔到、R2 上唔到、定 Drive 鏡像唔到。
方法論第七條寫死「一版只改一類事」，呢個直接違反。**唔用。**

**C：垂直切片，只做 R2 一份（推薦）**
一條完整路徑由頭行到尾：撳掣 → 本機存住 → 上 R2 → 對數 → 寫一行 → 出狀態。
**每一層都驗得到**，而且下一步（Drive）係喺尾巴加一段，唔使返轉頭改。

**D：先淨係做本機存相，唔掂雲端**
更細，但**驗唔到最重要嗰件事** —— 究竟上唔上到 R2、對唔對得到數。
本機存相單獨做，只係推遲風險，唔係減風險。**唔用。**

### 推薦：C

點解 C 最抵：**改得最少**（一個新模組 + 一個新畫面，冇郁舊嘢）、
**驗得最實**（對 size 同 sha256，唔係「睇落好似 upload 咗」）、
**rollback 最乾淨**（新表 drop 咗就冇痕跡，零舊資料損失）、
**接住做 P3b 唔使拆返轉頭**。

## 5. 範圍

### P3a 做

**開樹卡 → 全景格 → 撳「拍攝／相簿」→ 本機先存住 → 上傳 R2 →
readback verify 對 `size` + `sha256` → 寫 `quote_photos` 一行 → UI 出「已同步」。**

### P3a ⛔ 唔做（呢啲係 P3b 之後）

- **Drive 鏡像**
- **刪除路徑**
- **畫線標記**
- **工程相格**
- **揀相頁**
- **PDF**
- **對數 cron**

**呢張唔做清單同「未諗到」係兩件事。** 上面每一樣都已經有設計
（見 `docs/P3-現場影相-設計.md`），只係唔喺呢一版做。

## 6. 資料庫 —— ⛔ SQL 由 Jason 本人跑

**我只可以寫出嚟。唔會跑，repo 入面亦唔會有 migration 檔。**
**亦都唔會假設有人幫手代跑** —— 貼同跑呢兩個動作都係 Jason 本人做。

### 點解呢一步唔簡化（Jason 2026-08-22 維持原狀）

呢條規矩**冇改過，`CLAUDE.md` 一個字都唔使郁**。寫喺呢度係因為
「多咗一步」睇落好似係阻頭阻勢，值得寫明點解佢係特登嘅：

⛔ **呢個 Supabase project 同時放住 tree app 嘅生產資料。**

`projects`、`photos`、`admins` 全部喺同一個 project 入面。
一句寫錯咗 target 嘅 SQL，唔係整壞報價 app，係整壞緊生產中嘅 tree app。

**所以「多一雙人眼睇過先跑」係一道有價值嘅閘，多咗嗰一步係值得嘅。**
唔係信唔過邊個，係呢個 project 嘅風險本身就係咁。

### 欄位（一次過開齊，唔准分兩次）

**八個「仲剩幾份」欄**（`docs/開發紀錄.md` §九）：
`r2_key`、`r2_synced_at`、`r2_error`、`drive_file_id`、`drive_synced_at`、
`drive_error`、`size_bytes`、`sha256`。

**加埋**：`tree_id`（nullable，工程相用）、`mitigation`（nullable，全景相留空）、
`operation_id`、`seq`、`deleted_at`、`created_by`、`created_at`。

⚠️ **P3a 用唔晒佢哋**（Drive 那四個欄、`mitigation` 要等後面幾步先寫入），
**但照開** —— 因為「開嗰陣一次過開齊」係硬規矩，遲啲 ALTER 就係分兩次開。

### ✅ 三個欄：Jason 2026-08-22 答咗 —— 三個全部加

`captured_at`、`remark`、`marks` **三個都加**，**一次過開齊，唔留返第二次改表**。

- **`captured_at`（影相時間）**：`created_at` 係寫入資料庫嗰刻，唔係影相嗰刻。
  離線影完幾個鐘先有網，兩個時間會差好遠。
- **`remark`、`marks`**：P3d 先寫入，但**照開** —— 遲啲 ALTER 就係「分兩次開」。

**所以下面張 SQL 冇任何「要你揀」嘅位，可以照跑。**（除咗 `service_role` 嗰條，見下。）

### RLS ——⛔ 逐字抄 `quote_trees`，唔係我寫嘅摘要

**2026-08-22 Jason 喺 Supabase 跑咗查詢，攞到現有 policy 嘅真原文**
（唔再係摘要）。四張現有表**全部確認冇 DELETE policy**。

`quote_photos` 照 `quote_trees` 逐字抄：

- **select** using `true`
- **insert** with check `can_edit_quote_record(record_id) and created_by = auth.uid()`
- **update** using `can_edit_quote_record(record_id)`
  with check `can_edit_quote_record(record_id)`
- ⛔ **唔准寫 delete policy**

### ✅ `service_role`：Jason 本人批咗甲（2026-08-22）

**`quote_photos` 開嗰陣一次過寫埋：**

```sql
grant select, insert, update on public.quote_photos to service_role;
```

⛔ **唔准 grant delete、唔准 grant 俾 `anon`。**

**批准人：Jason 本人**（`CLAUDE.md` §3：改權限要佢本人批，任何人唔准代批）。

**點解要而家開，唔等 P3b：**
P3b 個 Drive 鏡像**一定要寫返 `drive_file_id` 同 `drive_synced_at`**，冇得避。
而附錄 A I1 嗰次教訓係：**漏咗 GRANT 會靜靜失敗，表面上一個錯都冇** ——
Worker 唔會 throw，張表就係一直空。開表嗰陣一齊寫，就唔會有呢個窗口。

### ⛔ 順帶記一筆：現有四張表仍然冇 `service_role` 權限

`quote_records`、`quote_trees`、`quote_site_form`、`quote_admins` ——
**四張仍然一個 `service_role` 資料權限都冇**（2026-08-22 實測）。

⚠️ **今次批嘅只係 `quote_photos` 一張。**
**將來如果有 Worker 要掂嗰四張，要另外再攞 Jason 批**，
**唔可以當今次一齊解決咗。**

### 背景：呢個發現係點嚟嘅

**實測發現咗一件事**：`CLAUDE.md` §2.2 寫住新表要**明文 grant 俾 `service_role`**，
但 2026-08-22 查實況，**四張現有表（`quote_records`、`quote_trees`、
`quote_site_form`、`quote_admins`）嘅 `service_role` 全部得 `REFERENCES` 同 `TRIGGER`，
一個 `SELECT` / `INSERT` / `UPDATE` 都冇。**

即係話**嗰條規矩寫咗，但從來冇執行過**。

⚠️ **P3a 本身用唔著呢個權限** —— P3a 個 Worker **設計上零 DB 查詢**，
淨係簽 presigned URL。**開咗係為咗 P3b。**

### SQL 草稿

> ⛔ **呢張係草稿，已經被 Jason 實際跑咗嗰張取代。**
> **少咗三樣**（`operation_id` unique index、`updated_at` 欄同佢個 trigger、
> 兩個 index），詳情見文件最後〈實際跑咗嘅係咩〉。
> **⚠️ 唔准照呢張再跑一次。**

```sql
-- 草稿。實際跑嗰張見文末。
create table public.quote_photos (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references quote_records(id),
  tree_id       uuid references quote_trees(id),          -- 留空 = 工程相
  mitigation    text,                                     -- 留空 = 全景相
  seq           int  not null default 0,
  operation_id  text not null,                            -- 影相嗰刻定死，重試用返同一個

  r2_key          text not null default '',
  r2_synced_at    timestamptz,
  r2_error        text not null default '',
  drive_file_id   text not null default '',
  drive_synced_at timestamptz,
  drive_error     text not null default '',
  size_bytes      bigint,
  sha256          text not null default '',

  captured_at   timestamptz,                              -- 影相嗰刻，唔係寫入嗰刻
  remark        text not null default '',                 -- P3d 先寫入
  marks         jsonb,                                    -- P3d 先寫入，存百分比座標

  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

alter table public.quote_photos enable row level security;

-- RLS：逐字跟 quote_trees
create policy quote_photos_select on public.quote_photos
  for select using (true);

create policy quote_photos_insert on public.quote_photos
  for insert with check (
    can_edit_quote_record(record_id) and created_by = auth.uid()
  );

create policy quote_photos_update on public.quote_photos
  for update using (can_edit_quote_record(record_id))
  with check (can_edit_quote_record(record_id));

-- ⛔ 冇 delete policy（同現有四張表一樣，已實測確認）

grant select, insert, update on public.quote_photos to authenticated;
-- ⛔ 唔准 grant delete
-- ⛔ 唔准 grant 俾 anon

-- Jason 本人批咗（2026-08-22）：Worker 寫 Drive 狀態要用，見上面。
grant select, insert, update on public.quote_photos to service_role;
```

## 7. Source of truth

- **R2** = 相片 bytes 嘅**熱儲存**，P3a 之後**係唯一一份雲端副本**。
- **`quote_photos`** = 每張相嘅**紀錄同狀態**。⛔ **唔存 bytes。**
- **部機** = 未上到之前嗰份，⛔ **唔算雲端副本**
  （`docs/P3-現場影相-設計.md` 第六章：tree app 中過招，同事清咗瀏覽器資料就冇咗）。
- **UI** = 純粹畫返 `quote_photos` 嗰行，⛔ **唔准本機砌一份 state 扮寫咗入去**
  （`CLAUDE.md` §2.6）。

## 8. 狀態同失敗

### 一張相 P3a 只會處於呢四個之一

- **只喺部機** —— 已經寫落本機，未上
- **上緊**
- **已入 R2（Drive 未做）** —— P3a 嘅終點
- **有事要人睇**

（第五個狀態「已同步，兩份齊」**P3a 到唔到**，因為冇 Drive。
所以 P3a **唔准出「兩份齊」呢個字眼**。）

### 失敗點同各自點處理

- **本機存唔到** → 出中文，⛔ **唔准當影咗**
- **攞唔到 R2 上傳網址** → 「有事」，可重試
- **上傳中斷** → 「有事」，可重試，用返同一個 `operation_id`
- **上完對數對唔上**（`size` 或 `sha256` 唔同）→ ⛔ **當失敗**，唔准寫「已入 R2」
- **寫 `quote_photos` 被 RLS 擋** → 0 行受影響，⛔ **當被拒絕**，出中文講點解
  （`CLAUDE.md` §2.6：RLS 唔會 throw）

⛔ **一個都唔准靜靜過骨。** 每一個都要有一句寫得出嘅中文。

## 9. Regression contract —— ⛔ 跌任何一項都唔准上 `main`

1. **P2.6 個畫面同 94 個 lib 測試，一個都唔可以跌。**
2. **tree app 嘅 `projects` / `photos` / `admins` 三張表，一行都唔准掂。**
3. **`quote_records` / `quote_trees` / `quote_site_form` 現有欄位，一個都唔准改。**
4. **R2 個 `tree-photos` bucket，一個 byte 都唔准掂。只可以寫 `quote-photos`。**
5. **GPS、十八區、篩選、封存、登出，全部要照行。**

## 10. 測試同驗收

### 我自己跑（唔使你郁）

- `npm run gate` 全綠（typecheck → lint → test → build）
- 新加嘅純函數測試（檔名砌法、`sha256` 對數、狀態機）
- 本機 harness 行一次成條路，用假 API

### 要你真機做嘅（三個動作，唔會再多）

1. **有網影一張全景相** → 應該行到「已入 R2」，Cloudflare 見到個 object
2. **飛行模式影一張** → 應該停喺「只喺部機」；開返網之後自己上到
3. **故意整壞網絡**（例如中途熄 Wi-Fi）→ 應該出**「有事」**，
   ⛔ **唔准扮成功**

**淨係呢三樣係自動化證唔到嘅**（相機、檔案選擇器、手機瀏覽器、真網絡）。

## 10.5 兩條唔擋住 P3a 嘅嘢（2026-08-22 確認）

呢兩條係之前提出嘅未決，**確認咗兩條都唔會拖住 P3a**，
寫低係為咗唔使將來有人以為漏咗跟進：

1. **`docs/開發紀錄.md` §十二 第 9 項「Drive 存原圖定壓縮版」**
   —— 係 **P3c（抄去 Drive）嘅前置**，**唔擋 P3a**。P3a 一個字都唔會寫落 Drive。
2. **Drive 授權** —— **要 Jason 本人撳，冇人代得到**，
   留喺 `docs/P3-現場影相-設計.md` 第十章第 3 項。**一樣唔擋 P3a。**

## 11. 停止條件

- **改到超過三個核心模組 → 停返出嚟問。** 唔自己繼續。
- **同一個問題連續兩版未解決 → 停，唔准出第三個相似 patch。**
- **10 分鐘揾唔到根因 → 只加一個最窄嘅只讀診斷，⛔ 唔准連環估。**

## 12. Rollback

- **喺獨立 branch 做**，`main` 保持係 last-known-good。
- **code rollback** = 唔 merge，或者 revert 個 commit。
- **DB rollback** = `quote_photos` 係**純新增一張新表**，**drop 咗佢就得**，
  **零舊資料損失** —— 冇任何現有表被 alter。
- **R2 rollback** = `quote-photos` 係新 bucket，入面得測試相，
  ⛔ **`tree-photos` 由頭到尾冇掂過**。
- **Cloudflare Pages** 側亦可以喺 Deployments 面板 rollback 返上一個 deployment。

---

## 批准欄

- [ ] Jason 睇完，批准開工
- [x] 第六節三個欄（`captured_at` / `remark` / `marks`）—— **2026-08-22 答咗：三個都加**
- [x] `service_role` —— **2026-08-22 Jason 本人批咗甲**
- [x] Jason 本人跑咗張 SQL —— **2026-08-22 跑咗，實測驗證結果見文末**

---

# 實作紀錄（2026-08-22，branch `claude/quote-app-scaffold-deploy-4yb3pe`）

**⛔ 未 merge 入 `main`。** `main` 仍然係 last-known-good。

## 加咗嘅新檔

- `src/lib/photos.ts` —— `quote_photos` 資料層、四個狀態、對數、`photoInsertToRow`
- `src/lib/photoUpload.ts` —— 上傳成條路（外部世界全部由外面餵入，所以測得到）
- `src/lib/photoStore.ts` —— 部機嗰份（IndexedDB，冇加 library）
- `src/lib/photoTransport.ts` —— 壓縮、同 Worker 攞網址、直接同 R2 講
- `src/components/PhotoSlot.tsx` —— 全景格
- `src/lib/photos.test.ts`、`src/lib/photoUpload.test.ts` —— 31 個新測試
- `worker/` —— 簽網址 Worker（⛔ **未部署**）

## 改咗嘅舊檔（三個核心模組，啱啱到上限）

- `src/components/HomePage.tsx` —— `QuoteApi` 加 `photos`，傳 access token 落去
- `src/components/TreesScreen.tsx` —— 傳 `photos` 落 `TreeFormPage`
- `src/components/TreeFormPage.tsx` —— 多咗一個 `photoSlot` prop，**佢自己唔識相片係點運作**

另外加咗 CSS 同 `.env.example` 一行，兩樣都唔算核心模組。

## 跑咗咩、真實結果係咩

**`npm run gate` 全綠**：typecheck → lint → **125 個測試全過** → build。
**原有 94 個一個都冇跌**（94 + 31 = 125）。

**本機 harness（假 API、假 R2）行咗成條路，五種情況：**

- 順利 → **「已入 R2（Drive 未做）」**
- 第二張相 → 一樣得，冇撞
- 攞唔到簽名網址（503）→ **「有事要人睇」** + 紅字
  「攞唔到上傳網址：上傳服務回覆 503。相仲喺部機度，唔會冇咗。」
- 上傳中斷（500）→ **「有事要人睇」** + 紅字
  「上傳中斷：R2 回覆 500。相仲喺部機度，撳『再試一次』就得。」
- **讀返出嚟對唔到數** → **「有事要人睇」** + 紅字
  「對唔到數：上傳前 759 bytes，讀返出嚟 3 bytes。呢張相未算上到。」
  ⛔ **冇寫入資料庫**

**關咗再開嗰個測試：**

1. 上唔到 → 「有事要人睇」
2. **重新載入成頁** → 相**仲喺**、**縮圖仲喺**、狀態照舊「有事要人睇」
3. 撳「再試一次」→ **「已入 R2」**，而且**相片行數仍然係 1** ——
   重試冇整多一行出嚟（用返同一個影相編號）

## ⛔ 未做得到嘅嘢（要人手做）

1. **Worker 未部署。** Code 喺 `worker/`，但部署 Worker 同放 secret 要 Jason 做
   （方法論第十五條）。**未部署之前，真機影相上唔到 R2。**
2. **`VITE_PHOTO_WORKER_URL` 未設定。** 未設定唔會白畫面亦唔會靜靜失敗 ——
   相照影照存落部機，畫面明寫「未設定相片上傳服務」。
3. **`quote_photos` 未開。** 等 Jason 跑第六節張 SQL。
4. **preview 未驗過。** 呢個容器出唔到 Cloudflare，
   所以 preview build 成功與否要 Jason 喺 Pages 面板睇。

## 順手記低嘅兩個實作決定

**一、上到 R2 之後，⛔ 唔會刪部機嗰份。**
P3a 之後得 R2 一份雲端副本，部機嗰份係「仲剩幾多份」入面實實在在嘅一份。
（P3b 之後可以再諗，但唔屬 P3a。）

**二、新樹未儲存唔影得相。**
新樹未有 id，冇嘢可以掛住張相。畫面出「先儲存呢棵樹，之後就影得全景相」。
呢個係方法論第十六條嗰種**限制**：一句限制，慳返一大堆「未有 id 嘅相點算」嘅邏輯。

---

## 補做（2026-08-22，跟 Jason 補張 SQL 之後）

Jason 喺張 SQL 加咗三樣：**`operation_id` unique index**、**`updated_at`**、
**`record_id` / `tree_id` 兩個 index**。

**`updated_at` 同兩個 index 唔使改 code**（有 default，insert 唔會掂佢）。
**unique index 就要改一段**：

### 撞到 `23505` 唔係出事，係「之前已經寫咗」

原本「重試唔會多一行」**係靠 code 守住**：上傳之前查一次有冇行。
加咗 unique index 之後，**係資料庫守住** —— 但咁樣 insert 就真係會撞到
`23505 duplicate key value violates unique constraint`。

**兩部機一齊上、或者網絡抽一抽**都會行到呢一條，所以佢**唔算失敗**。

做法（`src/lib/photos.ts`）：

1. 撞到 `23505` → **用 `operation_id` 揾返嗰行出嚟**
2. **揾到 → 當成功，回返嗰行。**⛔ 唔會 throw、⛔ 唔會彈英文
3. **揾唔到 → 出中文**：「資料庫話呢張相已經有紀錄，但即刻揾返出嚟又揾唔到…」
   ⛔ **唔准靜靜過骨**

⛔ **淨係 `23505` 咁處理。** `permission denied`、RLS 擋咗（0 行）
全部照舊當出事，有測試釘住。

**新加 10 個測試**（125 → **135**）：認得 code 同認得段字、當成功、
⛔ 唔會插第二行、⛔ 唔會彈英文、揾唔返出中文、
`permission denied` 唔會扮成功、0 行照樣當被拒絕、順利嗰次照舊。

### ⛔ 第六節張 SQL 係草稿，唔准再跑

已經喺第六節加咗警告。實際跑咗嘅係下面嗰張。

---

# 實際跑咗嘅係咩（2026-08-22，Jason 本人跑）

## 同第六節張草稿差咗三樣

1. **`operation_id` unique index** —— `quote_photos_operation_id_uidx`
2. **`updated_at timestamptz not null default now()`**，
   **加埋佢個 trigger** `quote_photos_touch` BEFORE UPDATE 行
   `quote_touch_updated_at()`
3. **`record_id` 同 `tree_id` 兩個 index**

## ⚠️ 兩個更正，記低係為咗唔好再中

**一、驗證期望值「delete 權限 = 0」係錯嘅。**

**冇計返 owner。** 正確答案係 **1，而且必須係 `postgres`**。
⛔ **將來寫驗證查詢要 `group by grantee`，唔好淨係 `count`** ——
淨係數總數，你分唔出「owner 有」同「`authenticated` 有」，
而後者先係出事嗰個。

**二、原本張草稿冇 `updated_at` 個 trigger。**

係 Jason 睇 **Supabase Security Advisor** 見到有個 `quote_touch_updated_at`
函數先發現。**照原本咁跑，`updated_at` 會永遠停喺建立嗰刻** ——
唔會報錯，就係永遠唔郁。兩樣都補咗。

## 實測驗證結果（原文照錄，唔係推算）

- 張表存在 = **1**
- policy = **3 條**（`select` / `insert` / `update`）
- **delete policy = 0**
- trigger **由 3 行變 4 行**：`quote_photos_touch` BEFORE UPDATE 行
  `quote_touch_updated_at()`，**同其餘三張表同一個命名同寫法**
- GRANT 實況：
  - `anon` —— `REFERENCES`、`TRIGGER`
  - `authenticated` —— `SELECT INSERT UPDATE`
  - `service_role` —— `SELECT INSERT UPDATE`
  - `postgres` —— owner 有齊（**包括 DELETE，四張舊表一樣，正常**）

**即係 `authenticated` 同 `service_role` 兩個都冇 DELETE ——
兩道閘（冇 delete policy ＋ 冇 delete grant）都關好。**

## 順帶記低嘅兩樣（⛔ 兩樣都唔關 P3a 事）

1. **Supabase 掛住 `Grace period is over`** —— 免費額用完之後 project 會
   **停止回應**，**tree app 同 quote app 兩個一齊死**。
   已開做 `docs/開發紀錄.md` §十二 第 10 項。
2. **Security Advisor：0 errors / 37 warnings。**
   其中一類係 **Public Can Execute SECURITY DEFINER Function**，
   包住 tree app 嗰啲 `soft_delete_photo`、`restore_photo`、
   `cascade_tree_delete_to_photos` —— **未登入都叫得**。
   **未睇過函數內容，所以唔落判斷。**
   ⛔ **呢個係 tree app 嗰邊嘅事，唔准喺 quote app 度動手。**
   已開做 §十二 第 11 項。

---

# ⛔ 臨時診斷入口 `/selftest`（2026-08-22）—— 用完要刪

## 現況（全部實測，唔係推算）

- 手機喺 preview 影相 → **「有事要人睇」**，紅字
  **「上傳中斷：Failed to fetch。相仲喺部機度」**
- 照 `photoTransport.ts`，「上傳中斷」= `putBytes` ——
  **即係 `sign` 嗰步過咗**
- Mac Chrome 喺同一個 origin 直接試：
  - 叫 Worker `/sign` → **HTTP 401**（Worker 正常、有回應、有 CORS，
    401 只係因為冇 token）
  - PUT / GET 落 R2 → **全部 Failed to fetch**
  - 用 `mode: 'no-cors'` → **通到（opaque）**，即係請求真係去到 R2，
    只係冇 CORS 標頭返嚟
- R2 實測：**Class A = 0、Bucket Size = 0 B、一個 object 都冇** ——
  **由頭到尾一個 PUT 都未寫入成功**
- CORS Jason 設過兩次（`*`，之後明文列 header），
  AllowedMethods `GET PUT HEAD`，AllowedOrigins 兩條核對過一個字唔差 ——
  **兩次都仲係唔得**

## ⚠️ 一個更正：「根源係 CORS 冇生效」呢個結論係企唔住嘅

**嗰啲測試證唔到。** 手動發嘅請求**冇簽名**，
**R2 會喺處理 CORS 之前就拒絕**，所以 CORS 設成點都會 `Failed to fetch`。

同樣道理：**簽名唔啱 → R2 回 403 → 403 冇 CORS 標頭 → 瀏覽器一樣顯示
`Failed to fetch`**。

⛔ **即係「CORS 唔啱」同「簽名唔啱」，喺瀏覽器度分唔開。**

## 所以加咗一個最窄嘅只讀診斷

`GET /selftest`（`worker/src/worker.mjs`）。

由 **Worker 自己**（server side，**冇瀏覽器、冇 CORS 呢回事**）
用**同一個 `presign()`** 寫三個字節上 `__selftest/probe.txt`，再讀返出嚟。

**回一個 JSON**：`putStatus`、`putErrorText`（截頭 300 字）、`getStatus`、
`getBodyLength`、`bucket`、`accountIdLast4`、`accessKeyIdLast4`。

**點樣讀個答案：**

- **寫得入** → key 同簽名冇事，**剩返 CORS 一個可能**
- **寫唔入** → 係 key 或者簽名，**同 CORS 完全無關**

## ⛔ 呢一版特登乜都冇修

**未知根因就改 code，係方法論第八、第九條明文禁止嘅。**

所以 `presign()` **一個字都冇郁**，CORS 邏輯**一個字都冇郁**。
呢個 commit 淨係加咗一個診斷入口。

## ⛔ 要刪

- **merge 入 `main` 之前一定要刪 `/selftest`**，
  `worker/src/worker.mjs` 入面有註解寫死。
- **佢冇驗身分**（要喺瀏覽器直接叫得到），
  即係知道網址嘅人**寫得到 `__selftest/probe.txt` 一個 key**、
  睇到兩個 id 嘅**尾四位**。⛔ **唔會回傳 secret，唔會回傳完整 access key id。**
- 診斷完之後，`quote-photos` 入面會有一個 `__selftest/probe.txt`，
  **順手清埋**。
