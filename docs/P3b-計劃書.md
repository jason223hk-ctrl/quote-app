# P3b 計劃書 —— 鏡像上 Drive，一張相夠兩份

**狀態：等 Jason 批。⛔ 未批之前一行 code 都唔會寫，一句 SQL 都唔會跑。**
出稿日期：2026-08-22

> 格式跟 `docs/匯報格式.md`：先標題、結論、原因，最後你我各自下一步。
> 詳細分析喺下面〈開發方法十項〉，跟方法論第十七條。
> P3a 嗰份喺 `docs/P3a-計劃書.md`。

---

## 結論

**P3b 只做一條路：一張已經入咗 R2 嘅相 → 抄一份上 Drive → 寫返兩個欄 →
狀態由「已入 R2（Drive 未做）」變成兩份齊。**

---

## 原因

P3a 收咗貨，但**每張相得 R2 一份雲端副本** —— 照 `docs/開發紀錄.md` §九 張表，
就係 **🔴 契約已破** 嗰格：**再跌一份就永久失去**。

Jason 2026-08-22 揀咗**丙**：**唔 merge，做埋 Drive 鏡像夠兩份先一次過上 `main`**
（原話「做埋先」）。

**所以 P3b 唔係「加一個功能」，係「補返個契約」。**
呢個亦係點解範圍要窄：補契約嗰條路要行得實，唔係順手做多幾樣。

---

## 你下一步

1. **睇完呢份計劃書，批准或者話我知邊度要改。**
2. **答第六節兩條前置** —— 兩條都係**冇咗就開唔到工**：
   - **Drive 存原圖定壓縮版**（有一個實測事實會影響你點揀，見下面）
   - **撳一次 Drive 授權** —— 冇人代得到
3. **答第七節嗰條工序對應**（六個工序喺 tree app 冇 token，甲定乙）。
   ⛔ **唔答，工序相嘅檔名砌唔出嚟。**
   （原本三條，其餘兩條已經讀返 tree app 原始碼查實咗，唔使問。）

## 我下一步

**等你批。** 批咗之後開 branch、寫 code、跑 gate，
然後只會叫你做三個真機動作（見第十一節）。

---

## ⛔ 最重要嗰一句

**P3b 做完，一張相先至夠兩份雲端副本，先至可以講「上 `main`」。**

即係話 **P3b 嘅收貨標準唔係「Drive 見到個檔」**，
係**「數得出一張相而家剩返幾多份，而且個數係啱嘅」**。

---

# 開發方法十項

## 1. 現況

- **`main` = last-known-good**，冇任何相片 code。
- **P3a 喺 branch `claude/quote-app-scaffold-deploy-4yb3pe`**，三個真機動作全過，
  ⛔ **特登冇 merge**。
- **`quote_photos` 已經開咗**（2026-08-22，Jason 本人跑），
  **`drive_file_id` / `drive_synced_at` / `drive_error` 三個欄由第一日就喺度** ——
  P3b 唔使開新表、唔使加欄。
- **`service_role` 已經有 `select, insert, update`**（Jason 本人批咗），
  就係為咗今次 Worker 寫返兩個欄。
- **Worker `quote-photos-sign` 已經部署**，而家**淨係簽網址、零 DB 查詢**。
- **Drive 根資料夾 `Quote App Photos` 已經開好**（2026-08-22 上午 9:24）。
- ⛔ **Drive 授權未撳。**
- ⚠️ **R2 已經唔係空 bucket** —— 入面有 Jason 今日試影嗰啲相同埋
  `__selftest/probe.txt`。**P3b 動任何嘢都要當佢係有資料嘅環境。**

## 2. 問題分類

**Feature Mode，高風險。**

比 P3a 高一級，因為多咗兩樣 P3a 冇嘅嘢：

- **一個外部服務嘅 OAuth 憑證**（Drive refresh token）
- **Worker 第一次真係寫資料庫**（P3a 佢一句 DB 都冇查過）

⛔ 兩樣都係方法論明文列做高風險嘅嘢（cloud storage、permissions、credentials）。

## 3. 證據信心

- **已證實**：`quote_photos` 十幾個欄嘅實況、三條 policy、GRANT 實況
  （2026-08-22 實測，見 `docs/開發紀錄.md` §七）。
- **已證實**：P3a 條上傳路真機行得通，重試唔會整多一行。
- **已證實**：**P3a 個前端喺影相嗰刻就壓**（`compressToJpeg`，長邊 2048、JPEG 0.85），
  **部機由頭到尾冇留過手機原相**。⚠️ 呢個直接影響第六節第一條前置。
