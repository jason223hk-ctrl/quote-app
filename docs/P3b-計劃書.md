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
2. **撳一次 Drive 授權** —— ⛔ **淨返呢一條前置**，冇人代得到。
3. **揀拆定唔拆**（工序重組要唔要獨立做一個 P3a.1，見第七節第三項）——
   **我建議拆**，但要你揀。

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

### P3b ⛔ 唔做

- **刪除路徑**
- **對數 cron**
- **畫線標記**
- **揀相頁**
- **PDF**
- **工程相格**

## 6. ⛔ 兩條前置 —— 冇咗做唔到

### ✅ 前置一：答咗 —— 壓縮版，兩邊同一份 bytes

**Jason 2026-08-22 拍板**（原話「相大小同 tree app 一樣」，加上取捨傾完之後）：

**Drive 同 R2 存嘅係同一份 2800 / q85 嘅 bytes，
同一個 `sha256`，同一個 `size_bytes`。**

之前兩份文件對唔上（§九 話原圖權威、第三章話同一份壓縮）——
**而家 §九 已經改返，兩邊一致。**

#### ⛔ 全世界只有一個壓縮點

**就係 `src/lib/photoTransport.ts` 嘅 `compressToJpeg`。**

- ⛔ **唔准喺 P3b 加第二條「保留手機原相」嘅路**
- ⛔ **唔准喺鏡像上 Drive 之前再壓一次**

**點解咁死**：**再壓一次 `sha256` 就唔同，
「仲剩幾多份」嗰個契約即刻驗唔到。**
兩個地方各自有份唔同 bytes 嘅檔，就答唔到「呢張相而家剩幾多份」——
而 P3b 成件事就係為咗答呢條問題。

**所以 P3b 個 Worker 條路好簡單**：
**由 R2 讀返嗰份 bytes，原封不動上 Drive。**⛔ **中間唔准掂。**

### 前置二：Drive 授權 —— 逐步指示已經寫好

**要 Jason 本人撳一次，冇人代得到。**
（`docs/P3-現場影相-設計.md` 第十章第 3 項，由 08-16 掛到而家。）

⭐ **逐步指示喺 `docs/Drive-授權-逐步指示.md`** ——
寫到「撳邊個掣、見到咩畫面、跟住撳咩」，可以**逐句讀出嚟帶佢做**。

授權攞返嚟嘅 **client id / client secret / refresh token 放 Worker secret**。
⛔ **唔准入前端、唔准入 repo、唔准貼落任何對話。**

⛔ **呢個係 quote app 自己嘅授權。唔准掂 tree app 個 `tree-drive-mirror`
或者佢嘅 credential。**

#### ⚠️ 授權之前有一件事要 Jason 揀：個根資料夾

**`drive.file` 只睇得到「呢個 app 自己整嘅檔」** ——
出處係 tree app 自己個 Worker 嘅註解
*"drive.file only sees app-created files"*，而 tree app 用嘅**都係 `drive.file`**
（`worker/src/worker.mjs:48`）。

**即係 Jason 2026-08-22 用手整嗰個 `Quote App Photos`，個 Worker 係睇唔到嘅**，
佢會自己整多一個同名嘅 —— **Drive 度就會有兩個 `Quote App Photos`**，
正正就係 §二 記低嗰個坑。

**甲（建議）**：留返 `drive.file`，**Jason 先刪咗／改名嗰個空資料夾**，
等 Worker 自己整。權限最細，掂唔到 tree app 嗰啲相。

**乙**：改用 `drive` 全權限。唔使刪嘢，但個 token **睇得晒成個 Drive**，
包括 tree app 全部相。

⛔ **未揀之前唔好開始授權** —— 貼落去嗰個 scope 就係呢個決定。
詳情見 `docs/Drive-授權-逐步指示.md` 最後一節。

##### ✅ 2026-08-22 答咗：**乙（闊權限），Jason 本人批**

**問咗兩次**，第二次係喺**已經明文寫出後果**之後
（「呢個 app 會睇到你 Google Drive 入面所有嘢，包括公司同私人檔案」），
**佢再答「乙」** —— ⛔ **知情決定，唔係手快撳錯。**

**開發側建議咗甲（窄權限），冇被採用。**
完整紀錄（批准人、日期、建議、後果講過幾次）喺
`docs/開發紀錄.md` §十二 附註。

**技術上嘅結果**：**用得返 Jason 手動開嗰個 `Quote App Photos` 做根資料夾**，
⛔ **唔使刪嘢，唔會出現兩個同名資料夾。**

⚠️ **⛔ 唔好當佢係永久決定** —— `docs/開發紀錄.md` §十二 第 13 項
開咗一項長期跟進：將來 Google 出到更窄嘅 scope，
或者我哋唔再需要讀返手動開嗰個資料夾，**就應該收窄返**。

> ⛔ **順帶記低一條規矩**（呢次差啲中）：**含糊嘅回覆唔係批准。**
> 第一次答「乙」之後嗰個確認打漏咗字（打咗「c人」），
> **當時冇當佢係批准，叫佢重覆一次** —— 結果佢下一句係問進度，
> **根本唔係答緊權限**。**尤其係權限，唔清楚就再問一次。**

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

### ✅ 已答三：工序重新分組之後，「對唔上」呢個問題冇咗

**Jason 2026-08-22 重新分咗工序**（新結構見 `docs/開發紀錄.md` §5.4）：
修剪變成一個**唔可以單獨揀嘅群組**（下面四個細項），
再加五個平排項目，最後 `other`。

**tree app 五個類別（`Crown Cleaning`、`Crown Reduction`、`Crown Thinning`、
`Crown Raising`、`Close Up`）全部被我哋包住** ——
**Drive 檔名 100% 對得返，之前甲／乙嗰條問題自動消失。**

> ⚠️ 呢個**推翻咗 2026-08-14「唔駛改工序名」**嗰個決定。
> 推翻人 Jason、日期 2026-08-22、理由寫喺 §5.4，
> ⛔ **舊決定冇被靜靜蓋過。**

### ⛔ 三件事我唔會自己決定

#### ✅ 一、舊資料點算 —— 數字出咗，做法定咗

**2026-08-22 Jason 喺 Supabase 跑咗只讀查詢，實測：**

- 全個 `quote_trees`（未軟刪）**淨係得一個代號有用過：`pruning`，出現咗 2 次**
- **其餘八個代號一次都冇用過**

⚠️ **即係話唯一有歷史包袱嗰個，正正就係最麻煩嗰個** ——
**由葉變咗群組標題嗰個。**

**嗰兩行嘅來歷**：2026-08-22 之前 **P2 試用期**留低嘅，**Jason 本人開嘅測試資料**。
⛔ **唔係 bug。** 寫低係為咗將來冇人見到就以為執錯咗嘢。

##### 做法：走保守路，保留 legacy

- **`pruning` 保留做 legacy 代號，永遠讀得返**
- 畫面顯示成 **「修剪（未細分）」**
- ⛔ **唔准 `update` 舊行**
- ⛔ **唔准自動幫佢揀細項**
- ⛔ **唔准喺清單度畀人揀返佢** —— **新單只可以揀四個細項**
- ⛔ **唔准寫任何 migration script 去改嗰兩行**

**理由**：`CLAUDE.md` 零真刪、舊單資料要永遠查得返；
而且**呢個 legacy 分支得幾行，一次寫好就永遠唔使再擔心** ——
比起叫人手動執兩行資料、再祈求以後唔會再有，**穩陣好多**。

##### ⚠️ 要加一個 regression test

**一棵樹 `mitigations` 係 `['pruning']` 嗰陣：**

- 要**顯示到「修剪（未細分）」**
- ⛔ **唔可以空白**
- ⛔ **唔可以 throw**
- ⛔ **唔可以喺清單度消失**

##### ⚠️ 連帶影響：呢種樹影唔到工序相

**一棵樹如果只有 legacy `pruning`、冇細分，佢係影唔到工序相嘅** ——
**因為冇 token 砌唔到 Drive 檔名**（格式要 `{樹編號}_{類別}_{NN}_Before`）。

**所以呢種樹淨係影得全景相。**

⛔ **呢一點要喺畫面講清楚，唔好等到現場先發現。**
（實際係咩字眼，做嗰陣再定；重點係**唔准靜靜咁冇咗個掣**。）

#### ✅ 二、兩個新代號 —— 定咗

**`crown_thinning` 同 `close_up`**，snake_case，
同現有 `crown_cleaning` / `crown_reduction` / `crown_raising` /
`stump_removal` / `root_pruning` 一致。

**呢個係內部代號，用家見唔到**，所以唔使 Jason 拍板。

#### 三、⛔ 只准郁一個模組

§5.4 寫明 `options.ts` **係資料，唔係 UI**，所以呢次改動應該**淨係郁嗰個檔加文件**。

**⛔ 如果做落發現要郁多過一個模組，停返出嚟講。**

⚠️ 我而家已經睇到**一個可能會踩過界嘅位**，先講清楚：
**「修剪係群組，唔可以單獨揀」呢條規則**，`options.ts` 得一個 `Option[]`
（`value` / `label` / `en`），**表達唔到「群組同細項」呢個關係**。

再加埋另外兩樣**都係 UI 側**嘅嘢：

