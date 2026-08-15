> # ⛔ 呢份已經作廢，唔准照佢做
>
> **狀態：作廢。保留純粹作歷史記錄。**
> **權威文件係 `docs/開發紀錄.md`**（規格同歷史）同 `CLAUDE.md`（規矩）。
>
> **點解作廢**：呢份計劃書圈住「**出報價單**」嚟砌 —— 報價單版本、編號、有效期、
> 折扣、狀態機（草稿→已發出→接受／拒絕／過期／superseded）全部都係圍住呢個假設。
> 但 Jason 早前已經講過：**呢個 app 唔使出正式報價單，正式報價單由 Odoo 出。**
> 照呢份做落去，就會同 Odoo 重複做一次同一件事。
>
> 寫呢份嗰條線當時唔知道 Jason 講過呢句，所以唔係佢寫錯，係前提唔同。
>
> 入面兩樣真係有用嘅嘢已經**併入 `docs/開發紀錄.md`**（PDF 發出後唔准原地改、
> 唔好經 Cowork 喺 repo 資料夾跑 git）。其餘部分唔好搬。

# QUOTE app — P0 立項計劃書

> 建立：2026-08-15　　版本：草稿 v0.1（**未拍板**）
> 寫呢份嘅原因：之前傾過報價 app，但**冇落過檔**，session 一冇就乜都冇晒。
> 由今日起，報價 app 嘅權威文件就係呢份。任何 session 接手，第一件事讀呢份。
>
> ⚠️ 全文凡有【假設】標記嘅，都係我估、未經 Jason 確認。【待你】= 等 Jason 俾嘢或者拍板。

---

## 0. 一句講晒

阿耀見完客，喺手機／電腦度砌一張報價單 → 出 PDF 俾客 → 客接受 → **一撳就變成一個工程**，
工程資料直接落到相片 app（tree-app-v7）度俾工人開工影相。
中間唔再需要有人手打第二次同一批資料。

---

## 1. 而家嘅現況（【假設】—— 你要幫我改返啱）

| 步驟 | 而家點做 | 痛喺邊 |
|---|---|---|
| 見客量樹 | 阿耀現場睇、記喺紙／手機備忘 | 資料散，返到公司要重砌 |
| 出報價 | Word／Excel 手打，改舊單做新單 | 編號易撞、格式唔一、舊價抄錯 |
| 發俾客 | WhatsApp／email 送 PDF | 邊張係最新版靠記性 |
| 客接受 | 口頭／WhatsApp 話 OK | 冇一個地方睇到「呢單接咗未」 |
| 開工程 | 有人喺 tree app 手動開工程、逐棵樹輸入 | **同一批樹資料打第二次**，會打漏打錯 |

> 【待你】呢五行有邊行講錯咗，或者仲有第六個痛點，講返俾我，我改。
> 呢張表唔係裝飾 —— 佢決定咗下面成個範圍。現況錯，個 app 就會做錯嘢。

---

## 2. 使用者同角色

| 人 | 喺報價 app 做乜 | 權限 |
|---|---|---|
| 阿耀 | 主力。開報價、砌項目、發俾客、標記接受／拒絕 | 全部 |
| Jason | 睇數、覆核大單、改價目表 | 全部 + 改價目表 |
| Anna | 行政。跟進、發正式單、對數 | 睇晒 + 改狀態，唔改價目表 |
| 工程同事 | **唔用呢個 app** | 冇 |

**設計上嘅限制（方法論 §16 —— 用限制換穩定）**：

- 一張報價單**只有一個負責人**（開單嗰個）。第二個人要改，要先接手（改負責人），唔做同時編輯。
  → 慳走成套 realtime 衝突處理，慳好多 code 同好多 bug。
- 報價單**一發出就唔可以直接改**，只可以「開新一版」（v1 → v2）。舊版永遠留低。
  → 客手上張單同系統入面永遠對得返，唔會出現「客話 8 萬你話 9 萬」。
- **接單之後，報價單鎖死。** 要加嘢就開新報價單（追加工程單）。
  → 呢條係整個「全條龍」最重要嘅閘，唔鎖就會出現「工程開咗但報價又改咗」。

---

## 3. 範圍（P1–P5 做 / 唔做）

**做**