- **未知**：Drive API 喺 token 過期、限流、同名檔嗰陣實際行為。
- **未知**：Jason 個 Drive 剩返幾多空間會唔會喺 P3b 期間就撞到 2 GB 那條線
  （2026-08-22 係 10.09 GB / 17 GB）。

## 4. 方案比較

**A：Rollback**
唔適用 —— 新功能，冇嘢要還原。

**B：Worker 背景抄（推薦）**
前端上完 R2、寫完一行之後，叫一次 Worker `/mirror`。
Worker 由 R2 讀返 bytes、上 Drive、用 `service_role` 寫返兩個欄。
**再加一個「再試一次」掣**俾人手補。

**C：前端直接上 Drive**
⛔ **唔用。** 要喺前端攞 Drive token，等於**refresh token 落咗前端**。
`CLAUDE.md` §4 寫死：secret 唔可以入前端。

**D：cron 定時掃**
⛔ **唔喺 P3b 做。** 對數 cron 本身就係「唔做清單」入面嗰一項。
而且冇咗 B，cron 都冇嘢可以掃。

### 推薦：B

**改得最少**（前端多一個 call、Worker 多一條路、DB 一個欄都唔使加）、
**secret 全部留喺 server**、
**rollback 乾淨**（唔 merge 就得，Drive 嗰邊嘅檔另計，見第十二節）、
**接住做對數 cron 唔使拆返轉頭**。

## 5. 範圍

### P3b 做

**一張已經入咗 R2 嘅相 → 鏡像上 Google Drive →
寫返 `drive_file_id` 同 `drive_synced_at` →
UI 由「已入 R2（Drive 未做）」變成兩份齊。**

加埋：**Drive quota 警告**（跌穿 2 GB 出具名一行，攞唔到就出「未知」）——
呢個係 Jason 2026-08-22 拍板連住容量決定嘅要求，見 `docs/開發紀錄.md` §九。

### P3b ⛔ 唔做

- **刪除路徑**
- **對數 cron**
- **畫線標記**
- **揀相頁**
- **PDF**
- **工程相格**

## 6. ⛔ 兩條前置 —— 冇咗做唔到

### 前置一：Drive 存原圖定壓縮版

**兩份文件而家講法唔同**（`docs/開發紀錄.md` §十二 第 9 項）：

- **§九** 話：**Drive = 原圖權威**，R2 = 壓縮副本，**兩邊 bytes 唔同**
- **`docs/P3-現場影相-設計.md` 第三章**（Jason 08-16 收咗貨）話：
  **壓一次，兩邊存同一份 bytes**

#### ⚠️ 一個實測事實，落筆之前要知

**P3a 個前端係喺影相嗰刻就壓**（`compressToJpeg`，長邊 2048、JPEG 0.85），
**部機由頭到尾冇留過手機原相。**

⛔ **即係「Drive 存原圖」喺而家個架構下根本做唔到。**
要做就**連 P3a 嗰段都要改**：變成**兩份 bytes、兩個 `sha256`、兩條上傳路**。

#### 兩個取捨（⛔ 我唔會自己揀）

**甲：兩邊同一份壓縮 bytes**
- **`sha256` 一樣** → **「仲剩幾多份」個契約驗得返**（同一個 sha 對兩個地方）
- 佔位細，Drive 6.9 GB 撐耐啲
- 代價：**冇原圖**。將來想攞返高解析度嗰刻嘅相，冇得攞

**乙：Drive 存原圖、R2 存壓縮版**
- 同 tree app 一致
- 代價：**要改 P3a**（兩份 bytes、兩條路）、**兩個 sha256 對唔埋**、
  **佔位大好多**（Drive 6.9 GB 撐短好多）

**⚠️ 呢一條答完之前，P3b 一行 code 都寫唔落** ——
Worker 究竟由 R2 讀返嗰份上去，定係要另一份 bytes，係兩條完全唔同嘅路。

### 前置二：Drive 授權

**要 Jason 本人撳一次，冇人代得到。**
（`docs/P3-現場影相-設計.md` 第十章第 3 項，由 08-16 掛到而家。）

授權攞返嚟嘅 **refresh token 放 Worker secret**。
⛔ **唔准入前端、唔准入 repo。**

## 7. 檔名 —— 兩條答咗，一條要 Jason 揀

**2026-08-22 讀返 tree app 原始碼查實**（`src/domain/photoFilename.ts`、
`src/domain/photo.ts`、`worker.mjs`），三條之中**兩條唔使問**：