- **legacy `pruning` 要顯示成「修剪（未細分）」**
- **只有 legacy `pruning` 嘅樹，冇工序相個掣，而且要講到明點解**

**三樣加埋，大有可能要動到 `OptionGroup.tsx` 同 `TreeFormPage.tsx`。**

⛔ **一發現要郁多過 `options.ts`，即刻停返出嚟講，唔會自己繼續。**
呢個就係方法論第七條「一版只改一類事」同第十二節嗰條停止條件。

##### ⚠️ 真係要郁多一個模組嘅話：建議拆做 P3a.1

**我評估完，建議拆。**

**點解拆：**

1. **工序重組同 Drive 鏡像係兩件完全唔相干嘅事。**
   一件係「畫面上啲掣點分組」，另一件係「一張相點樣有第二份副本」。
   **撈埋一齊出事，就分唔清係邊件搞出嚟。**
2. **兩件嘢嘅風險唔同級。** 工序重組**改唔到資料**（legacy 唔准 update）；
   Drive 鏡像**會喺外部服務度寫檔**，rollback 冇咁乾淨（見第十三節）。
   **低風險嗰件唔應該被高風險嗰件拖住。**
3. **驗收動作唔同。** 工序重組驗嘅係「揀掣同顯示」，
   Drive 鏡像驗嘅係「Drive 見唔見到個檔、`sha` 對唔對得返」。
   **兩套驗收擺埋一齊，Jason 要一次過記住六件事。**
4. **P3b 有兩個前置**（Drive 授權未撳）。
   **工序重組冇任何前置，而家就做得。** 綁埋一齊等於白等。

**P3a.1 會係咩：**

- 範圍：**工序重新分組 + legacy `pruning` 顯示 + 兩個新代號**
- **⛔ 唔掂相片、唔掂 Drive、唔掂 R2、唔掂 Worker**
- 落喺**同一條 P3a branch**（P3a 未 merge，所以係喺佢上面疊）
- 驗收：兩個動作 —— **新開一棵樹揀工序**、
  **開返嗰兩棵 legacy 樹睇顯示**

**如果做落發現真係得 `options.ts` 一個檔搞得掂**，就唔使拆，
**照喺 P3b 入面做埋。**

⛔ **拆定唔拆，等 Jason 揀。我只係寫低建議同理由。**

### 順帶：`Close Up` 升做工序，同「成棵樹／近景」係兩件事

`docs/P3-現場影相-設計.md` 入面「成棵樹／近景」係**張相入咗邊個格**
（第七章：`mitigation` 留空 = 全景相）。
而家 `close_up` 變成**一個真正嘅工序選項**，即係會有一格叫「近景」，
入面啲相 `mitigation = 'close_up'`，檔名出 `T1_Close Up_01_Before`。

**兩樣唔衝突，但個名一樣，寫 code 嗰陣好易撈亂。** 記低喺度。

## 7.5 ✅ Worker 行用家自己個 token（Jason 2026-08-22 拍板：丙）

### 定咗嘅嘢

**Worker 要讀 `quote_records` 同 `quote_trees` 嗰陣，行用家自己個 token，
靠 RLS 攔。⛔ 唔開任何新 grant。**

**已經寫咗入 `CLAUDE.md` §2.9 做通則** —— **唔止呢個 Worker**：
任何 Worker 需要用家資料一律行用家 token；
⛔ **要用 `service_role` 讀多一張表之前，一定要返嚟攞 Jason 本人批。**

**理由**：`service_role` 一旦有咗 `quote_records` / `quote_trees` 嘅 `SELECT`，
**Worker 出事就等於全公司所有報價單曝光，而唔止出事嗰一張相。**

**今日已批嘅 `service_role` 權限維持原狀** —— 淨係 `quote_photos` 一張表。
⛔ **唔准趁機擴大。**

### ✅ 實際寫落去之後：連 `service_role` 都唔使用

**寫 `/mirror` 嗰陣重新對過三個動作，用家自己個 token 全部做得到：**

- **讀相片嗰行** —— `quote_photos_select` 係 `using (true)`
- **讀工程同棵樹** —— 一樣 `using (true)`
- **寫返 `drive_file_id` / `drive_synced_at`** ——
  `quote_photos_update` 係 `using can_edit_quote_record(record_id)`，
  **佢自己開嗰單就過到**

**所以 Worker 入面一個 `service_role` key 都冇**，
`worker/wrangler.toml` 寫明 ⛔ **唔准加** ——
**一個唔使用嘅 `service_role` key 擺喺 Worker 度，就係一個唔應該存在嘅風險。**

⚠️ **RLS 唔會 throw，佢只係令 0 行受影響**，所以寫返之後
**用 `return=representation` readback 對返有冇行**，
**0 行當被拒絕**（`CLAUDE.md` §2.6）。

#### ⚠️ 連帶：`quote_photos` 個 `service_role` grant 而家係「批咗但冇用」

2026-08-22 Jason 批咗 `grant select, insert, update ... to service_role`，
**當時嘅理由就係「Worker 要寫返 Drive 狀態」**，而家證實**唔使**。

**要唔要收返係 Jason 決定**（改權限要佢本人批）。
⛔ **唔准自己 revoke。**

### ⛔ 連帶：一張相幾時上 Drive

行用家 token 即係**鏡像只做得到喺用家仲登住入嗰陣**。
⛔ **所以唔可以係一條半夜自己行嘅 cron。**

**兩條路一齊做（Jason 2026-08-22 定）：**

1. **影完上到 R2 之後，即刻試一次鏡像。**
2. **試唔成功**（冇網、閂咗個 app、token 過期）→ **留低狀態**，
   **用家下次開返 app 嗰陣自動補做**。

**畫面要睇得到「呢張相仲差 Drive 嗰份」。**

- ⛔ **唔准靜靜補**
- ⛔ **唔准補失敗都唔出聲**

**呢個就係 §九「唔准靜靜降級」同一條原則。**

⚠️ **順帶更正一個字眼**：P3 設計第三章寫住「Worker **背景**抄一份去 Drive」——
「背景」要理解成**「app 開住嗰陣喺背景做」**，
⛔ **唔係「server 自己夜晚做」**。設計文件已經改咗。

### ✅ 三條實作細節（Jason 2026-08-22 本人拍板，三條都照建議）

#### 一、補做分批，一次三張

⛔ **唔准一次過發成個工程嘅請求。**

**理由**：**地盤網絡差，一次過三十個請求會一齊死。**
一個工程 30 張相（§10.6 定咗嘅規模），開 app 嗰下全部一齊試，
**手機同網絡都頂唔住**。

**做法**：**補三張，補完再補下三張。**
代價係補 30 張要等耐啲 —— **接受。**

#### 二、連續失敗三次就停自動重試

**連續失敗 3 次** → 轉做 **「有事要人睇」** → **之後只可以人手撳先再試**。

**理由**：有啲失敗**重試幾多次都唔會好**
（Drive 滿咗、棵樹只有 legacy `pruning` 砌唔到工序相檔名）。
**每次開 app 都自動試、每次都出聲**，會令人**好快唔再理** ——
而**唔理就等於個警告冇咗作用**。

#### 三、「已入 R2、Drive 未做」⛔ 唔入車上清單

**只喺嗰張相自己個狀態顯示。**
**真係試過失敗**（即係轉咗做「有事要人睇」嗰啲）**先入清單。**

##### ⛔ 呢個唔係「批准咗一個例外」，佢同第五章係同一個目的

表面上睇落似同「唔准靜靜降級」相反。**唔係。**

**分別喺邊：**

- **「Drive 未做」係每張相都必經、通常幾秒到幾分鐘就完嘅正常過渡** ——
  **佢唔係降級。**
- **降級係「應該有兩份，而家得一份，而且唔會自己好返」** ——
  嗰啲就係試過失敗嗰批，**佢哋照入清單**。

**如果連過渡狀態都入清單**：
**影一張相多一行，成版紅。**
而**張清單一旦日日全紅就冇人再睇**，
⛔ **反而令真正嘅失敗被淹冇。**

**即係為咗表面上「乜都報」，而失去咗個清單本身嘅作用。**

**第五章寫嗰條規矩（只列真係缺嘅嘢、列得太多就日日有紅點、人好快唔再理）
同呢個判斷係同一個目的** —— **唔係例外，係執行緊同一條規矩。**

## 8. Source of truth## 8. Source of truth## 8. Source of truth

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
- **Drive 滿咗** → Google 回 `storageQuotaExceeded`，寫 `drive_error`，
  同步頁出「需要處理」（`sync.ts` 個 `syncAdvice`）。⛔ 重試幾多次都係一樣。
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
  **序號**、**狀態機由第三個變第四個**
- 本機 harness 用假 Drive 行成條路，包括**上到 Drive 但寫唔返 DB** 嗰個情況

### 要你真機做嘅（三個動作）

1. **影一張新相** → 應該由「已入 R2」自己變**「兩份齊」**，
   Drive 入面見到個檔、**檔名啱**
2. **攞一張 P3a 已經上咗 R2 嘅舊相撳「再試一次」** →
   應該補到 Drive，⛔ **而且唔會整多一份**