- 客戶同地點資料（簡單，唔係 CRM）
- 逐棵樹／逐項目落單，照價目表計價
- 報價單編號、版本、狀態
- 出 PDF（森伝格式）
- 標記接受／拒絕／過期
- 接受之後：**產生一個工程**（點樣接返 tree app 見 §7）

**唔做（明文）**

- 發票、收數、會計（Odoo 嗰邊嘅事）
- 客戶自助簽名／線上付款
- 多人同時編輯同一張單
- 自動報價（AI 估價）
- Android／桌面 app（同 tree app 一樣，行網頁）

---

## 4. 核心：報價單嘅狀態機

呢個係成個 app 嘅骨。UI 只係佢嘅投影，唔准有第二套狀態。

```
草稿 (draft)
  │ 撳「發出」→ 鎖內容、出 PDF、記低發出時間
  ▼
已發出 (sent) ──── 客要改 ──→ 開新版本 v2（v1 變 superseded，永遠留低）
  │
  ├── 客接受 ──→ 已接受 (accepted) ──→ 撳「轉工程」──→ 已轉工程 (converted)
  ├── 客拒絕 ──→ 已拒絕 (rejected)          【終點】
  └── 過咗有效期 ──→ 已過期 (expired)        【可以重新發出 = 開新版本】
```

**轉換表（唔喺呢張表入面嘅轉換一律唔准）**

| 由 | 事件 | 去 | 副作用 |
|---|---|---|---|
| draft | 發出 | sent | 鎖內容、生成 PDF、寫入 `sent_at` |
| draft | 刪 | （刪走） | 只有 draft 可以真刪 |
| sent | 客接受 | accepted | 寫 `accepted_at` |
| sent | 客拒絕 | rejected | 寫 `rejected_at` + 原因 |
| sent | 到期 | expired | 系統自動（或者開單時計） |
| sent | 改內容 | superseded | **一定要開新版本**，唔可以原地改 |
| accepted | 轉工程 | converted | **產生工程**（見 §7），寫 `project_ref` |
| accepted | 撤銷 | sent | 只限未轉工程 |
| expired | 重新報 | superseded | 開新版本 |

**結構上唔可能出現嘅矛盾狀態**（呢個係設計目標，唔係願望）：

- 冇可能有「已轉工程但未接受」→ converted 只可以由 accepted 嚟。
- 冇可能有「已發出但內容仲喺度改」→ sent 之後 items 表唯讀（DB 層用 trigger 或者 RLS 擋，唔靠前端）。
- 冇可能有兩張 current 版本 → 同一 `quote_group_id` 只可以有一行 `is_current = true`（DB unique partial index）。

---

## 5. Source of Truth 表（方法論 §6，硬性）

| 資料 | 正式來源 | 只係副本／投影 |
|---|---|---|
| 報價單內容、狀態、金額 | **Supabase**（`quote_*` 表） | PDF 只係快照，Drive 只係存檔 |
| 已發出嘅 PDF | **Google Drive**（新資料夾樹） | Supabase 只存 file id |
| 現場相（如果報價要影相） | **R2 新 bucket** = 熱儲存；**Drive 新資料夾** = 原圖 master | 本機 IndexedDB 只係未上傳緩衝 |
| 價目表 | **Supabase `quote_price_items`** | app 開機時攞一份落本機，只做加速 |
| 已成交金額／單數統計 | **由 Supabase 即時算** | 唔另存一份 summary 表 |

**紅線**：報價單一旦 sent，PDF 同 DB 入面嗰刻嘅內容**必須一致**。
做法：出 PDF 嗰陣，將當時所有項目同單價**整份 snapshot 入一個 jsonb 欄**（`items_snapshot`）。
之後價目表改咗都唔會追溯改到舊單。
→ 呢個係最容易出事嘅位：如果報價單靠 join 價目表即時計，你六個月後再打開舊單，價錢會變。**唔准咁做。**

---

## 6. 資料模型（草案）

