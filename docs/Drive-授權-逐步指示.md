# Drive 授權 —— 逐步指示（讀出嚟帶 Jason 做）

**一句講晒：呢一步係攞一條「長期通行證」，等 quote app 個 Worker 可以幫你放相入你個 Drive。**

⛔ **呢個係 quote app 自己嘅授權。**
**唔准掂 tree app 個 `tree-drive-mirror`，唔准掂佢嘅 credential，一個字都唔准改。**

> 寫法：**每一步都寫「撳邊個掣、見到咩畫面、跟住撳咩」。**
> ⚠️ Google 個介面**間唔中會改字**。見到嘅字同呢度寫嘅唔完全一樣，
> 就睇每步下面嗰句「**你要揾嘅係**…」，照個意思揾。
> **揾唔到就停低影張截圖，唔好靠估撳。**

---

## ⚠️ 開始之前要知：呢次攞嘅係闊權限

**Jason 2026-08-22 本人批咗用闊權限（`drive`）。**

**即係話呢條通行證，睇得晒你成個 Google Drive** ——
tree app 全部相、公司檔案、私人檔案，全部。

**開發側原本建議窄權限**（`drive.file`，只掂得到 app 自己整嘅檔）。
**Jason 喺明白後果之後，仍然揀咗闊權限。**
完整經過同理由寫喺 `docs/開發紀錄.md` §十二 第 13 項 —— **唔係喺呢度decide，
呢度只係執行。**

**好處**：**用得返你 2026-08-22 上午 9:24 手動開嗰個 `Quote App Photos`**，
⛔ **唔使刪嘢，亦唔會出現兩個同名資料夾。**

---

## 開始之前

- ⛔ **一定要用 `sylvantree2026@gmail.com` 登入。**

  **`Quote App Photos` 個資料夾係喺呢個帳戶度**（2026-08-22 Jason 確認）。
  ⚠️ **唔係 `jason223hk@gmail.com`** —— 呢份文件之前寫錯咗，已經更正。

  **登錯帳戶嘅後果**：條 refresh token 會綁咗第二個 Drive，
  個 Worker 之後**揾唔到嗰個資料夾**，會**自己開多一個同名嘅**。
- 用**電腦**做，唔好用手機。
- 全程大約 **15 分鐘**。
- 最尾會有**三串字**要抄低（`Client ID`、`Client secret`、`Refresh token`）。
  ⛔ **呢三串字唔可以貼落 WhatsApp、唔可以入 repo。** 抄喺紙度或者 password manager。

---

## 第一部分：開一個 Google Cloud 專案

### 步驟 1

開瀏覽器，去 **https://console.cloud.google.com/**

**見到**：一個叫 Google Cloud 嘅版面，左上角有個 Google Cloud logo。

如果彈出「同意條款」，剔咗個剔，撳 **AGREE AND CONTINUE**。

### 步驟 2

**左上角**，Google Cloud logo 右邊，有一個**下拉掣**
（可能寫住 `Select a project`，或者已經有個專案名）。**撳佢。**

**見到**：一個細窗，上面寫 `Select a project`，右上角有 **NEW PROJECT**。

**你要揾嘅係**：一個「揀／開專案」嘅下拉掣。

### 步驟 3

撳 **NEW PROJECT**。

**見到**：`Project name` 一個輸入框。

**打**：`quote-app-drive`

撳 **CREATE**。**等**大約 10 至 30 秒，右上角會出通知話開好咗。

### 步驟 4

**再撳返左上角個下拉掣**，喺清單度**揀返 `quote-app-drive`**。

⚠️ **呢步好緊要。** 揀錯專案，後面全部嘢會開錯地方。
**撳完之後，左上角應該顯示住 `quote-app-drive`。**

---

## 第二部分：開啟 Drive API

### 步驟 5

喺**最上面**個搜尋框，打：`Google Drive API`

**見到**：搜尋結果。揀入面 **Google Drive API**（通常第一個，副題寫住 Marketplace）。

### 步驟 6

**見到**：一版 Google Drive API 嘅介紹，有個藍色 **ENABLE** 掣。撳佢。

**等**十幾秒。**個掣會變成 `MANAGE`** —— 咁就係開好咗。

**你要揾嘅係**：由 `ENABLE` 變成 `MANAGE`。

---