3. **故意令 Drive 失敗**（例如收返權限）→ 應該出中文，
   狀態**留喺「已入 R2（Drive 未做）」**，⛔ **唔准扮兩份齊**

## 11.5 ⛔ 上線清單：兩項未驗，merge 之前一定要補

### ✅ 一、工序重組 —— 兩個 case 都驗咗

- ✅ **新樹（2026-08-22）** —— Jason 影咗截圖：「修剪」係標題唔係可剔選項、
  四個細項出齊、提示寫住「揀修剪就要揀返係邊一種」、下面另開「其他處理方法」一組
- ✅ **舊樹（2026-08-22）** —— Jason **親眼睇過**：
  工程 **`Testing01`** → 樹木清單 → **「#125 Ficus / 高 20m · DBH 300mm /
  修剪（未細分）」**

**即係嗰句只喺 2 行資料先見到嘅字，真機真資料出得返。**

⛔ **唔准因為有 regression test 就當佢驗咗。**

出處：tree app `docs/RULE-異常狀態嘅-UI-必須親眼睇過.md`（2026-07-30 訂立）：

> 凡係「只喺異常／罕見狀態先出現」嘅 UI……唔准淨靠 `typecheck` / `lint` /
> `test` / `build` 綠就當驗過。
> **對呢類 UI，gate 綠係零證據，唔係弱證據。**
> 佢證明咗 code 行得，證明唔到嗰句話講得啱。

**「修剪（未細分）」正正就係呢一類**：全個 DB 得 **2 行**會觸發到，
平時**永遠見唔到**。

**要補嘅**：Jason **親眼開返嗰兩棵樹**，睇實際 render 出嚟嗰句字。

### ⛔ 三、影相上 R2 —— **要重新驗一次**

**2026-08-22 改咗 `seq` 由 0 變 1**（`photoUpload.ts`）——
**即係掂到今日真機驗收過嗰條路**。

⛔ **唔准當之前驗過就算數。**

**要補**：**有網影一張全景相 → 應該「已入 R2」**，Cloudflare 見到個 object。

### ✅ 二、新排位 —— 驗咗

**2026-08-22 Jason 真機睇咗，答「啱」**（`bed4046`）：
**修剪（標題，剔唔到）→ 移除（自己一格，剔得）→ 其他處理方法（五項）**。

**即係工序重組兩個 case 都驗完**：新樹分組排位、舊樹顯示「修剪（未細分）」。

### 三、Drive 根資料夾嗰個決定（甲／乙）

見第六節前置二。**未揀就開始唔到授權。**

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

## 未答（唔擋住開工，但記住）

1. **「近景」擺喺邊。**
   而家喺「其他處理方法」組入面，但**近景其實唔係一種處理方法，係一種相**。
   已經畀咗三個選項 Jason 揀（**照舊** ／ **自己一行** ／ **索性唔要**），**未覆**。
   ⚠️ 佢係 tree app 五個 token 之一（`Close Up`），所以**唔要嘅話要諗埋檔名點砌**。
2. **舊樹顯示「修剪（未細分）」嗰個驗收動作** —— 見 §11.5 第一項。

## 批准欄

- [ ] Jason 睇完，批准開工
- [x] 前置一：Drive 存原圖定壓縮版 —— **2026-08-22 定咗：壓縮版，兩邊同一份 bytes**
- [x] 根資料夾甲／乙 —— **2026-08-22 Jason 本人批咗乙（闊權限）**
- [x] 前置二：Drive 授權 —— **2026-08-22 撳咗，token 綁 `sylvantree2026@gmail.com`，實測 scope = `.../auth/drive`**
- [x] Worker 點讀 `quote_records` / `quote_trees` —— **2026-08-22 定咗：用家 token，⛔ 唔開 grant**
- [x] 「一張相幾時鏡像」—— **2026-08-22 定咗：影完即刻試，唔得就下次開 app 補**
- [x] §7.5 三條實作細節 —— **2026-08-22 Jason 拍板：分批三張／連續失敗三次停／過渡狀態唔入清單**
- [x] ⛔ 舊樹顯示「修剪（未細分）」—— **2026-08-22 Jason 親眼睇過
      （`Testing01` 樹 #125）**
- [x] ⛔ 新排位（移除拎出嚟、近景搬入其他）—— **2026-08-22 Jason 睇咗，答「啱」**
- [x] ⛔ 改咗 `seq` 之後影相上 R2 —— **2026-08-22 驗咗（我自己核過先剔，見文末）**
- [ ] `quote_photos` 個冇用嘅 `service_role` grant 收唔收返（Jason 決定）
- [x] 工序重組拆唔拆 —— **2026-08-22 拆咗做獨立一步，已經做完（`654633c`），新樹 case 驗咗**
- [x] 舊單 mitigation 代號用量 —— **2026-08-22 實測：`pruning` 兩行，其餘冇用過**
- [x] 舊單「修剪（未細分）」點顯示 —— **2026-08-22 定咗：保留 legacy，唔改舊行**
- [x] 兩個新代號名 —— **`crown_thinning` / `close_up`（內部代號，唔使 Jason 拍板）**

---

# 實作紀錄 —— 前端（2026-08-22）

**⛔ 未 merge 入 `main`。**

## 改咗嘅檔

- `src/lib/photos.ts` —— 加第五個狀態 `synced`（「已同步，兩份齊」）、
  `MAX_DRIVE_ATTEMPTS`、`MIRROR_BATCH_SIZE`、`pickMirrorBatch()`
- `src/lib/photoTransport.ts` —— `mirrorPhoto()`
- `src/lib/photoUpload.ts` —— `PendingPhoto` 加 `driveAttempts` / `driveError`
- `src/components/PhotoSlot.tsx` —— 影完即刻試、開 app 補做、人手再試

## ⚠️ Harness 捉到兩個真 bug，兩個都係唔跑就見唔到

### 一、補做效果自己炒車

**第一次跑出嚟：一次開 app 就叫咗 `/mirror` 四次。**

原因：補完 → `reload()` → `rows` 變咗個新 array → useEffect 再行 → 再補……
**一次開 app 就燒晒三次配額**，而且變成連環重試 ——
**正正就係「一次三張」想避免嗰件事。**

**修法**：用一個 `triedRef`，記住今次開 app 試過邊幾張。
**「下次開 app 補做」＝ 一次開 app 一張相試一次。**
⚠️ **人手撳「再試一次」唔受呢個限制** —— 人手撳就係人手撳。

### 二、「試咗幾多次」數少咗

`runMirror` 本來由 React state 攞嗰個本機紀錄，**state 有機會落後半拍**，
結果**數少咗就會一路試落去**。

**修法**：⛔ **由 IndexedDB 讀返最新嗰個**，唔用 state。

## 真實結果（瀏覽器實跑，假 Worker）

- **順利** → **「已同步，兩份齊」** ✅
- **Drive 失敗** → **「已入 R2（Drive 未做）」** ＋ 紅字「抄唔到去 Drive：Drive 滿咗」
  ⛔ **冇扮成功，亦冇當佢係災難** —— 佢係過渡狀態
- **重開第 2 次** → 補做叫咗第 2 次，狀態仍然「已入 R2（Drive 未做）」
- **重開第 3 次** → 叫咗第 3 次 → **轉「有事要人睇」**
- **重開第 4 次** → ⛔ **冇再自動試**（實測 counter 冇郁）

**`npm run gate` 全綠：184 個測試。**

## 仲要人手驗

- **有網影一張** → R2 → Drive → **三份副本齊**
- **改咗 `seq` 之後嗰項** —— 一齊驗

---

# 🚨 I6：舊行 `seq = 0` 撞新公式，Drive 出咗個 `-1` 檔名（2026-08-22）

## 實況（Drive API 直接攞返，唔係信畫面）

資料夾 `Quote App Photos` → `2026-08-22_彩`，入面兩個檔：

| 檔名 | size | createdTime |
| --- | --- | --- |
| `2_Whole View_01_Before.jpg` | 539,904 | 10:54:54 |
| 🚨 `1_Whole View_-1_Before.jpg` | 412,094 | 10:54:43 |

**新影嗰張 `NN = 01` 完全正確** —— `seq` 由 1 數起真係生效。
🚨 **舊嗰張 `NN = -1`。**

## 根因 —— ⛔ 係我漏咗

**我改咗寫入側（`seq` 寫 1），但冇處理已經存在嘅舊行。**
舊行 `seq` 仲係 `0`，鏡像一開就照住 `0` 抄，`2 × 0 − 1 = −1`。

⚠️ **更差嘅係：我當時特登攞走咗 `pairedNumber` 入面「0 當 1」嗰個補救**，
**知道舊行係 0，但冇講「所以要順手更新舊資料」。**
攞走補救係啱嘅（唔好兩套講法），**漏咗嗰句先係錯。**

## 已經做咗嘅 code 修正

**`pairedNumber(seq)` 而家 `seq < 1` 就回 `null`，`photoFilename` 跟住回 `null`，
`/mirror` 出一句中文並且寫入 `drive_error`。**

⛔ **呢個唔係「0 當 1」嘅特例** ——
**特例會靜靜咁幫你揀一個答案；呢度係拒絕，然後出聲，等人知有嘢要修。**
**⛔ 唔准再出現一個 `-1` 檔名。**

