# Drive 授權 —— 逐步指示（讀出嚟帶 Jason 做）

**一句講晒：呢一步係攞一條「長期通行證」，等 quote app 個 Worker 可以幫你放相入你個 Drive。**

⛔ **呢個係 quote app 自己嘅授權。**
**唔准掂 tree app 個 `tree-drive-mirror`，唔准掂佢嘅 credential，一個字都唔准改。**
（兩個 app 各有各嘅授權，將來收返其中一個唔會影響另一個。）

> 寫法：**每一步都寫「撳邊個掣、見到咩畫面、跟住撳咩」。**
> ⚠️ Google 個介面**間唔中會改字**。如果見到嘅字同呢度寫嘅**唔完全一樣**，
> 睇返每步下面嗰句「你要揾嘅係…」，照個意思揾。
> **揾唔到就停低影張截圖，唔好靠估撳。**

---

## 開始之前

- 用 **Jason 自己個 Google 帳戶**登入（就係而家放住 `Quote App Photos` 嗰個）。
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

**左上角**，Google Cloud logo 右邊，有一個**下拉掣**（可能寫住
`Select a project`，或者已經有個專案名）。**撳佢。**

**見到**：一個細窗，上面寫 `Select a project`，右上角有 **NEW PROJECT**。

**你要揾嘅係**：一個「揀／開專案」嘅下拉掣。

### 步驟 3

撳 **NEW PROJECT**。

**見到**：`Project name` 一個輸入框。

**打**：`quote-app-drive`

撳 **CREATE**。

**等**大約 10 至 30 秒。右上角會出一個通知話開好咗。

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

**見到**：一版 Google Drive API 嘅介紹，有個藍色 **ENABLE** 掣。

撳 **ENABLE**。

**等**十幾秒。**之後個掣會變成 `MANAGE`** —— 咁就係開好咗。

**你要揾嘅係**：由 `ENABLE` 變成 `MANAGE`。

---

## 第三部分：填同意畫面

### 步驟 7

左邊**選單**（如果冇，撳左上角三條橫線 ☰）→ 揀 **APIs & Services**
→ 揀 **OAuth consent screen**。

### 步驟 8

**見到**：問你揀 `Internal` 定 `External`。

- 如果係**公司 Google Workspace 帳戶** → 揀 **Internal**
- 如果係**普通 gmail.com** → 揀 **External**

撳 **CREATE**。

⚠️ **揀咗邊個，話返我知。** 揀 `External` 嘅話步驟 11 有多一步。

### 步驟 9

填三格：

- **App name**：打 `quote-app`
- **User support email**：喺下拉度揀你自己個 email
- **Developer contact information** → **Email addresses**：打返你自己個 email

⚠️ 其餘全部**留空**，唔使填。

撳 **SAVE AND CONTINUE**。

### 步驟 10

**見到**：`Scopes` 呢一版。

⛔ **咩都唔好撳，直接撳落面 `SAVE AND CONTINUE`。**
（權限我哋喺後面一步先揀，喺呢度揀反而會撞。）

### 步驟 11

**如果步驟 8 揀咗 `External`：**

**見到**：`Test users` 呢一版。

撳 **+ ADD USERS**，打**你自己個 email**，撳 **ADD**，再撳 **SAVE AND CONTINUE**。

⚠️ **唔加呢一步，最後授權嗰陣會俾佢擋住。**

**如果揀咗 `Internal`**：冇呢一版，直接跳去步驟 12。

### 步驟 12

**見到**：`Summary`。撳 **BACK TO DASHBOARD**。

---

## 第四部分：開一個 OAuth client

### 步驟 13

左邊選單 → **APIs & Services** → **Credentials**。

### 步驟 14

**最上面**撳 **+ CREATE CREDENTIALS**，喺跌出嚟嘅清單揀 **OAuth client ID**。

### 步驟 15

**Application type**：喺下拉揀 **Web application**。