```
quote_clients        客戶（名、聯絡人、電話、email、地址）
quote_quotes         報價單主檔
  ├ id (uuid, PK)
  ├ quote_group_id   同一單嘅所有版本共用（v1/v2/v3）
  ├ version          1,2,3...
  ├ is_current       同 group 只准一行 true
  ├ quote_no         Q-2026-0001（見下面編號規則）
  ├ client_id
  ├ site_name / site_address
  ├ status           draft|sent|accepted|rejected|expired|superseded|converted
  ├ valid_until
  ├ items_snapshot   jsonb —— sent 嗰刻嘅完整項目+單價
  ├ subtotal / discount / total
  ├ pdf_drive_file_id
  ├ project_ref      轉咗工程之後，指返去 tree app 嗰個工程
  └ created_by / sent_at / accepted_at / ...
quote_items          報價項目（draft 期間用，sent 之後唯讀）
  ├ quote_id
  ├ seq              T01, T02...（同 tree app 一樣嘅樹編號習慣）
  ├ tree_label       樹編號／位置描述
  ├ species          品種（可空）
  ├ work_type        修剪／移除／移除連根／其他（照價目表）
  ├ size_band        樹徑／高度分級（照價目表）
  ├ qty
  ├ unit_price       由價目表帶出，但可以人手改（要記低改咗）
  ├ price_source     'table' | 'manual'
  └ note
quote_price_items    價目表【待你俾真嘢】
quote_photos         現場相（如果要）
```

**編號規則 `Q-2026-0001`**

- 年度 + 四位序號，**由 DB 發**（Postgres sequence 或者 `SELECT max()+1` 加行鎖），唔准前端計。
- 前端計就一定會撞號 —— 兩個人同時開單，兩張都會叫 0007。
- 版本唔佔新號：`Q-2026-0007` v1、v2 共用同一個號，PDF 上面寫 `Q-2026-0007 (v2)`。

---

## 7. 「接單 → 工程」點接返 tree app —— 整個專案最大風險位

你揀咗「全條龍」，咁呢一步就係心臟。三個做法，取捨好唔同：

### A. 唔接（人手開工程）

報價 app 出一份「開工程清單」（工程名、地址、樹列表），Anna／阿耀照住喺 tree app 手動開。

- ✅ 零風險。tree app 一行 code 都唔使改，一個 table 都唔使動。
- ✅ 今日就做得，唔使等。
- ❌ 資料仲係要打第二次（但至少唔使諗、唔會漏）。

### B. 單向推（報價 app 寫一條工程 row 落 tree app）

報價 app 撳「轉工程」→ 經一條 Worker 端點／service role，喺 tree app 嘅 `projects`／`trees` 表插資料。

- ✅ 真・全條龍，唔使打第二次。
- ❌ 要掂 tree app 嘅**生產資料庫**。tree app 而家有八成問題都係「兩個真相來源冇對數」嗰類
  （見 `準確性風險檢討-2026-08-07.md`），再開多一個寫入口，係加多一個風險源。
- ❌ 需要一條有寫權限嘅通道 = 新 secret、新權限邊界。
- ❌ 失敗處理好煩：寫一半死咗，工程開咗但報價冇標記 converted，兩邊唔同步。
  要做冪等（用 `quote_id` 做去重 key）先安全。

### C. 共用同一張 projects 表

兩個 app 睇同一個工程表。

- ✅ 最靚。
- ❌ 最危險。tree app 改 schema 就即刻拖死報價 app，反之亦然。而家 tree app 仲喺 v8 搬遷中途，
  再綁多個 app 落去，等於將兩個專案嘅死線綁埋一齊。**唔建議。**

### 🟩 推薦：**P1–P4 做 A，P5 先評估 B，C 唔做**

理由（方法論 §4／§7／§19）：

1. A 令報價 app 由頭到尾**完全唔掂 tree app**，可以獨立開發、獨立部署、獨立爆炸。
2. tree app 而家自己都仲有未收嘅嘢（v8 階段 2 未部署、egress 死線、對數機制未做）。呢個時候開多條寫入通道，
   出事嗰陣你分唔清係邊個 app 搞出嚟。
3. B 嘅收益係「慳一次資料輸入」。呢個收益係真嘅，但**佢喺 A 行順咗之後先做，風險細十倍**：
   嗰陣個資料格式已經定型、已經跑過真單、你亦已經知道實際打字量係咪真係痛。
4. 而且 A → B 唔使推倒重來。A 嘅「開工程清單」個資料結構，就係 B 要 POST 嗰份 payload。

> ⚠️ 如果你要求一開始就做 B，我做得，但咁樣 P1 就唔再係「新 app 立項」而係「改動生產中嘅 tree app」，
> 要行 Architecture-Proof Gate（獨立 branch、平行比較、rollback plan）。時間大約多一倍。呢個要你拍板。