## 教訓（同 §5 一齊睇）

⛔ **改一條「由邊個數字數起」嘅規矩，一定要同時問：
「已經寫咗落 DB 嗰啲，跟唔跟新規矩？」**

**寫入側改完 ≠ 改完。** 舊行唔會自己跟。
呢次代價細（兩張測試相），但**同一個模式落喺真單度就係一堆爛檔名**。

## 修法（⛔ 次序好重要，Jason 自己行 SQL）

### 第一步：查有冇其他中招嘅行

```sql
-- ⛔ 只讀。數返有幾多張相會砌出 -1（或者更細）嘅檔名。
select p.id,
       p.seq,
       p.record_id,
       p.tree_id,
       p.r2_synced_at,
       p.drive_synced_at,
       p.created_at
from quote_photos p
where p.deleted_at is null
  and p.seq < 1
order by p.created_at;
```

**已經鏡像咗嘅**（`drive_synced_at` 唔係 null）→ **Drive 上面有爛檔名，要清**。
**未鏡像嘅**（`drive_synced_at` 係 null）→ **一開 app 就會產生 `-1`** ——
不過而家 code 已經改成**拒絕**，所以佢會出中文錯誤，唔會再整爛檔。

### 第二步：更新舊行

```sql
-- ⛔ Jason 自己喺 Supabase 跑。P2/P3a 試用期嗰啲 seq = 0 改成 1。
update quote_photos
set seq = 1,
    drive_file_id = '',
    drive_synced_at = null,
    drive_error = ''
where deleted_at is null
  and seq < 1;
```

⚠️ **清 `drive_file_id` / `drive_synced_at` 係為咗等佢重新抄一次。**
⛔ **唔好順手改第二個欄。**

### 第三步：開返 app 等佢自己重抄

用家開返 app → 補鏡像會揀到佢（`drive_synced_at` 係 null）→
用**新檔名** `1_Whole View_01_Before.jpg` 上一次。

### 第四步：⛔ 確認新檔真係喺 Drive，先至刪個爛檔

**次序唔可以掉轉。**
`CLAUDE.md` §2.8：**未確認另一份仲喺，唔准刪任何一份。**

確認 `1_Whole View_01_Before.jpg` 出現咗，**先至**去 Drive 刪
`1_Whole View_-1_Before.jpg`。

## Idempotency 會唔會攞返個爛檔？⛔ 唔會

`findFileInFolder()` 係**用今次要砌嗰個檔名去揾**，
即係揾 `1_Whole View_01_Before.jpg`。

**個爛檔叫 `1_Whole View_-1_Before.jpg`，名唔同，所以配唔到、唔會被重用。**

⚠️ **但佢亦都唔會自己消失** —— 佢會變成一個**孤兒檔**，
**要人手刪**（第四步）。

## ⚠️ 如果唔止一行：⛔ 唔准全部改成 `seq = 1`

**`seq` 係「同一格入面第幾張」**（第三章）。
同一棵樹、同一個工序入面**兩張都叫 `seq = 1`，就會砌出兩個一模一樣嘅檔名**。

### 先睇清楚係咩情況

```sql
-- 每一組（邊棵樹、邊個工序）有幾多張 seq < 1 嘅相
select tree_id,
       coalesce(mitigation, '(全景相)') as 工序,
       count(*) as 幾多張
from quote_photos
where deleted_at is null and seq < 1
group by tree_id, mitigation
order by 幾多張 desc;
```

**每組都係 1 → 用上面第二步嗰句簡單 update 就得。**
**有組多過 1 → 用下面嗰句。**

### 多過一張嗰陣：按 `created_at` 重新編 1、2、3…

```sql
-- ⛔ Jason 自己跑。同一組（樹＋工序）入面按影相次序重新編。
-- 全景相 tree_id 有值、mitigation 係 null；工程相 tree_id 係 null，
-- 所以分組要兩樣一齊睇。
with ordered as (
  select id,
         row_number() over (
           partition by coalesce(tree_id::text, 'record:' || record_id::text),
                        coalesce(mitigation, '')
           order by created_at, id
         ) as new_seq
  from quote_photos
  where deleted_at is null
    and seq < 1
)
update quote_photos p
set seq = o.new_seq,
    drive_file_id = '',
    drive_synced_at = null,
    drive_error = ''
from ordered o
where p.id = o.id;
```

### ⛔ 一個要留意嘅位

**呢句只重編 `seq < 1` 嗰啲。**
如果同一組入面**已經有啱數嘅相**（例如已經有 `seq = 1`），
**重編出嚟就會撞返佢。**

**驗返有冇撞：**

```sql
select coalesce(tree_id::text, 'record:' || record_id::text) as 組,
       coalesce(mitigation, '(全景相)') as 工序,
       seq, count(*)
from quote_photos
where deleted_at is null
group by 1, 2, 3
having count(*) > 1;
```

**有結果 = 有撞，⛔ 停低唔好開 app**，返嚟講，
要**成組一齊重編**（唔止 `seq < 1` 嗰啲）。

⚠️ **成組重編嘅代價**：**已經上咗 Drive 嗰啲會換檔名**，
舊檔名嗰個會變孤兒檔，**要人手清**。所以**能夠只動未鏡像嗰啲就最好**。

---

# 🚨 I7：用檔名做「已經抄咗」嘅判斷，靜靜食咗一張相（2026-08-22）

## 實況（唯讀 SQL 查出嚟，唔係推測）

`quote_photos`（`deleted_at is null`、`seq < 1`）**三行**，
**同一單、同一棵樹、`mitigation` 全部 NULL、`seq` 全部 0**：

| | id | `r2_synced_at` | `drive_file_id` | `drive_synced_at` |
| --- | --- | --- | --- | --- |
| **A** | `0ecd7165…3597` | 04:00:02 | `10DIlIGth…IA6Nu` | 10:54:45.896 |
| **B** | `a24197d1…2429` | 04:05:36 | 🚨 `10DIlIGth…IA6Nu`（**同 A 一樣**） | 10:54:47.684 |
| **C** | `6d19eb38…5b9c` | 04:05:44 | （空） | NULL |

`10DIlIGth…IA6Nu` 就係 Drive 上面嗰個 **`1_Whole View_-1_Before.jpg`**。

## 🚨 即係話

**A 同 B 係兩個唔同嘅 R2 檔案，但指住 Drive 上面同一個檔。**

**B 嘅內容從來冇上過 Drive**，但 DB 寫咗 `drive_synced_at`、
畫面出**「已同步，兩份齊」**。

⛔ **「兩份齊」講咗大話，實際係一份 —— 而且係靜靜咁失敗，冇 error、冇紅字。**

## 根因

三張相 `seq` 全部 `0` → 三個都算出同一個 `NN` → **同一個檔名**。
而當時嘅 code **用檔名去判斷「係咪已經抄咗」**：

```js
async function findFileInFolder(token, name, folderId) {
  const q = [
    `name = '${escapeQ(name)}'`,
    ...
  ]
  const files = await driveList(token, q)
  return files.length ? files[0].id : null
}
```

用嘅地方：

```js
let fileId = await findFileInFolder(gtoken, filename, folderId)
if (!fileId) { …上傳… }
```

**A 先抄上去。B 跟住嚟，揾到同名嗰個，就當自己抄咗，攞返 A 個 id 寫落 DB。**

## ⛔ 教訓

**「已經存在」嘅判斷唔可以淨靠一個撞得到嘅 key。**

**個 key 撞得到，系統就會將兩件唔同嘅嘢當成同一件 —— 而且係靜靜咁。**

⚠️ **呢個唔止關今次啲舊資料事。**
**將來任何一個令兩張相同名嘅情況**（`seq` 重複、同一格重影、並發）
**都會再中，一樣冇聲出。**

## 已經改咗嘅 code

**一、認 id，唔認名。**
上傳嗰陣喺 Drive 檔案寫低 `appProperties.quotePhotoId = quote_photos.id`，
之後用**呢個 id** 去揾。**一張相一個 id，撞唔到。**

**二、同名但唔係同一張 → ⛔ 出聲，唔上、亦唔攞返。**
Drive 容許同名，照上就會出兩個一樣名嘅檔，之後冇人分得開。
所以見到同名而 `quotePhotoId` 唔啱（或者冇），
**寫入 `drive_error` 並且回 409**，⛔ **唔准覆蓋、唔准當佢係同一張** ——
**連大細一樣都唔算數**，因為冇 `quotePhotoId` 就係唔知邊張相。

**三、上完對返大細。**
`size` 同 `quote_photos.size_bytes` 唔夾 → **唔准寫「抄咗」**。

## ⛔ 修法（Jason 自己跑，⚠️ 逐行指名，唔用 `seq < 1` 一次過 update）

**三張同一棵樹，所以唔可以全部 `seq = 1`** ——
咁樣三張都算出 `_01_`，由兩張撞埋變成三張撞埋。

按 `r2_synced_at` 次序：**A = 1（`NN 01`）、B = 2（`NN 03`）、C = 3（`NN 05`）**。

