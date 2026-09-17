# Service Worker ／ 離線 —— 報告

**2026-09-16。⛔ 呢份係報告，⛔ 一行 code 都冇寫。**

⛔ **Jason 明文講過**：「一個寫得差嘅 SW 會永遠拍舊版 code 出來，比冇更差。」
⇒ 所以呢度先講清楚**今日實際係點**、**過唔過到驗收**、**做落去有咩伏**，
⛔ **拍板之前唔會寫。**

---

## 一句講晒

⭐⭐ **報價 app ⛔ 冇 service worker。**
⇒ **⛔ 冇任何一個「設計上保證離線開得到」嘅機制。**

⭐⭐ **2026-09-16 補：喺線上真網站量咗，已經⛔ 唔使再估。**

```
https://sylvan-quote.pages.dev/
  cache-control: public, max-age=0, must-revalidate      （/ 同 /manifest.webmanifest 兩個都係）
  navigator.serviceWorker.getRegistrations()  →  0
  caches.keys()                               →  []
```

⭐ **`must-revalidate` 即係：冇網嗰陣瀏覽器 ⛔ 唔准攞舊嗰份出嚟頂。**

⇒ **`docs/上線清單.md` 第 1 條第 4 步「再開」，⛔ 唔係「未驗」，係「今日實測過唔到」** ——
⭐ 而且**過唔到係設計上嘅，⛔ 唔係行運唔行運**。

---

## 一、報價 app 有冇 SW —— ⭐ 實錘：⛔ 冇

```
grep -rniE "serviceworker|workbox|vite-plugin-pwa|registerSW" \
     src/ public/ index.html vite.config.ts package.json worker/src/
→ ⛔ 零個
```

`package.json` 全部 dependency（17 個）：

```
@eslint/js  @pdf-lib/fontkit  @supabase/supabase-js  @types/node  @types/react
@types/react-dom  @vitejs/plugin-react  eslint  globals  pdf-lib  playwright
react  react-dom  typescript  typescript-eslint  vite  vitest
```

⛔ **一個 PWA／workbox／offline 相關嘅都冇。**

亦都**⛔ 冇 `_headers`、⛔ 冇 `_redirects`** ——
即係 Cloudflare Pages 派咩 header，我哋**一個字都冇指定過**，全部行佢預設。

---

## 二、tree app 有冇 SW —— ⛔ 我查唔到，⛔ 唔會估

兩條路都行唔通：

- `tree-app-v7` ⛔ **唔喺我可以讀嘅範圍**（`CLAUDE.md` §3：只可以讀嚟參考，而今次
  連 repo 都冇喺 session 入面）
- 出唔到外網：`curl https://tree-app-v7.pages.dev/manifest.webmanifest`
  → **`CONNECT tunnel failed, 403`**

### ⚠️ 而且有一樣⛔ 唔可以假設

**tree app 有 manifest ≠ tree app 離線開得到。**
⭐ **manifest 只係令佢「裝到做 app、冇網址列」；離線開唔開得到係 service worker 嘅事。**
⇒ ⛔ **唔好因為 tree app 冇網址列，就當佢離線冇問題。** 佢可能**中緊同一個窿**。

### 要點樣先查得到（⛔ 要人喺有網嘅機上面做）

喺 Chrome 開 `https://tree-app-v7.pages.dev`，F12 → Console 打：

```js
navigator.serviceWorker.getRegistrations().then(r => console.log('SW 數量', r.length, r))
```

⚠️ **一開就即刻問會唔準** —— 第一次到訪嗰陣個 SW 可能仲喺度裝。
⭐ **要開兩次**：第一次開完閂咗，第二次再開先問。

⭐ 更直接：**F12 → Application → Service Workers**，睇有冇一個 activated 嘅。

---

## 三、冇 SW 嘅真後果 —— ⭐ 實測，⛔ 唔係推論

做法：`npm run build` 出真 bundle，起一個本機 server 派佢，
**開一次 app（載齊嘢）→ 閂咗 → 熄咗個 server（＝ 部機冇網，但瀏覽器 cache 仲喺）→ 再開**。