## 第三部分：填同意畫面

### 步驟 7

左邊**選單**（如果冇，撳左上角三條橫線 ☰）→ **APIs & Services**
→ **OAuth consent screen**。

### 步驟 8 —— 揀 **External**

**見到**：`User Type`，下面有 **External**（有啲版本寫「外部」）。

**揀 `External`，撳 `CREATE`。**

⚠️ **唔使諗，一定係 External。**
`Internal` 只會喺**公司 Google Workspace 機構帳戶**度出現，
而 `sylvantree2026@gmail.com` 係**普通 Google 帳戶**，
**所以個畫面根本唔會俾你揀 `Internal`**（可能係灰色，可能根本冇）。

#### ⚠️ 「External」唔係「公開畀全世界用」

見到 `External` 好易以為係「任何人都用得」。**唔係。**

**實際情況係：`External` ＋ 未發佈 ＋ 只加咗你自己做 Test user
＝ 只有你自己個帳戶授權得到。**
**其他人就算攞到條網址，撳極都用唔到。**

（「加自己做 Test user」就係下面**步驟 11**，⛔ **必做**。）

### 步驟 9

填三格：

- **App name**：打 `quote-app`
- **User support email**：喺下拉揀 **`sylvantree2026@gmail.com`**
- **Developer contact information** → **Email addresses**：
  打 **`sylvantree2026@gmail.com`**

⚠️ 其餘全部**留空**，唔使填。撳 **SAVE AND CONTINUE**。

### 步驟 10

**見到**：`Scopes` 呢一版。

⛔ **咩都唔好撳，直接撳落面 `SAVE AND CONTINUE`。**
（權限我哋喺步驟 20 先揀，喺呢度揀反而會撞。）

### 步驟 11 —— ⛔ 必做：加自己做 Test user

**見到**：`Test users` 呢一版。

撳 **+ ADD USERS**，打 **`sylvantree2026@gmail.com`**，撳 **ADD**，
再撳 **SAVE AND CONTINUE**。

⛔ **唔加呢一步，步驟 21 授權嗰陣會俾佢擋住，成件事行唔落去。**

⚠️ **加完之後喺個清單度睇多次個 email 有冇打錯。**

### 步驟 12

**見到**：`Summary`。撳 **BACK TO DASHBOARD**。

---

## 第四部分：開一個 OAuth client

### 步驟 13

左邊選單 → **APIs & Services** → **Credentials**。

### 步驟 14

**最上面**撳 **+ CREATE CREDENTIALS**，喺跌出嚟嘅清單揀 **OAuth client ID**。

### 步驟 15

- **Application type**：喺下拉揀 **Web application**
- **Name**：打 `quote-app-worker`

### 步驟 16

⚠️ **呢步最易漏，漏咗後面會出 `redirect_uri_mismatch`。**

搵到 **Authorised redirect URIs**（有啲版本寫 `Authorized redirect URIs`），
撳 **+ ADD URI**，然後**一個字都唔差咁貼呢條**：

```
https://developers.google.com/oauthplayground
```

⚠️ **尾巴冇斜線。** 貼完睇多次。

### 步驟 17

撳 **CREATE**。

**見到**：一個細窗，寫住 **OAuth client created**，入面有兩串字：

- **Client ID**（好長，通常 `.apps.googleusercontent.com` 結尾）
- **Client secret**

⭐ **兩串都抄低。** 撳右邊嘅複製圖示，逐串貼落一個安全嘅地方。

⛔ **抄唔到就唔好撳走個窗** —— 撳走咗 secret 就要重新開過一個 client。

撳 **OK**。

---

## 第五部分：攞 Refresh token

### 步驟 18

開一個新分頁，去 **https://developers.google.com/oauthplayground/**

**見到**：左邊一條長長嘅 API 清單，右上角有個**齒輪圖示 ⚙**。

### 步驟 19

撳**右上角個齒輪 ⚙**。

**見到**：一個叫 `OAuth 2.0 configuration` 嘅面板。

**剔咗** `Use your own OAuth credentials`。

**見到**：多咗兩格 `OAuth Client ID` 同 `OAuth Client secret`。
**貼返步驟 17 抄低嗰兩串字入去。**

⚠️ 貼完檢查**頭尾冇多咗空格**。

### 步驟 20