```sql
-- ⛔ Jason 自己喺 Supabase 跑。逐行指名，改咗咩睇得見。
-- 三行都清 Drive 三個欄，等佢哋重新抄過。
update quote_photos set seq = 1, drive_file_id = '', drive_synced_at = null, drive_error = ''
where id = '0ecd7165-ad13-4422-ac8a-d59531873597';   -- A → NN 01

update quote_photos set seq = 2, drive_file_id = '', drive_synced_at = null, drive_error = ''
where id = 'a24197d1-bf0d-4f5d-bfeb-45c3ec9e2429';   -- B → NN 03

update quote_photos set seq = 3, drive_file_id = '', drive_synced_at = null, drive_error = ''
where id = '6d19eb38-530b-44c6-815b-45d66c575b9c';   -- C → NN 05
```

**驗返：**

```sql
select id, seq, drive_file_id, drive_synced_at, drive_error
from quote_photos
where record_id = '73750f0c-d9ca-4fff-bd2c-b5a709cb2c9a'
order by r2_synced_at;
```

**三行都要係 `seq` 1/2/3、`drive_file_id` 空、`drive_synced_at` NULL。**

### ⚠️ A 都要重抄，唔可以當佢 OK

**A 個 `drive_file_id` 指住嗰個檔叫 `…_-1_…`**，
改完之後 A 應該砌出 `…_01_…` —— **名唔同，所以佢一定要重抄。**
（而且嗰個舊檔冇 `quotePhotoId`，新 code 亦唔會攞返佢。）

### ⛔ 次序：Drive 個 `-1` 檔，最後先刪

1. 跑上面三句 `update`
2. **先 deploy 新 Worker**（⛔ 未 deploy 就開 app，會再撞一次同一個問題）
3. 開返 app，等三張相各自抄上去
4. **確認 Drive 見到 `…_01_`、`…_03_`、`…_05_` 三個新檔**
5. **先至**刪 `1_Whole View_-1_Before.jpg`

⛔ 第 5 步唔可以行先 —— `CLAUDE.md` §2.8：**未確認另一份仲喺，唔准刪任何一份。**

---

## ✅ I7 結案（2026-08-22）

**Worker 已 deploy**（Version ID `3c8c8a05`，upload 16.84 KiB，binding 六個齊），
三張相補抄完成。

### 兩邊各自攞返實際資料，逐項對

**⛔ 唔係睇 app 話乜。** Drive `files.list` 攞一次、DB `select` 攞一次，再對。

| DB `seq` | DB `size_bytes` | Drive 檔名 | Drive `size` | Drive `appProperties.quotePhotoId` |
| --- | --- | --- | --- | --- |
| 1 | 412,094 | `1_Whole View_01_Before.jpg` | 412,094 | `0ecd7165…3597` ✅ |
| 2 | 465,227 | `1_Whole View_03_Before.jpg` | 465,227 | `a24197d1…2429` ✅ |
| 3 | 334,905 | `1_Whole View_05_Before.jpg` | 334,905 | `6d19eb38…5b9c` ✅ |

`drive_error` **三行都空**。

⭐ **三個 `size` 各自唔同 —— 即係證實咗係三張唔同嘅相，唔係同一張抄三次。**
（今朝就係因為冇對呢一項，先會兩行指住同一個檔都睇唔出。）

⭐ **465,227 嗰張就係今朝「DB 話兩份齊、Drive 根本冇佢」嗰張。**
而家真係上到 Drive —— **救返一張差啲永久得一份副本嘅相。**

### ⭐ 呢個對數方法要寫成標準驗收做法

**今朝出事嘅根本原因唔係 code，係驗收方法**：**信咗 UI 講「兩份齊」。**

**以後驗「一張相有幾多份」，唔准睇 app：**

1. **由 Drive `files.list` 攞一次**（要 `fields` 包住 `id,name,size,appProperties`）
2. **由 DB `select` 攞一次**
3. **對三樣：檔案 `id`、`size`、身分（`quotePhotoId`）**

⛔ **三樣缺一唔可。**
淨係對 `id` → 今朝兩行指住同一個 id 都當啱。
淨係對名 → 就係 I7 個根因。
**`size` 係最平嘅一道防線：兩張唔同嘅相，size 幾乎唔會一樣。**

### 孤兒檔

`1_Whole View_-1_Before.jpg`（`10DIlIGth…`）**冇任何一行指住**
（DB 四行嘅 `drive_file_id` 冇一個係佢），已經叫 Jason **淨係刪呢一個**。

### 「改咗 `seq` 之後重驗影相」—— ⛔ 我自己核過先剔

**唔係靠人講「驗咗」就剔。** 核咗三樣：

1. **Jason 影相嗰個 preview build 係 `6648d80`**，我查返嗰個 commit 入面嘅 code：

   ```
   $ git show 6648d80:src/lib/photoUpload.ts | grep -B2 "seq:"
         // P3a 一格得一張全景相，所以永遠係第一張 —— ⛔ 但係 1 唔係 0。
         seq: 1,
   ```

   **即係佢影嗰陣真係行緊 `seq = 1` 嗰版**，唔係舊版。

2. **出嚟嘅檔名係 `2_Whole View_01_Before.jpg`** —— `NN = 01`，
   由 `NN = 2 × seq − 1` 反推返就係 `seq = 1`。**由結果對得返。**

3. **成條路真係行過**：`size_bytes` **539,904** 同 Drive 個檔 `size` **539,904** 夾得返。

**三樣夾得返，所以剔得。**

---

## ⚠️ 舊 Worker 抄嘅檔冇身分（`2_Whole View_01_Before.jpg`）

**現況**：DB 行 `dd27a482…`、`drive_file_id` `1eULUs3v…`、`size` 539,904，
**兩份齊，功能上冇事** —— 但佢係**舊 Worker 抄嘅**，
所以 Drive 個檔**冇 `appProperties.quotePhotoId`**。

### (a) 值唔值得補？——值，而且唔止係「將來核對」

⚠️ **有一個實際會咬人嘅位**：新 code 見到同名而**冇 `quotePhotoId`** 嘅檔，
會**當佢係撞名，回 409 唔上**（I7 嗰個保護）。

**而家唔會觸發**，因為佢個 `drive_synced_at` 有值，`/mirror` 第一關就回
`alreadyDone`，行唔到撞名檢查嗰度。

⛔ **但一旦有人清咗佢個 `drive_file_id` / `drive_synced_at`**
（例如將來又要重抄），**佢就會死鎖**：
重抄 → 揾唔到 `quotePhotoId` → 見到同名嗰個冇身分 → **拒絕** → 永遠上唔到。

**所以補佢唔係執靚，係拆一個未爆嘅雷。**

### (b) 最安全做法：`PATCH files/{id}` 淨係加 `appProperties`，⛔ 唔郁 bytes

**唔好清 `drive_file_id` 等佢重抄** —— 你嘅傾向啱：
重抄會**多一個孤兒檔**、多用一次額度、而且**中間有一段時間得一份副本**。

**PATCH 嘅好處**：**檔案 id 唔變、bytes 唔變、DB 一個字都唔使改**。

⛔ **但落手之前要三樣夾得返先做**（呢個就係「補身分」呢個動作嘅安全條件）：

1. DB 嗰行嘅 `drive_file_id` **就係**你要 PATCH 嗰個 id
2. Drive 個檔 `size` **等於** DB `size_bytes`（539,904 = 539,904 ✅）
3. 檔名**就係**由呢一行砌出嚟嗰個（`2_Whole View_01_Before.jpg` ✅）

**三樣都夾** = 我哋唔係靠估佢係邊張相，**係已經有三個獨立證據**。

### (c) 將來要唔要一次過盤點？——要，但**先做唯讀報告，⛔ 唔准自動修**

**四類個案要分得開：**

| 情況 | 意思 |
| --- | --- |
| 檔冇身分，但有一行指住佢 | **補身分**（好似今次） |
| 檔冇身分，冇任何一行指住 | **孤兒檔** —— ⛔ 人手決定，唔准自動刪 |
| 有一行指住個檔，但個檔唔喺 Drive | **要重抄** |
| 一行寫住 `drive_synced_at`，但 Drive 冇對應檔 | **今朝 I7 嗰類** —— 🚨 最嚴重 |

⚠️ **呢個實際上就係「對數 cron」** ——
而**對數 cron 明文喺 P3b 嘅「唔做清單」入面**（第五節）。

⛔ **所以唔准趁機喺 P3b 做埋。**
**應該開一個獨立細階段**（例如 P3c 之後），
而且**第一版淨係出報告，唔郁任何嘢** ——
今日兩次都係「自動幫你決定」出事（檔名當身分、`0` 當 `1`），
**盤點呢種掃全世界嘅嘢，更加唔應該自動改。**

---

# 🚨 I8：我引錯咗 tree app 個壓縮值（2026-08-22）

## ⛔ 先講錯咗嘅嘢

**我之前引 `src/lib/imageCompress.ts:110` 嘅 `{ longEdge = 2800, quality = 85 }`
話「tree app 就係 2800 / q85」——⛔ 引錯咗。**

**嗰行係 default 參數**，而**影相嗰條路根本冇用 default，佢傳咗自己嘅值入去。**

**Jason 就係憑我呢個講法決定「相大小同 tree app 一樣」，
而我哋跟住把 `MAX_EDGE` 由 2048 改成 2800。**
**⛔ 即係話而家兩邊唔係一樣，而係反方向差開咗。**