### ✅ 已答一：工程資料夾點命名

```
projectFolderName = safeSegment(`${work_date}_${name}`)
```

例：**`2026-08-15_裘錦秋中學`**。

⛔ **冇 Odoo 單號。** 我之前寫「`工作日期_工程名_OrderXXX`」**係錯**，已經更正
（`docs/P3-現場影相-設計.md` 第三章）。
**即係我哋冇 Odoo REF# 都照抄得，本來就冇。**

### ✅ 已答二：全景相個類別 token ＋ `NN` 點派

- 全景相個 token 係 **`Whole View`**（原文例子 `T1_Whole View_01_Before`）。
- ⚠️ **類別 token 喺 `NN` 之前**，原文註解寫明係 Jason 特登要求 ——
  **Google Drive 字母排序嗰陣可以 BY CATEGORY 分組**。
- ⛔ **`NN` 係成對編號，唔係順序數**：第 k 對 Before = `2k−1`、After = `2k`。
  **就算得個 Before 都會霸住 `2k`。**

**所以 quote app 全部相都係 `Before` → ⛔ 一定要用單數 `01`、`03`、`05`…**
（之前講「順住數」係錯，已更正。）**雙數個位留返俾中標之後 tree app 影嘅 After。**

### ⛔ 未答：六個工序喺 tree app 冇對應 token —— 要 Jason 揀

**tree app 個類別 token 得五個**（`PRUNING_WORK_TYPES` 原文）：

`Crown Cleaning`、`Crown Reduction`、`Crown Thinning`、`Crown Raising`、`Close Up`
（清理樹冠／縮減樹冠／疏枝／提升樹冠／近景）

**我哋 §5.4 有九個 mitigation，只有三個對得上：**

- `crown_cleaning` → `Crown Cleaning`
- `crown_reduction` → `Crown Reduction`
- `crown_raising` → `Crown Raising`

**另外六個喺 tree app 完全冇對應**：
修剪 `pruning`、斬樹或移除 `removal`、起樹頭 `stump_removal`、
拉索加固 `cabling`、修根 `root_pruning`、其他 `other`。
（反過嚟，**tree app 個 `Crown Thinning` 疏枝我哋又冇。**）

#### 兩條路（⛔ 我唔會自己揀）

**甲：六個都用我哋自己嘅英文名**
（`Pruning` / `Removal` / `Stump Removal` / `Cabling` / `Root Pruning` / `Other`）

- tree app 個 `workTypeFilenameToken` **撞到唔識嘅字串會走 `safeFilename` 分支**，
  **照樣出到名**
- 代價：呢六個**唔會入到佢個類別排序**

**乙：六個一律當 `Close Up`**，工序詳情寫落備註

- **最兼容**
- 代價：**蝕資訊** —— 六個工序喺檔名度全部變成同一個字

**傾向甲。** 理由：**報價階段個工序名本身就係要畀客人同同事睇**，
改成「近景」等於**掉咗最有用嗰個字**。

#### ⛔ 順帶一個一定要改嘅嘢：大細楷

**我哋 `src/lib/options.ts` 寫住 `Crown cleaning`（細楷 `c`），
tree app 係 `Crown Cleaning`（大楷 `C`）。**

⛔ **要改到一個字都唔差，否則對唔上。**

**但唔好而家單獨改** —— 呢個同上面甲／乙係同一件事，
**一次過改，唔好分兩次郁 `options.ts`**。

## 8. Source of truth

- **`quote_photos` 一行** = 一張相**而家剩返幾多份**嘅唯一答案。
  ⛔ UI 唔准自己另外記一份。
- **R2** = 熱儲存，**P3b 之後仍然係 app 日常讀寫嗰份**。
- **Drive** = 第二份，保命。
- ⛔ **部機嗰份唔算雲端副本**（P3a 已經定咗，唔會因為有咗 Drive 就改）。

## 9. 狀態同失敗

### P3b 之後，一張相有五個狀態（第五個先至出現）

1. 只喺部機
2. 上緊
3. **已入 R2（Drive 未做）** —— P3a 嘅終點，P3b 嘅起點
4. **已同步，兩份齊** ⭐ **P3b 先至出現得到呢個**
5. 有事要人睇

### 失敗點同各自點處理

- **Drive token 過期／refresh 失敗** → 寫 `drive_error`，狀態留喺
  「已入 R2（Drive 未做）」，⛔ **唔准跳去「兩份齊」**