⭐ **特登熄 server ⛔ 唔用 `setOffline`** —— `setOffline` 有機會喺查 cache 之前
就攔咗個請求，咁樣個結論會**太強**（會變成「一定開唔到」，而其實未試過 cache）。

| 派咩 `cache-control` 俾 `index.html` | 上線開得到 | 熄咗 server 再開 |
| --- | --- | --- |
| `public, max-age=0, must-revalidate`（⭐ Cloudflare Pages 派 HTML 嘅典型做法） | ✓ | **✗ ⛔⛔ 開唔到**（`ERR_CONNECTION_REFUSED`） |
| `public, max-age=3600`（⚠️ 假設：連 HTML 都畀 cache 一個鐘） | ✓ | **✓ 開得到**（HTTP 200，由 cache 出） |

### ⭐⭐ 呢兩行講嘅嘢

**「離線開唔開得到」⛔ 唔係由我哋 code 決定，係由一個 HTTP header 決定** ——
而嗰個 header **我哋從來冇寫過**（冇 `_headers`），由 Cloudflare 自己派。

⚠️ **而且就算行運派咗個肯 cache 嘅 header，佢一樣⛔ 唔係保證**：
HTTP cache 係**會過期、會俾人清、會喺部機夠位嗰陣俾瀏覽器踢走**嘅。
⭐ 一個現場 app 嘅「入唔入到去」如果係靠瀏覽器嘅心情，**就係冇保證**。

---

## 四、⭐⭐ 上線清單第 1 條，今日逐步過唔過

`docs/上線清單.md` 第 1 條原文嘅五步：

| 步 | 做乜 | 今日 |
| --- | --- | --- |
| 1 | 影五張相 | ✅ 得（寫落 IndexedDB） |
| 2 | 即刻校飛航模式 | ✅ 得 |
| 3 | **完全閂 app** | ✅ 得 |
| 4 | **再開** | ⛔⛔ **就係呢步。冇 SW ⇒ 開唔開得到⛔ 冇保證**（見第三節） |
| 5 | 五張仲在，寫住「未上載 5 張」 | ⚠️ **行到第 4 步先知** |

### ⭐ 講清楚一樣，免得驚錯

**啲相⛔ 唔會冇咗。** IndexedDB 係獨立於 SW 嘅，閂 app、熄機都仲喺。
⇒ **問題⛔ 唔係「相冇咗」，係「入唔到去攞」。**

⚠️ 但對現場同事嚟講**分別唔大**：佢喺山上面開唔到個 app，
就係開唔到 —— ⭐ 而嗰一刻佢**唔會知**啲相其實仲喺部機入面。

### ⇒ 所以第 1 條嗰個「⛔ 未驗」其實比字面更差

`上線清單.md` 而家寫「畫面永遠見到『未上載 N 張』｜⛔ 未驗」。
⭐ **今日至少知多咗一樣：佢有可能⛔ 唔係「未驗」，而係「驗唔過」** ——
而且**卡喺一個同「未上載 N 張」完全無關嘅位**（個 app 開唔開得到）。

---

## 五、✅ 已經量咗（⛔ 唔使再跑 curl）

**2026-09-16，喺線上真網站量返嚟：**

| 量咗乜 | 結果 |
| --- | --- |
| `/` 嘅 `cache-control` | **`public, max-age=0, must-revalidate`** |
| `/manifest.webmanifest` 嘅 `cache-control` | **一樣** |
| `navigator.serviceWorker.getRegistrations()` | **0** |
| `caches.keys()` | **`[]`** |

⭐ 對返第三節張表：**第一行嗰個就係今日線上嘅情況** ⇒ **⛔ 開唔到。**

⚠️ **`must-revalidate` 呢個字特別要記住**：佢⛔ 唔係「盡量問下伺服器」，
係「**冇問到就⛔ 唔准出舊嗰份**」。⇒ 飛航模式之下瀏覽器**連試都唔會試**。

⇒ 所以第三節嗰個「睇 Cloudflare 派咩 header」已經有答案：
**佢派嘅就係最差嗰個。** ⭐ 而呢個⛔ 唔係 Cloudflare 做錯 ——
**對一個冇 SW 嘅網站嚟講，佢派呢個 header 係啱嘅**（唔好派舊 HTML）。
問題喺我哋**冇 SW**。