⚠️ 呢個正正就係今日第三次同一形狀嘅錯：**引一個睇落啱嘅位，冇對返實際行嗰條路。**

## (a) quote app 實際值（`src/lib/photoTransport.ts`）

```
19:export const MAX_EDGE = 2800
20:export const JPEG_QUALITY = 0.85
35:  const bitmap = await createImageBitmap(file)
36:  const size = targetSize(bitmap.width, bitmap.height, MAX_EDGE)
50:    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
```

**條路：`PhotoSlot.tsx:243` → `compressToJpeg()` → 瀏覽器 `canvas.toBlob`。**
**得呢一個壓縮點，冇第二個。**

## (b) tree app 實際值 —— **`2400 / q80`，唔係 2800 / q85**

**影相入 Drive 嗰條路係 `src/runtime/uploadPhoto.ts`：**

```
166:const CAPTURE_LONG_EDGE = 2400
167:const CAPTURE_QUALITY = 80
254:  const shrunk = await downscaleToJpeg(input.blob, { longEdge: CAPTURE_LONG_EDGE, quality: CAPTURE_QUALITY })
```

**`downscaleToJpeg` 個 `2800 / 85` 淨係 default，喺呢度被覆蓋。**

**而且 `quality` 會正規化**（`src/lib/imageCompress.ts:126`）：

```
const q = quality > 1 ? Math.min(100, quality) / 100 : Math.max(0, quality)
```

**即係 `80` → `0.80`，真係 q0.80，唔係越界後撞返 default。**

**佢哋個檔頭仲寫低咗點解揀 2400/80（原文）：**

> Measured on real projects 2026-07-30: 2800px/q85 through the BROWSER canvas
> encoder averaged 2.95 MB a photo … 2400px/q80 lands near 1.2–1.6 MB.

**同你實測到嘅 1.1–2.5 MB 對得返。**

## (c) quality 差幾多？⛔ 解釋唔到，而且方向係反嘅

| | 長邊 | quality | 像素 |
| --- | --- | --- | --- |
| tree app | 2400 | **0.80** | 1800×2400 = 4.32 MP |
| quote app | 2800 | **0.85** | 2100×2800 = 5.88 MP |

**quote app 像素多 36%、quality 高 0.05 —— 兩樣都應該令檔案大，唔係細。**
**所以 ⛔ quality 解釋唔到 2–4 倍嘅差異，佢指住相反方向。**

### 最可能嘅原因：**影緊嘅嘢唔同**

**JPEG 大細主要係睇畫面有幾多細節，唔係睇像素數。**

- tree app 影嘅係**樹**：樹葉係極高熵嘅紋理，**壓極都細唔到**
- quote app 呢幾張係室內／簡單場景**嘅機會好大**

**有一個數支持呢個講法**：quote app 三張舊相 **1536×2048（3.1 MP）約 402–454 KB**，
新嗰張 **2100×2800（5.88 MP）527 KB** ——
**像素多咗 1.9 倍，bytes 只多咗約 1.2 倍。**
**細節多嘅相唔會咁**（會接近成比例）。**平滑區域幾多像素都幾乎唔使錢。**

### ⛔ 唯一公平嘅比法

**兩個 app 影同一樣嘢**（同一棵樹、同一個位、最好同一部機），再比 bytes。
**唔同主體嘅 bytes 冇得比。**

### 其他可能因素（⚠️ 我冇證據，唔當結論）

- **唔同部手機**：sensor、機內處理、HEIC → JPEG 嘅轉換都會影響來源細節
- **來源相本身已經壓過一次**：兩個 app 都係由相機出嚟嘅 JPEG 再壓，
  來源已經幾大就影響結果

⛔ **兩樣我都冇量過，唔會當佢係原因。**

## ⛔ 我冇改任何設定

**`MAX_EDGE` / `JPEG_QUALITY` 一個字都冇郁。**
**改唔改係 Jason 睇完相之後嘅規格決定。**

**如果佢要「真係同 tree app 一樣」**，就係 **`MAX_EDGE = 2400`、
`JPEG_QUALITY = 0.80`** —— ⚠️ **咁樣張相會細過而家，唔係大過。**

---

# 由「攞到 File」到「拎到 Blob」：逐項對（2026-08-22）

**⛔ 「一模一樣」係 Jason 原話，所以唔止對兩個數字。**
以下**每項都引返原文**。

**tree app 條路**：`src/runtime/uploadPhoto.ts:254` →
`downscaleToJpeg()`（`src/lib/imageCompress.ts:109-170`）
**quote app 條路**：`PhotoSlot.tsx:243` → `compressToJpeg()`
（`src/lib/photoTransport.ts`）

| # | 項目 | tree app | quote app | |
| --- | --- | --- | --- | --- |
| 1 | 長邊 | `2400`（`uploadPhoto.ts:166`） | **已改 `2400`** | ✅ 一樣 |
| 2 | quality | `80` → 正規化 `0.80`（`imageCompress.ts:126`） | **已改 `0.8`** | ✅ 一樣 |
| 3 | 輸出 mime | `'image/jpeg'` | `'image/jpeg'` | ✅ 一樣 |
| 4 | 分階段 downscale | **冇**，一次 `drawImage` | **冇**，一次 `drawImage` | ✅ 一樣 |
| 5 | canvas smoothing | **冇明文設定**（用瀏覽器預設） | **冇明文設定** | ✅ 一樣 |
| 6 | 第二次壓縮／bytes 上限重試 | **冇**（全檔搵過，得 `:254` 一次） | **冇** | ✅ 一樣 |
| 7 | 縮放取整 | `Math.max(1, Math.round(...))` | `Math.round(...)`，**冇 `max(1,…)`** | ⚠️ 唔一樣 |
| 8 | **EXIF orientation** | `createImageBitmap(blob, { imageOrientation: 'from-image' })` | `createImageBitmap(file)`，**冇個 options** | ⛔ **唔一樣** |
| 9 | **空白 canvas 檢查** | **有**（`samplesLookUniform` + `looksBlankBySize`） | **冇** | ⛔ **唔一樣** |
| 10 | **壓完大過原圖** | `if (out.size >= blob.size && !fit.scaled) fallback('no size win')` | **冇** | ⛔ **唔一樣** |
| 11 | **出事點算** | **回原圖，`compressed = false`，唔 throw** | **`throw`** | ⛔ **唔一樣** |

## 改咗嘅（Jason 明文拍板嗰兩項）

**第 1、2 項** —— `MAX_EDGE 2800 → 2400`、`JPEG_QUALITY 0.85 → 0.8`。

**改咗之後嘅原文：**

```
export const MAX_EDGE = 2400
export const JPEG_QUALITY = 0.8
…
62:    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
```

⭐ **確認送入 `canvas.toBlob` 嘅係 `0.8`，唔係 `80`。**
quote app 個常數本身就係 0–1，**冇正規化呢一步，亦唔需要**。
（tree app 傳 `80` 係因為佢個 API 收 1–100，喺 `imageCompress.ts:126` 先除 100。）
**測試釘死咗 `0 < JPEG_QUALITY ≤ 1`。**

## ⛔ 冇改嘅四項 —— 等你同 Jason 拍板

**⛔ 我唔會自己決定跟唔跟**，尤其係第 11 項，佢係一個**取態**唔係一個數字。

### 第 8 項：EXIF orientation ——⚠️ 我建議跟

tree app 原文註解講到明點解：

> Do NOT fall back to a bare createImageBitmap here: that would bake the
> UNROTATED pixels while dropping the EXIF flag, i.e. silently save a sideways
> photo

**後果**：喺唔會自動轉向嘅瀏覽器度，**張相會打橫存落去，而且冇聲出**。
**新版瀏覽器多數已經預設 `from-image`**，所以而家**唔一定**睇得出問題 ——
**但係靠預設，唔係靠寫明。**

**跟嘅代價**：舊引擎唔支援嗰個 options 就要**保留原圖唔壓**（同第 11 項連住）。

### 第 9 項：空白 canvas 檢查 ——⚠️ 我建議跟

**iOS 有 canvas 面積上限**，撞到就會畫出一張**全白但完全合法嘅 JPEG**。
⛔ **我哋而家嗰個 sha256 對數捉唔到佢** —— 白相都有 sha，對得返數。

### 第 10 項：壓完大過原圖就唔壓

細節位。影響：來源本身已經細過 2400 嗰陣，可能越壓越大。

### 第 11 項：出事點算 ——⛔ 呢個要你哋決定，我唔建議

| | 結果 |
| --- | --- |
| **tree app：回原圖** | 相**留得住**，但**唔係 2400/0.80**，而且可能好大 |
| **quote app：throw** | 相**冇咗**，用家要重影，但**留低嘅一定合規格** |

⚠️ **兩個都有道理，而且撞正 Jason 今次個決定**：
佢要「**兩個 app 出嚟嘅相一致**」——
**回原圖就會有唔一致嘅相混入去，正正係佢想避免嗰件事。**
**但 throw 就係為咗規格而掉咗一張現場影咗嘅相。**

⛔ **呢個要 Jason 揀。**

## ⚠️ 一個資料夾入面會有三種規格

