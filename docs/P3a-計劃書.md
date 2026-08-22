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
2. 批咗之後，**你自己喺 Supabase 跑張 SQL**（喺下面第六節，我只可以寫出嚟）。
   跑之前**留意有三個欄我特登冇加，要你決定加唔加**。
3. **撳一次 Drive 授權** —— 呢個 P3a 用唔著，但 P3b 要，而且冇人代得，早撳早好。
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

### ⚠️ 三個欄我特登冇加，要你決定

`docs/P3-現場影相-設計.md` 第七章列嘅欄，同你今次講嗰張清單，**有三個對唔上**：

1. **`captured_at`（影相時間）** —— 第七章有，你張清單冇。
   `created_at` 係**寫入資料庫嗰刻**，唔係**影相嗰刻**。
   離線影完幾個鐘先有網，兩個時間會差好遠。
   **我建議加**，但唔加都行得通（P3a 唔靠佢）。
2. **`remark`** —— 第七章有，P3d 先用到。
3. **`marks`（標記座標）** —— 第七章有，P3d 先用到。

**唔加嘅後果**：P3d 嗰陣要再開一次表，即係「分兩次開」。
**加嘅後果**：三個欄空住幾個版本。

**兩樣我都唔幫你揀。** 下面張 SQL 我寫咗兩個版本嘅分別，你揀完自己刪／留。

### SQL 草稿（未跑）

```sql
-- ⛔ 未跑。由 Jason 喺 Supabase SQL editor 執行。
create table quote_photos (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references quote_records(id),
  tree_id       uuid references quote_trees(id),          -- 留空 = 工程相
  mitigation    text,                                     -- 留空 = 全景相
  seq           int  not null default 0,
  operation_id  text not null,                            -- 影相嗰刻定死，重試用返同一個

  r2_key         text not null default '',
  r2_synced_at   timestamptz,
  r2_error       text not null default '',
  drive_file_id  text not null default '',
  drive_synced_at timestamptz,
  drive_error    text not null default '',
  size_bytes     bigint,
  sha256         text not null default '',

  -- ⚠️ 以下三行係「要你決定」嗰三個。唔要就成行刪走。
  captured_at   timestamptz,
  remark        text not null default '',
  marks         jsonb,

  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

alter table quote_photos enable row level security;

-- RLS：跟現有三張表同一套
-- ⚠️ 我睇唔到現有 policy 嘅原文（只睇到 §七 嘅摘要），
--     所以請照 quote_trees 嗰張抄，唔好照我下面寫嘅字面跑。
--   * 人人 select 到全部
--   * insert 要 created_by = auth.uid()，而且經 can_edit_quote_record()
--   * update 限自己開而且未 locked，或者 admin
--   * ⛔ 故意冇 delete policy

grant select, insert, update on quote_photos to authenticated;
grant select, insert, update on quote_photos to service_role;   -- Worker 用（P3b）
-- ⛔ 冇 grant delete
-- ⛔ 冇 grant 俾 anon
```

⚠️ **`service_role` 嗰行 P3a 未用到**，但**唔明文寫，佢就會喺 P3b 半夜靜靜失敗**
（`CLAUDE.md` §2.2）。所以一齊寫。

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
- [ ] 第六節三個欄（`captured_at` / `remark` / `marks`）已經決定
- [ ] Jason 自己跑咗張 SQL