**Name**：打 `quote-app-worker`

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

**剔咗** `Use your own OAuth credentials` 呢個剔。

**見到**：多咗兩格 `OAuth Client ID` 同 `OAuth Client secret`。

**貼返步驟 17 抄低嗰兩串字入去。**

⚠️ 貼完檢查**頭尾冇多咗空格**。

### 步驟 20

喺**左邊**個框（寫住 `Input your own scopes`）**貼呢一行**：

```
https://www.googleapis.com/auth/drive.file
```

⚠️ **一個字都唔好改。**
呢個係**最細嗰個權限** —— 佢**只可以掂呢個 app 自己整嘅檔**，
**掂唔到你 Drive 入面其他嘢**，包括 tree app 嗰啲相。

撳藍色 **Authorize APIs**。

### 步驟 21

**見到**：Google 登入畫面。**揀返 Jason 自己個帳戶。**

**如果見到**「Google hasn't verified this app」／「未經驗證」：
撳 **Advanced**（或者「進階」）→ 撳 **Go to quote-app (unsafe)**。

⚠️ **呢個係正常嘅。** 因為呢個 app 係你自己頭先開嘅，冇上架俾人審。

跟住撳 **Continue** / **Allow**。

### 步驟 22

**畫面會彈返去 OAuth Playground**，左邊 **Step 2** 度會有一串
`Authorization code`。

撳藍色 **Exchange authorization code for tokens**。

### 步驟 23

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

**佢哋要放落 Worker 嘅 secret 度**，用呢三句
（喺 `worker/` 資料夾入面跑，一句一句嚟，佢會叫你貼）：

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

⚠️ **P3a 個 R2 key 貼錯過一次**（貼咗個標籤名，唔係真正嘅 key，
見 `docs/開發紀錄.md` 附錄 A I5）。
**呢次三串字，貼之前每串都睇多次頭尾。**

---

## ⚠️ 一件開工前要決定嘅事：個根資料夾

**`drive.file` 呢個權限，只睇得到「呢個 app 自己整嘅檔」。**

出處：tree app 自己個 Worker 寫住
*"drive.file only sees app-created files"*（`worker/src/worker.mjs`
`ensureFolder` 上面嗰句註解），而 tree app 用嘅**都係 `drive.file`**
（`worker/src/worker.mjs:48`）。

**即係話：Jason 2026-08-22 上午 9:24 用手整嗰個 `Quote App Photos` 資料夾，
個 Worker 係睇唔到嘅。** 佢會當「冇呢個 folder」，然後**自己整多一個同名嘅**。

**結果就係 Drive 度有兩個 `Quote App Photos`** ——
呢個正正就係 `docs/開發紀錄.md` §二 記低嗰個坑
（Jason 個 Drive 而家已經有 `Sylvan Tree Photos` 同 `Tree App Photos` 兩個似名資料夾）。

### 兩條路（⛔ 等 Jason 揀）

**甲：留返 `drive.file`，等 Worker 自己整個根資料夾（建議）**

- 權限最細，**掂唔到 tree app 嗰啲相**
- 同 tree app 做法一致
- **代價**：Jason 要**先手動刪咗／改名**嗰個空嘅 `Quote App Photos`，
  唔係就會有兩個同名資料夾
- （個資料夾係空嘅，所以刪佢**唔涉及任何相片**）

**乙：改用 `drive` 全權限，等 Worker 睇得到手動整嗰個資料夾**

- 唔使刪嘢
- ⛔ **代價好大**：個 token **睇得晒成個 Drive**，
  包括 **tree app 全部相**。一個 bug 就可以掂到唔關佢事嘅嘢。

**我建議甲。** 呢個 Drive 同時放住 tree app 嘅生產相片，
**權限開得越細越好**；而要刪嗰個資料夾係**空**嘅。

⛔ **未揀之前唔好跑步驟 20** —— 因為要貼落去嗰個 scope 就係呢個決定。