---

## 8. 儲存決定（你講「sb, r2, gd 都用新 folder」—— 我要問清楚一層）

「新 folder」喺三個地方意思唔同，我逐個講清楚同埋取捨：

### Google Drive — 無爭議，開新資料夾樹

```
森伝報價/
  └ 2026/
      └ Q-2026-0007 沙頭角村屋/
          ├ Q-2026-0007_v1.pdf
          ├ Q-2026-0007_v2.pdf
          └ 現場相/
```

同相片 app 嘅工程資料夾**完全分開**。✅ 照做。

### Cloudflare R2 — 開新 bucket `quote-files`

唔同 `tree-photos` 撈埋。✅ 照做。
（如果 P1–P3 唔影相，R2 可以遲啲先開 —— 唔使一開始就整齊晒。）

### Supabase — **呢個先係要你拍板嗰個**

Supabase 冇「folder」呢樣嘢，最接近嘅有兩個做法：

| | **選項 1：同一個 project + `quote_` prefix** | **選項 2：全新 Supabase project** |
|---|---|---|
| 登入 | 同 tree app 同一批帳號，一次登入 | 另一套帳號，阿耀要記多個密碼 |
| admin 名單 | 共用現有 `admins` 表 | 要重建一份 |
| 額度／egress | **同 tree app 共用**。而家 egress 已經逼近死線（D1） | **完全隔離**，報價爆極都唔會拖死相片 app |
| 先例 | tra-app 就係咁做，行得通 | 冇先例 |
| 出事影響 | 一個 project down = 兩個 app 一齊死 | 各自死 |
| 開發時間 | 快（抄 tra-app 做法） | 慢少少（要重新設 auth、RLS、admin） |

**我嘅推薦：選項 1（同一 project + `quote_` prefix）**，理由：

- 報價 app 嘅 egress 壓力**極細** —— 佢傳嘅係文字同幾張 PDF，唔係幾千張相。
  tree app 爆 quota 係因為相片 bytes 行 Supabase，呢個 v8 搬去 R2 之後會根治。報價 app 一開始就唔行呢條路。
- 「阿耀要記兩個密碼」呢件事，實際上會日日痛。
- tra-app 已經證明 prefix 做法喺呢個 project 行得通，唔使再發明。

**但如果你嘅原意就係「乜都分開先安樂」**，選項 2 我照做，多嘅成本主要係 auth／admin 重建（大約多半日到一日），
之後日常維護幾乎一樣。**呢個純粹係你嘅風險胃口，唔係技術對錯。**

> 【待你】揀 1 定 2。呢個要喺我寫第一行 code 之前定，因為佢決定咗 schema 同 auth 點寫。

---

## 9. Phase 分段

每個 phase：gate 全綠先 commit，你真機驗收先開下一個。同 tra-app 一樣嘅規矩。

| Phase | 內容 | 收貨標準 | 狀態 |
|---|---|---|---|
| **P0** | 立項：呢份文件 + 可點 demo | 你睇完拍板：範圍啱、流程啱、Supabase 揀咗 | 🟨 **今日** |
| **P1** | 價目表 + 資料層 | 真價目表入咗 DB；建到一張空報價單；重開仲喺度 | ⬜ |
| **P2** | 落項目 + 計價 | 逐棵樹加項目，總數計得啱；改單價會標記 manual | ⬜ |
| **P3** | 狀態機 + 版本 | 發出後改唔到；開 v2 舊版留低；DB 擋得住非法轉換 | ⬜ |
| **P4** | PDF 出單 | 森伝格式；PDF 同 DB 對得返；存入 Drive | ⬜ |
| **P5** | 接受 → 開工程清單（做法 A） | 一撳出到清單，Anna 照住開得到工程 | ⬜ |
| **P6** | 跟進睇板（幾多單出咗、接咗、過期） | 阿耀睇一眼知道要 follow 邊單 | ⬜ |
| **P7** | 總驗收：一單真報價由見客行到開工程 | 你同阿耀行一次真單 | ⬜ |
| **P8?** | 做法 B：自動開工程 | 只喺 P7 之後、你話真係值先做 | ⬜ 未拍板 |

**P4 PDF 格式【待你】**：要一份現有嘅森伝報價單樣本（PDF 或者 Word）。
同 tra-app 一樣 —— **格式唔准我自創**。冇樣本我唔會估。