## 六、如果要做 SW —— ⛔ 伏喺邊（Jason 嗰句驚嘅嘢係真嘅）

> 「一個寫得差嘅 SW 會永遠拍舊版 code 出來，比冇更差。」

⭐ **呢句⛔ 唔係過慮，係 SW 最經典嗰個病。** 成因：

SW 裝咗之後，**佢自己就變成派檔嗰個人**。如果佢寫成「有 cache 就出 cache」
（cache-first）而**冇一條更新嘅路**，咁就算你 push 咗新版上線，
**部機永遠出返舊嗰份** —— 而且**⛔ 唔會出錯、⛔ 冇任何警告**。

### ⚠️ 最毒嗰點：佢會令「對 Build ID」呢個習慣一齊失效

`CLAUDE.md` §4 寫住：上線後開網址核對底部／設定頁嘅 **Build ID**，
short SHA 要同最新 commit 對得返。

⭐ **一個壞咗嘅 SW 之下，你對 Build ID 會見到舊嗰個 SHA** ——
睇落好似「部署失敗」，**於是有人會再 deploy 一次、再一次、再一次**，
⛔ 而每次都一樣。**個真原因喺部機，唔喺 Cloudflare。**

### ⇒ 所以如果做，有幾條係⛔ 唔可以慳嘅（⚠️ ⛔ 未拍板，⛔ 我未寫）

- **HTML 一定要 network-first**（有網就攞新嗰份，冇網先出 cache）——
  ⭐ 咁樣「拍舊 code」就不可能發生
- **帶 hash 嘅 asset 先至可以 cache-first**（佢哋改咗名就係新檔，⛔ 撞唔到）
- **一定要有一個「攞到新版」嘅出路**（`skipWaiting` ＋ 提示）
- ⭐ **Build ID 要變成驗收嘅一部分**：部署完喺真機對一次 SHA，
  ⛔ 對唔上就當 SW 有事，⛔ 唔准當「Cloudflare 慢」

---

## 七、幾條路同代價（⛔ 我一條都冇揀）

| | 做乜 | 代價 |
| --- | --- | --- |
| **甲** | ⛔ 乜都唔做 | ⚠️ **上線清單第 1 條過唔到**，而第 1 條係「三樣冇咗就唔准上線」嗰三樣之一 |
| **乙** | 只加 `_headers` 令 `index.html` 畀 cache（⛔ 唔寫 SW） | ⛔⛔ **見下面「（乙）真正嘅代價」—— 佢⛔ 唔係「細一啲嘅丙」** |
| **丙** | 寫一個最細嘅 SW（HTML network-first ＋ asset cache-first） | ⭐ **唯一一個設計上嘅保證**。⚠️ 代價：多咗一層要維護嘅嘢，而且**寫錯就係 Jason 驚嗰樣** |

### ⛔⛔ （乙）真正嘅代價 —— ⭐ 呢段⛔ 唔准略過

要離線開得到，（乙）就要俾 `index.html` 一個 `max-age=N`。
⚠️⚠️ **而喺嗰 N 秒之內，部機⛔ 一定係派舊 code。**

⭐⭐ **即係（乙）正正攞 Jason 最驚嗰樣去換** ——
佢原話：「一個寫得差嘅 SW 會**永遠拍舊版 code 出來**，比冇更差。」
**（乙）⛔ 唔係避開咗嗰個交易，佢就係嗰個交易**，只不過由「永遠」縮成「N 秒」。

⇒ ⭐ **（丙）HTML network-first ⛔ 冇呢個交易**：有網一定攞新嗰份，冇網先出 cache。
**「永遠拍舊 code」喺設計上就不可能發生** —— ⛔ 唔係靠小心。

⛔ **我⛔ 唔會替你揀。**
⭐ 但有一樣係唔理揀邊條都成立嘅：**第 1 條而家嗰個「⛔ 未驗」要改成講明
「卡喺『再開』呢一步」** —— ⛔ 唔可以繼續當佢係一個「未做嘅測試」，
⚠️ 佢係一個**已知有可能過唔到**嘅測試。