**已經影咗嘅相唔會變。** 同一個 Drive 資料夾入面：

| 相 | 規格 | 尺寸 |
| --- | --- | --- |
| 三張舊測試相 | **2048 / q0.85** | 1536×2048 |
| Jason 2026-08-22 影嗰張 | **2800 / q0.85** | 2100×2800 |
| **呢個 commit 之後影嘅** | **2400 / q0.80** | 1800×2400 |

**將來睇相會覺得奇怪，所以寫低點解**：
呢個係 P3a／P3b 開發期間三次規格改動留低嘅痕跡 ——
**2048 係最初設定；2800 係我引錯咗 tree app 個值（I8）；
2400 / 0.80 先係對嗰個。**

⛔ **唔會回頭重壓舊相** —— 重壓會令 `sha256` 唔同，
「仲剩幾多份」個契約即刻驗唔到（§九）。**留低就留低。**

## 影響範圍：⭐ 你講得啱，唔使再 deploy Worker

**呢兩個常數喺 `src/lib/photoTransport.ts`，係前端 bundle 入面。**

- ✅ **Cloudflare Pages 會自動 build branch preview**
- ✅ **Jason 唔使再 `wrangler deploy`** —— Worker 一個字都冇改

⚠️ **但係要 build 完嗰個新 preview 先生效** ——
**開舊嗰個 preview 網址影相，仍然係 2800。**

---

# 第 8 / 9 / 10 項跟咗（2026-08-22）

## ⚠️ 但要先講一件你可能未為意嘅嘢：8/9/10 同 11 係綁住嘅

**tree app 嗰邊，8、9、10 三項嘅「動作」全部都係 `fallback(...)` —— 即係回原圖。**
**「偵測到有問題」同「跟住點做」係兩件事，而「跟住點做」就係第 11 項。**

**第 10 項尤其明顯**：「壓完大過原圖就用返原圖」——
**佢本身就係一個動作，唔係一個偵測。** 喺 throw 嘅世界入面，
佢會變成「壓完大過原圖 → 掉咗張相」，**呢個講唔通。**

### 所以我點做

**三項嘅偵測全部照跟、照抄埋門檻同理由**，
**但所有拒絕都行返同一個 function：`refuseToCompress()`。**

**佢而家嘅行為仍然係 throw（＝我哋原本嗰套）。**
**Jason 一答第 11 項，淨係要改呢一個 function**，唔使周圍搵。

⛔ **我冇偷偷幫佢揀。**

## 改咗之後嘅原文

**第 8 項 EXIF：**

```ts
// ⛔ 一定要 `imageOrientation: 'from-image'`（跟 tree app）。
//    ⚠️ 唔准 catch 完就用返一個冇 options 嘅 createImageBitmap ——
//    咁做會**燒低未轉向嘅像素同時掉咗 EXIF 標記**，
//    即係靜靜咁存低一張打橫嘅相
bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
```

**第 9 項 空白檢查（兩重）：**

```ts
if (samplesLookUniform(samplePixels(context, size.width, size.height))) {
  return refuseToCompress('張相讀返出嚟係一片空白（可能係部機嘅相片尺寸上限）。', file)
}
…
if (looksBlankBySize(blob.size, size.width, size.height)) {
  return refuseToCompress('壓完出嚟細到唔似一張真相（可能係一片空白）。', file)
}
```

**第 10 項：**

```ts
if (blob.size >= file.size && !size.scaled) {
  return refuseToCompress('壓完冇細過原本張相。', file)
}
```

## 「空白檢查」實際點檢 —— ⚠️ 呢個檢查錯咗就會誤殺好相，所以講清楚

### 偵測 #1：九點取樣，全部 byte 完全一樣

**取樣點**（相對座標，⛔ 特登分散得好開）：

```
0.1/0.5/0.9  ×  0.1/0.5/0.9   →  九個點
```

每點讀 `getImageData(x, y, 1, 1)` 攞 **RGBA 四個 byte**。
**九點嘅四個 byte 全部逐個一樣，先算白。**

**點解唔會誤殺**：**真相唔會有九個咁散嘅點 RGBA 逐個 byte 一樣。**
一片天空係**局部**均勻 —— 唔會連四個角同中心都一模一樣。

⚠️ **空輸入當作白** —— 「證明唔到佢係真相」要 fail safe。

### 偵測 #2：每像素少過 `0.02` byte

```
byteLength / (w × h) < 0.02
```

**tree app 實測嘅理由（原文）**：真嘅樹葉相喺 q85 度**約 0.27 B/px**
（實測 2800×2100 = 1.6 MB），而全白 JPEG 幾乎唔使錢。
**`0.02` 低過真相一個數量級、高過白相一個數量級**，所以分得開。

**測試釘咗三個位**：`0.27 B/px` 唔准當白、`0.019` 當白、`0.021` 唔當白。

### 為咗 #1 要喺編碼之前做

**`samplePixels` 喺 `toBlob` 之前行** —— 唔使花一次編碼落一張白相度，
亦即係話**捉到就即刻捉到**。

## ⛔ `2400` / `0.8` 喺 code 入面得一個出處

```
$ grep -rn "2400\|2800\|0\.85" src/ worker/ --include=*.ts --include=*.tsx --include=*.mjs | grep -v test
src/lib/photoTransport.ts:31:export const MAX_EDGE = 2400
src/lib/photoTransport.ts:32:export const JPEG_QUALITY = 0.8
```

**其餘全部係註解引出處。**
`targetSize()` 個 `maxEdge` 係參數，**唔會自己寫死一個數**；
`worker/` 完全冇呢兩個數（Worker 唔壓相）。

## preview 幾時先食到新 bundle —— Jason 做得到嘅講法

**條網址唔使換**：照開返 `claude-quote-app-scaffold-de.sylvan-quote.pages.dev`。

### ⛔ 但唔係即刻，要等 build 完

**Pages 收到 push 之後先要 build。** 睇 **Deployments** 見到嗰個
commit 變咗 **Success** 先好開。**通常一兩分鐘。**

### 冇 service worker

**呢個 app 冇 service worker、冇 PWA、冇 `public/_headers`** —— 實測：

```
$ grep -rn "serviceWorker|workbox|registerSW" src/ index.html public/
（冇結果）
$ ls public/
（空）
```

**即係唔會有一個 service worker 死攬住舊 bundle。**

### 但 `index.html` 有機會俾瀏覽器 cache 住

Vite 出嘅 JS 檔名帶住 hash（`index-XXXXXXX.js`），**新 build 一定係新檔名**。
**問題唔喺 JS，喺 `index.html`** —— 佢個名唔變，
**手機瀏覽器有機會用返上次嗰版**，於是照舊指去舊 JS。

**所以叫 Jason 咁做（由最輕到最重）：**

1. **喺 Pages 度確認個 deployment 係 Success**（唔好未 build 完就試）
2. **iPhone Safari：撳住重新整理個掣唔放** → 揀「重新載入而不使用內容封鎖器」；
   Android Chrome：右上角 ⋮ → **重新載入**
3. **仲係唔得就：完全熄咗個分頁再開過**（唔係後退，係關咗成個 tab）
4. **最穩陣**：**Safari → 設定 → 清除瀏覽記錄同網站資料**
   ⛔ **但呢一步會清埋 IndexedDB，即係清埋未上到雲端嘅相！**
   **做之前一定要確認所有相都係「已同步，兩份齊」。**

### ⭐ 唔使估：影完睇尺寸就知

**最實在嘅驗法唔係猜 cache**，係**影一張相之後喺 Drive 睇佢尺寸**：

- **1800×2400** → 食咗新 bundle ✅
- **2100×2800** → 仲係舊 bundle ❌

**一眼分得出，唔使我哋估。**

---

# 第 11 項跟咗：壓唔到就用返原相（2026-08-22）

## 改咗之後嘅原文 —— ⭐ 係 `return`，唔係 `throw`

```ts
export type CompressResult = {
  blob: Blob
  /** 空 = 正常壓咗。有值 = 壓唔到，上面呢個 `blob` 係原相。 */
  fallback: string
}

function keepOriginal(reason: string, original: Blob): CompressResult {
  console.warn('[quote-app] compress fallback:', reason, `(${original.size} bytes 原相照上)`)
  return { blob: original, fallback: reason }
}
```

**八個分支全部行返佢**（EXIF 唔支援、讀唔到尺寸、冇 2d context、九點全同、
讀唔到 canvas、`toBlob` 冇嘢、每像素太細、壓完冇細過原本）。
**⛔ 成個 module 冇一個 `throw`。**

正常嗰次：

```ts
return { blob, fallback: '' }
```

⚠️ **`fallback` 係空字串唔係 `undefined`** ——
咁樣「有冇 fallback」**永遠答得出**，⛔ 唔會靜靜咁唔知。有測試釘住。

## ⚠️ 我同意你，而且我要講明點解你講得啱

**我原本個建議（throw）排錯咗優先次序。**
成個副本契約嘅存在理由就係**唔可以失相**；
而「一模一樣」本身亦指向跟返 tree app 個 fallback。
**兩個理由都指向甲，我畀咗一個唔應該贏嘅理由贏。**