---

## 10. Regression Contract（唔可以影響嘅嘢）

呢個 app 係新嘅，所以 contract 主要係「唔准踩到隔籬」：

1. **tree-app-v7 一行 code 都唔改**（P1–P5 期間）。
2. **唔准掂 `photos` / `projects` / `trees` 表**（讀都唔准，避免養成依賴）。
3. **`admins` 表只准讀，唔准寫。**
4. Supabase 現有 RLS policy 一條都唔准改。新表用新 policy。
5. 唔准用 tree app 個 Cloudflare Worker（`tree-drive-mirror`）。要 Worker 就開新個。
6. 唔准用 `tree-photos` bucket。
7. 前端只准 publishable key。secret key 唔准入 bundle（全 repo 通則）。
8. Drive 唔准掂 `森伝報價/` 以外任何資料夾。

**任何一條踩到，即使報價 app 做得幾靚都唔可以上線。**

---

## 11. Rollback

- 報價 app 係新嘅，最壞情況 = 停用，公司返去 Word 出單。**唔會影響任何現有運作。**
- 每個 phase 有 last-known-good commit，Cloudflare Pages 一撳回舊 build。
- DB：所有 migration 由我寫、**你親手喺 Supabase 跑**（全 repo 硬規矩）。
  每個 migration 都會附一條 down script。
- 資料：報價單只加唔刪。draft 之外一律唔准 hard delete，只准標記狀態。

---

## 12. 未決事項（等你）

| # | 事項 | 點解要你決定 |
|---|---|---|
| Q1 | **真價目表** | 冇佢 P1 開唔到工。要邊啲工種、邊啲分級、邊個單位（每棵／每米／每日） |
| Q2 | **Supabase 選項 1 定 2**（§8） | 決定 schema 同 auth 點寫，改唔返轉頭 |
| Q3 | **報價單樣本**（PDF/Word） | P4 格式唔准自創 |
| Q4 | §1 現況表啱唔啱 | 現況錯，成個範圍會錯 |
| Q5 | 報價要唔要影相？ | 決定 R2 同相機模組使唔使抄過嚟（抄嘅話 P2 多兩三日） |
| Q6 | 有效期預設幾多日 | 30 日？影響 expired 邏輯 |
| Q7 | 折扣點做（成張單 % / 逐項改價 / 兩樣都要） | 影響 items 同 total 嘅算法 |
| Q8 | 要唔要記「報咗畀邊個競爭對手輸咗」 | 決定 rejected 要唔要收原因分類 |

---

## 13. 檔案擺位（已做）

```
Tree/quote-app/                  ← 獨立 git repo（本機，未設 remote）
  ├── .gitignore
  └── docs/
      ├── QUOTE-app-plan.md      ← 本文件
      └── QUOTE-demo.html        ← 流程 demo
```

2026-08-15 已做：

1. 開咗 `Tree/quote-app/`，兩份檔由 `Tree/docs/` 搬咗入去（`docs/` 係 v5 年代嘅嘢，唔應該撈埋）
2. root `.gitignore` **加咗一行** `quote-app/` —— 同 `tree-app-v7/`、`tra-app/`、`MoridenClaimApp/` 一模一樣嘅做法。
   已驗：`git check-ignore` 認得，root repo `git status` 完全睇唔到 quote-app
3. `quote-app/` 自己 `git init` 咗，第一個 commit `1e7689f`「P0 立項」
4. AGENTS.md 加咗 §3.5，目錄樹同 .gitignore 嗰段都更新咗

### ⚠️ 唔好經 Cowork 喺呢個資料夾跑 git

2026-08-15 實測：Cowork 個 mount 唔准 delete 檔，git 每次操作完都會留低
`.git/index.lock`、`.git/HEAD.lock`、`tmp_obj_*`，**下一次 commit 就會即刻死**：
`fatal: Unable to create index.lock: File exists`。

已經清乾淨（殘留物搬咗去 `quote-app/_to_delete/git-lock-殘留/`，你喺 Finder 掉咗佢就得）。
以後 quote-app 嘅 git 一係你喺 Terminal 自己跑，一係我喺雲端做完再交檔。
`.gitignore` 而家有一行未 commit（`_to_delete/`），你下次順手 commit 埋。