- **Drive 滿咗** → 具名一行「Google Drive 剩返 X GB…」，
  ⛔ 攞唔到 quota 就出「未知」，**唔准當充足**
- **Drive 上到但寫唔返 DB** → ⚠️ **最危險嗰個**：
  Drive 有檔但系統唔知，下次重試會**上多一份**。
  **所以要用 `operation_id` 做 idempotency**，同 P3a 一樣：
  上之前先查 Drive 有冇同名檔。**呢個要喺實作寫死。**
- **Worker 冇 `service_role` 權限** → ⛔ **表面上乜錯都冇，張表就係唔郁**
  （附錄 A I1 同 tree app 中過）。**所以第一個測試就要係「寫得返入去」。**

⛔ **一個都唔准靜靜過骨。** 每一個都要有一句寫得出嘅中文。

## 10. Regression contract —— ⛔ 跌任何一項都唔准上 `main`

1. **P3a 成條路一步都唔准跌** —— 影相、存部機、上 R2、對數、重試唔重複。
   135 個測試一個都唔可以跌。
2. **P2.6 個畫面同原有 94 個 lib 測試，一個都唔可以跌。**
3. **tree app 嘅 `projects` / `photos` / `admins` 三張表，一行都唔准掂。**
4. ⛔ **tree app 個 `tree-photos` bucket、`tree-drive-mirror` Worker、
   Drive 個 `Sylvan Tree Photos` 資料夾 —— 一個 byte 都唔准掂。**
5. ⛔ **`quote-photos` 入面已經有真實資料**（Jason 試影嗰啲 + `__selftest/probe.txt`）。
   **唔准當佢係空 bucket、唔准整批刪、唔准整批改名。**
6. **`quote_records` / `quote_trees` / `quote_site_form` / `quote_photos`
   現有欄位一個都唔准改。**
7. **GPS、十八區、篩選、封存、登出，全部要照行。**

## 11. 測試同驗收

### 我自己跑

- `npm run gate` 全綠
- 新加嘅純函數測試：**檔名砌法**（連 `safeFilename` 清洗）、
  **序號**、**quota 門檻**、**狀態機由第三個變第四個**
- 本機 harness 用假 Drive 行成條路，包括**上到 Drive 但寫唔返 DB** 嗰個情況

### 要你真機做嘅（三個動作）

1. **影一張新相** → 應該由「已入 R2」自己變**「兩份齊」**，
   Drive 入面見到個檔、**檔名啱**
2. **攞一張 P3a 已經上咗 R2 嘅舊相撳「再試一次」** →
   應該補到 Drive，⛔ **而且唔會整多一份**
3. **故意令 Drive 失敗**（例如收返權限）→ 應該出中文，
   狀態**留喺「已入 R2（Drive 未做）」**，⛔ **唔准扮兩份齊**

## 12. 停止條件

- **改到超過三個核心模組 → 停返出嚟問。**
- **同一個問題連續兩版未解決 → 停，唔准出第三個相似 patch。**
- **10 分鐘揾唔到根因 → 只加一個最窄嘅只讀診斷，⛔ 唔准連環估。**
  （P3a 個 `/selftest` 就係咁做，一次過分清楚 CORS 定簽名。）

## 13. Rollback

⚠️ **P3b 個 rollback 冇 P3a 咁乾淨，要講清楚。**

- **Code** = 唔 merge，或者 revert。`main` 由頭到尾冇動過。
- **DB** = ⛔ **今次冇新表可以 drop。** P3b 係**寫入現有嗰三個欄**。
  Rollback 之後嗰幾行嘅 `drive_file_id` / `drive_synced_at` **會留住**。
  **唔會弄壞任何嘢**（欄本身就係為呢個而開），但**唔係「當冇發生過」**。
- **Drive** = ⚠️ **抄咗上去嘅檔會留喺 Drive。**
  ⛔ **清唔清係 Jason 決定，我唔會自己刪** —— 零真刪嗰條規矩喺 Drive 一樣適用：
  **未確認 R2 嗰份仲喺，唔准刪 Drive 嗰份**，反之亦然。
- **Worker** = 舊版 Worker 重新 deploy 就得；`/mirror` 冇咗，`/sign` 照行。

---

## 批准欄

- [ ] Jason 睇完，批准開工
- [ ] 前置一：Drive 存原圖定壓縮版（甲／乙）已經決定
- [ ] 前置二：Drive 授權已經撳
- [ ] 第七節工序對應（甲／乙）已經決定 —— 連埋 `options.ts` 大細楷一次過改
