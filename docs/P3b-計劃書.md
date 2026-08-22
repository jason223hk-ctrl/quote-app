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
- [ ] 前置二：Drive 授權已經撳（指示喺 `docs/Drive-授權-逐步指示.md`）
- [x] Worker 點讀 `quote_records` / `quote_trees` —— **2026-08-22 定咗：用家 token，⛔ 唔開 grant**
- [x] 「一張相幾時鏡像」—— **2026-08-22 定咗：影完即刻試，唔得就下次開 app 補**
- [x] §7.5 三條實作細節 —— **2026-08-22 Jason 拍板：分批三張／連續失敗三次停／過渡狀態唔入清單**
- [x] ⛔ 舊樹顯示「修剪（未細分）」—— **2026-08-22 Jason 親眼睇過
      （`Testing01` 樹 #125）**
- [x] ⛔ 新排位（移除拎出嚟、近景搬入其他）—— **2026-08-22 Jason 睇咗，答「啱」**
- [ ] ⛔ 改咗 `seq` 之後，影相上 R2 要 Jason 重新驗一次
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