## fallback 唔准靜靜發生 —— 我揀咗 Drive `appProperties`

### 揀咗咩

**上 Drive 嗰陣，喺個檔嘅 `appProperties` 加一個 `compressFallback`，
入面就係原因。**

```js
const appProperties = { quotePhotoId: photoId }
if (compressFallback) appProperties.compressFallback = String(compressFallback).slice(0, 120)
```

**條路**：`compressToJpeg()` 回個 `fallback` → 存落本機嗰行
（`PendingPhoto.compressFallback`）→ `/mirror` 帶上去 → Worker 寫落 Drive。

### 對返你三個條件

**(a) 事後查得返，唔使靠估** ✅
**一句 `files.list` 就數得出**：

```
q:      '<folder id>' in parents and trashed = false
fields: files(id,name,size,appProperties)
```

**有 `compressFallback` 嘅就係 fallback，仲有原因。**
⛔ **唔使靠「睇尺寸估」** —— 尺寸估唔準（來源本身細過 2400 嗰啲都唔係 2400）。

**(b) 阿耀睇唔到** ✅
**佢淨係喺 Drive 嘅 metadata 度。**
畫面上張相照樣行「上緊 → 已入 R2 → 已同步，兩份齊」，
**冇多一個字、冇黃色、冇紅色**。⛔ 對佢嚟講成功咗就係成功咗。
（原因喺 `console.warn`，唔喺畫面。）

**(c) 冇新表、冇新欄、⛔ 冇 SQL** ✅

### 點解唔揀你提嗰幾個

- **`remark`** —— ⛔ 唔掂得。**佢係用家自己寫嘅備註**，
  P3d 會出喺同事版 PDF 度（第十章）。攞佢嚟裝系統訊息＝**污染用家資料**。
- **`drive_error` / `r2_error`** —— ⛔ 兩個問題。
  一，fallback **唔係 error**，擺喺 error 欄係講錯嘢。
  二，**`statusOfRow()` 用 `r2_error` 判斷「有事要人睇」** ——
  擺落去阿耀就會見到紅字，**直接違反 (b)**。
- **`marks` jsonb** —— ⛔ 佢係 P3d 畫線座標嘅位。
  而家搶咗佢，等於**幫 P3d 決定咗個資料格式**，而 P3d 未設計。
- **開一個新欄** —— 做得到，但**要 Jason 跑 SQL**，
  而 `appProperties` 已經做到 (a)(b)(c)，**唔值得為咗佢加一次 migration**。

### ⚠️ 一個要講明嘅限制

**張相未上到 Drive 之前，個記號淨係喺部機**（IndexedDB）。
**即係「只喺部機」同「已入 R2、Drive 未做」嗰兩個階段，server 側查唔到。**

**點解可以接受**：**呢兩個階段張相根本仲未入到共用資料夾**，
冇人會喺嗰陣去對相。**一上到 Drive，記號就同張相一齊到。**

⛔ **如果 Jason 想連 R2 階段都查得到，就要開個新欄，要佢跑 SQL。**
**我唔會自己開。**

---

# 🚨 B3 做唔到，而且我可以講定佢會點死（2026-08-22）

## 實際 code（唔係推測）

```
src/lib/photoUpload.ts:127      // P3a 一格得一張全景相，所以永遠係第一張 —— ⛔ 但係 1 唔係 0。
src/lib/photoUpload.ts:128      seq: 1,
```

```
$ grep -n "seq" src/components/PhotoSlot.tsx
（冇結果 —— PhotoSlot 完全冇掂 seq）
```

**⛔ `seq` 係寫死嘅 `1`，冇任何地方會 +1。**

## 所以同一格影第二張會點

1. 第二張攞到**新嘅 `operation_id`** → **R2 key 唔同** → **上到 R2，冇覆蓋第一張** ✅
2. DB 開新一行，**但 `seq` 又係 `1`**
3. 砌檔名 → `NN = 2×1−1 = 01` → **同第一張一模一樣嘅檔名**
4. `/mirror`：用自己個 `quotePhotoId` 揾 → 揾唔到 →
   **`findNameClash` 揾到第一張嗰個檔（`quotePhotoId` 唔啱）**
5. **⛔ 拒絕，回 409，寫入 `drive_error`**

**結果**：第二張**停喺「已入 R2（Drive 未做）」**，
試夠三次之後**轉「有事要人睇」**，紅字寫住撞名。

⭐ **⛔ 唔會靜靜咁食咗佢** —— I7 個保護生效。**但功能上 B3 過唔到。**

## 呢個唔係 bug，係範圍

**「一格多張」係 P3c**（`docs/P3-現場影相-設計.md` 第一章）。
**P3a 由頭到尾就係一格一張**，`seq: 1` 嗰句註解都寫住。

⛔ **所以唔應該而家改** —— 改 `seq` 就係做 P3c 嘅一部分，
而 Jason 揀咗**先做 B 收尾，跟住先 P3c**。

## B3 可以改成驗咩（⛔ 揀唔揀係你哋決定）

**原本嘅 B3「驗成對編號 01/03/05」而家驗唔到**，因為根本行唔到嗰條路。

**但同一個動作驗得到另一樣，而且係今日最想驗嗰樣**：

**同一格影第二張 → 預期見到「有事要人睇」＋撞名嘅中文 →
Drive 入面淨係得一個檔。**

**呢個正正就係 I7 嗰個保護喺真機行一次** ——
而 `CLAUDE.md` 引嘅 tree app 規矩講到明：
**「只喺出事嗰刻先見到」嘅 UI，gate 綠係零證據。**

**成對編號本身，要等 P3c 做完先驗得到。**

---

# B4：⛔ 冇一個乾淨嘅方法喺真機迫到 fallback

**照你嘅要求，我唔砌一個勉強嘅出嚟。**

## 逐個分支睇，八個入面：

| 分支 | 真機迫唔迫到 |
| --- | --- |
| EXIF 唔支援 | ⛔ **迫唔到** —— 要一個唔識 `imageOrientation` 嘅舊引擎 |
| 讀唔到尺寸 / 冇 2d context | ⛔ **迫唔到** —— 要瀏覽器壞咗 |
| `toBlob` 冇嘢出 | ⛔ **迫唔到** |
| **九點全同** | ⚠️ **可能**：遮住鏡頭喺暗處影。但**唔保證** —— sensor 有噪點 |
| **每像素 < 0.02 B** | ⚠️ **最有機會**：2400×1800 嘅門檻係 **約 86 KB**，遮鏡頭影一張全黑相好可能低過 |
| 壓完冇細過原本 | ⚠️ 要一張**長邊 ≤ 2400** 而且壓完唔細得過嘅來源，要砌，唔自然 |

## ⛔ 但佢過唔到你第 (c) 個條件

**「做完之後系統要自己返返正常，唔使人手清理」——做唔到。**

**任何真機嘗試都會整出一行真嘅 `quote_photos`、一個 R2 object、
一個 Drive 檔**，同 C2 嗰啲測試相一樣要人手清。

**而且唔保證撞到** —— 影完可能係一張正常嘅黑相，乜都證明唔到。

## 我建議降級做「已知未驗」，但由你哋決定

**⛔ 我唔會為咗剔一個格而 ship 一個測試 flag。**
你講得啱：一個為測試而存在嘅 flag 就係**多咗一條 production 行得到嘅路**。

### 替代嘅信心來源 —— 講實佢覆蓋到咩、覆蓋唔到咩

**測試覆蓋到（196 個測試入面）：**

- `looksBlankBySize` —— **0.019 當白 / 0.021 唔當白 / 0.27 B/px 唔當白 /
  零 bytes 同零尺寸 fail safe**（四個 case）
- `samplesLookUniform` —— **九點全白全黑當白 / 一個 byte 唔同就唔當白 /
  淨係 alpha 唔同都唔當白 / 空輸入 fail safe**（四個 case）
- `CompressResult.fallback` 一定係字串，**正常嗰次係 `''` 唔係 `undefined`**

**⛔ 測試覆蓋唔到（老實講）：**

- **`compressToJpeg` 成個 function 冇 DOM 測試** ——
  `createImageBitmap` / `canvas` 喺 node 冇
- **即係「偵測到之後真係會回原相」呢件事，冇喺瀏覽器行過**
- **EXIF 分支零覆蓋**

**⚠️ 換句話講**：**判斷條件本身測得好足，但「條路真係接返一齊」冇驗過。**

### 如果要驗，最低成本嘅做法

**唔係喺真機，係喺我個本機 harness** ——
餵一張**人手砌嘅全灰 PNG**入去，行真 `compressToJpeg`，
睇佢係咪回原相同埋 `fallback` 有值。

**代價**：⛔ **唔係真機**，證明唔到 iOS 個 canvas 面積上限；
**但證明到「偵測 → 回原相 → 上到 R2 → 上到 Drive → appProperties 有記號」成條路接得返。**

⛔ **要唔要做，你哋話事。**

## 驗嘅地方你估啱咗

**Drive `appProperties.compressFallback`** —— 確認。

```
fields: files(id,name,size,appProperties)
```

**有 `compressFallback` = fallback 咗，入面就係原因。**
⚠️ 畫面上**乜都唔會顯示**（條件 (b)），所以**唔好喺 app 度揾**。