喺**左邊**個框（寫住 `Input your own scopes`）**貼呢一行**：

```
https://www.googleapis.com/auth/drive
```

⚠️ **一個字都唔好改。**（呢個就係 Jason 批咗嘅闊權限。）

撳藍色 **Authorize APIs**。

### 步驟 21 —— 揀帳戶

**見到**：Google 登入畫面。

⛔ **揀 `sylvantree2026@gmail.com`** —— 就係放住 `Quote App Photos` 嗰個。

⚠️ **如果部機同時登住幾個 Google 帳戶，呢一步最易撳錯。**
**撳之前睇實個 email。**

### 步驟 22 —— ⚠️ 「未經驗證」嗰版，你一定會撞到

**見到**：一版寫住
**「Google hasn't verified this app」**，
中文版係**「Google 尚未驗證這個應用程式」**。

⚠️ **呢個係正常嘅，唔係出錯。**
因為呢個 OAuth client 係你自己頭先開嘅，冇上架俾 Google 審。

**點做：**

1. 撳細細個嘅 **Advanced**（中文：**進階**）——
   通常喺左下角，字細過其他嘢
2. **見到**：多咗一行藍字 **Go to quote-app (unsafe)**
   （中文：**前往 quote-app（不安全）**）
3. **撳嗰行藍字**

**你要揾嘅係**：一個「展開」嘅細字掣，撳完會出一行「照樣前往」嘅藍字。

⚠️ **如果揾唔到 `Advanced`**：睇下係咪俾 `BACK TO SAFETY` 呢個大掣
食咗你注意力 —— ⛔ **唔好撳 `BACK TO SAFETY`**，撳咗就要重頭嚟過。

### 步驟 23 —— 同意權限

**見到**：一版列住呢個 app 想要嘅權限，會有一句類似
**「See, edit, create and delete all of your Google Drive files」**。

⚠️ **呢句就係闊權限。見到佢係啱嘅** —— Jason 批嘅就係呢個。

撳 **Continue**（中文：**繼續**）／ **Allow**（**允許**）。

### 步驟 24

**畫面會彈返去 OAuth Playground**，左邊 **Step 2** 度會有一串
`Authorization code`。

撳藍色 **Exchange authorization code for tokens**。

### 步驟 25

**見到**：右邊出現一段 JSON，入面有一行：

```
"refresh_token": "1//0g........."
```

⭐ **抄低 `refresh_token` 引號入面嗰串字。**

⚠️ **如果冇 `refresh_token` 呢一行**（只有 `access_token`）：
即係呢個帳戶之前已經授權過。
**去 https://myaccount.google.com/permissions ，揾 `quote-app`，撤銷佢，
然後由步驟 20 再做一次。**

---

## 做完之後：三串字點處理

你手上應該有：

1. **Client ID**
2. **Client secret**
3. **Refresh token**

⛔ **唔好貼落 WhatsApp、Email、或者任何對話。**
⛔ **唔好入 repo。**

**佢哋要放落 Worker 嘅 secret 度**，喺 `worker/` 資料夾入面跑呢三句，
一句一句嚟，佢會叫你貼：

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

⚠️ **P3a 個 R2 key 貼錯過一次**（貼咗個標籤名，唔係真正嘅 key，
見 `docs/開發紀錄.md` 附錄 A I5）。
**呢次三串字，貼之前每串都睇多次頭尾。**

---

## ✅ 根資料夾：唔使做嘢

因為攞咗闊權限，**個 Worker 睇得到你手動開嗰個 `Quote App Photos`**，
**直接攞佢做根資料夾。**

⛔ **唔使刪、唔使改名、唔使等 app 自己開多一個。**

---

## 附註：原本建議嗰個窄權限（冇採用）

開發側原本建議 **`https://www.googleapis.com/auth/drive.file`**，
即係 app **只掂得到自己整嘅檔**。

**冇採用嘅代價（如果將來想轉返窄）**：
`drive.file` 睇唔到手動開嘅資料夾
（tree app 自己個 Worker 都咁寫：*"drive.file only sees app-created files"*），
所以轉返窄嗰陣，**要順手處理個根資料夾**——
唔係就會出現**兩個同名 `Quote App Photos`**。

**呢個唔係永久決定，見 `docs/開發紀錄.md` §十二 第 13 項。**
