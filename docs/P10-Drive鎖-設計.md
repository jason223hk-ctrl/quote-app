# P10：抄 Drive 前喺資料庫「攞租約」—— 擋住同一張相上兩份

> 狀態：**草稿，未跑 SQL、未 deploy。** SQL：`docs/P10-mirror-claim-草稿.sql`（Jason 親手跑）。
> 疊喺 PR #78（上完之後收斂）上面。凡係標「AI 代揀，待 Jason 確認」嘅都未拍板。

## 1. 問題

兩部機／兩個 tab **同時**叫 `/mirror` 抄同一張相：每個都先問 Drive「有冇呢張相」，大家都答「冇」，然後每個都上一份。
2026-10-03 Jason 真機見到同一張相有 4 份。

- 前端 single-flight（PR #77 `8a26ce4`）：只擋到**同一個 tab**。
- PR #78：上完之後再睇一次，多過一份就揀最早嗰份、收返自己多上嗰份。⇒ 會**收拾**，但**擋唔到**「上兩份」；而且 Drive 清單慢幾秒嗰陣，有機會留低一份。

⇒ 要一個**真鎖**：喺掂 Drive 之前，**只准一個人攞到「我嚟抄」**。Drive 冇呢種嘢，Worker 亦冇（每個 request 各自一部機），唯一共用嘅地方係**資料庫**。

## 2. 考慮過嘅做法

| 做法 | 點做 | 點解要／唔要 |
|---|---|---|
| **A. 張相上面加「租約」兩個欄 ＋ 一句有條件嘅 `update`**（揀咗） | `mirror_claim_id`（今次邊個攞住）、`mirror_claim_until`（幾時到期）。`update … where 未抄 and (冇人攞 or 過咗期)`，改到 1 行 ＝ 攞到 | ✅ Postgres 本身保證兩個同時嚟只有一個改到（第二個會等第一個寫完，再用新資料重新睇條件）。✅ 死咗嘅 Worker 過期就自動放。✅ 用返用家自己嘅權限（RLS 照攔）。 |
| A 嘅細節：用 function 定直接 `PATCH` | 直接 PATCH 要用 Worker 個鐘做「而家」；function 用 DB 個 `now()`，又一次過答埋「點解攞唔到」 | 揀 **function**，但係 **`security invoker`**（⛔ 唔係 `security definer`）——冇開任何後門，⛔ 冇攞 P8 個 `quote_purge_stamp` 做先例。 |
| B. Advisory lock（`pg_advisory_lock`） | DB 內存鎖 | ⛔ PostgREST 每個 request 一個 transaction，鎖唔過「上 Drive 嗰十幾秒」；session 鎖又會跟住連線池飄走。用唔到。 |
| C. 另開一張 `quote_mirror_claims` 表 | 一行一個租約 | 要新表、新 RLS、新 grant；同 A 效果一樣但多嘢要守。⛔ 唔要。 |
| D. 淨係靠 #78 收斂 | 唔加鎖 | 擋唔到上兩份，只係事後執；Drive 清單慢嗰陣仲會漏。 |

## 3. 揀咗嘅設計

### 3.1 資料庫（`docs/P10-mirror-claim-草稿.sql`）

- `quote_photos` 加兩個欄：`mirror_claim_id uuid`、`mirror_claim_until timestamptz`（冇 default、冇 not null、冇 index）。
- `quote_claim_mirror(p_photo_id, p_claim_id, p_lease_seconds)` → 回一個字：
  - `claimed`：攞到（或者自己續租）
  - `busy`：另一次 `/mirror` 攞住緊，未過期
  - `done`：已經抄咗（`drive_synced_at` 有值**而且** `drive_file_id` 唔係空）
  - `denied`：睇到張相但改唔到（RLS：工程鎖咗、刪咗、唔係你嘅）
  - `missing`：睇唔到張相
- 交還租約唔使 function：Worker 用普通 `PATCH …&mirror_claim_id=eq.<自己個 uuid>`，**淨係交得返自己嗰個**。

### 3.2 `drive_file_id = ''` 點睇

`drive_file_id` 係 `text not null default ''`，即係 **`''` 就係「未抄」嘅正常值**（唔會有 null）。前端、Worker 判斷「抄咗未」一直都係睇 `drive_synced_at`。
2026-10-03 見到工程「彩」（2026-08-22）有一行 `drive_file_id = ''`，**未知佢 `drive_synced_at` 有冇值**（我讀唔到 production）。

- 如果 `drive_synced_at` 冇值：完全正常，即係未抄。
- 如果 `drive_synced_at` **有值**：唔正常（話抄咗但冇 id）。
  - **舊 Worker**：當佢抄咗，即刻回 `alreadyDone`，永遠唔會補。
  - **新 Worker（呢個 PR）＋ SQL**：`''`／淨係空格**一律當未抄**。`/mirror` 會行落去，`listMirroredCopies` 用 `quotePhotoId` 揾返嗰份 Drive 檔，補返個 id；揾唔到就重新上。
  - ⚠️ 但**前端**都係睇 `drive_synced_at`：佢有值，前端就當抄咗，唔會自動叫 `/mirror`。⇒ 要補嗰行，要等 Jason 決定（見 §9）。⛔ 呢個 PR 冇改任何 production 資料。
- SQL 第 0 段 ③ 有一句**只讀**嘅數，數埋呢兩種各有幾多行。

### 3.3 Worker `/mirror` 次序

1. 讀張相。`drive_synced_at` 有值**而且**有 id ⇒ 即刻 `alreadyDone`（連租約都唔使攞）。
2. 砌檔名（砌唔到就報錯，⛔ 未攞租約）。
3. **攞租約**（掂 Drive 之前）：
   - `claimed` ⇒ 行落去。
   - `busy` ⇒ 回 **409 ＋ `busy: true`**，⛔ 唔寫 `drive_error`（唔係錯）。
   - `done` ⇒ 回 `alreadyDone`，id 由 DB 讀返。
   - `denied` ⇒ 403，話用家聽要搵 Jason。`missing` ⇒ 404。
   - **404（function 未裝）⇒ 照舊冇鎖咁行**，靠 #78 收斂。
   - 其他錯（500 等）⇒ 當資料庫失敗，⛔ 唔准當「未裝」（CLAUDE.md：404 未裝 ≠ RLS 拒絕 ≠ 唔知）。
4. 照 #78 抄、收斂。
5. 寫「抄咗」嗰下**一齊清租約**（同一個 PATCH，冇多外呼）。
6. 中途失敗／返回 ⇒ `finally` 交還自己個租約（多一個外呼；交唔到都冇所謂，2 分鐘後自己過期）。

外呼：多 1 個（攞租約），失敗再多 1 個（交還）。最差情況測過 ≤ 50（Cloudflare 上限）。

### 3.4 前端

`mirrorPhoto()` 認得 409 ＋ `busy: true` ⇒ 回 `{ ok: false, busy: true }`。`PhotoSlot` 同背景 `mirrorOnce()` 見到 `busy` ⇒ **⛔ 唔數多一次、⛔ 唔記錯誤**。另一部裝置抄完，下次 reload 就見到「已抄」。冇改任何畫面。

## 4. 租約幾長

**2 分鐘。** AI 代揀，待 Jason 確認。
- 一張相（2–3 MB）由 R2 抄去 Drive 正常十幾秒。
- Worker 死咗（手機熄咗、斷線）⇒ 最多鎖住張相 2 分鐘，之後第二個人攞得返。
- SQL 限死 10–900 秒，防止有人傳個離譜數入嚟。

## 5. 死機／失敗點樣恢復

| 情況 | 結果 |
|---|---|
| 抄到一半 Worker 死咗 | 租約 2 分鐘後過期，下一個 `/mirror` 攞得返，照 #78 揾返已經上咗嗰份（`quotePhotoId`），唔會再上多一份 |
| 抄完、寫 DB 之前死咗 | 同上：Drive 有檔、DB 未寫 ⇒ 下一次揾返嗰份、補寫 |
| 抄超過 2 分鐘（網好慢） | 第二個人可能攞到、再上一份 ⇒ **#78 收斂兜底**（揀最早、收返自己多上嗰份） |
| 交還租約失敗 | 2 分鐘後自己過期 |
| 攞到租約、用家冇權寫（理論上唔會：攞得到就代表 RLS 俾改） | `patchPhoto` 照舊報錯 |

## 6. 同 #78 點夾

**#78 嘅收斂照留，做安全網。** 租約擋住絕大部分撞車；以下情況仍然靠 #78：
- SQL 未跑（function 404）。
- 抄超過租約時間。
- 呢個 PR 之前已經留低嘅重複檔（`listMirroredCopies` 見到多過一份就揀最早、收拾舊份）。

## 7. 權限（RLS／grant）

- 淨係掂 `quote_photos` 同 `quote_claim_mirror`（`quote_` 開頭；個 Supabase project 同 tree app 共用，⛔ 唔掂其他嘢）。
- Function 係 **`security invoker`**：佢入面個 `update` 受 `quote_photos` 現有 update policy（`can_edit_quote_record`）管 ⇒ 做唔到用家本身做唔到嘅嘢。
- `revoke … from public, anon`，`grant execute … to authenticated`。
- 新欄唔使另外 grant（`authenticated` 有成張表嘅 update）。SQL 第 0 段 ② 會驗有冇人收窄過 column grant。

## 8. 本機實測（⛔ 冇掂 Supabase）

`sudo -u postgres bash tools/sql-test/P10-mirror-claim.sh`：開一個 `/tmp` 入面、用完即剷嘅 PostgreSQL 17，用 stub 頂替 `auth.uid()`、`can_edit_quote_record()`、兩張表同 RLS，再**由草稿原檔**跑（跑兩次驗 idempotent）。驗咗：攞到／busy／續租／過期再攞／denied／missing／done／`''` 當未抄／淨係空格當未抄／租約太短報錯／anon 行唔到／只交得返自己個租約／**兩條連線真同時攞（第二條等第一條 commit 之後見到 busy）**／rollback 之後再跑返。

⚠️ 量到嘅係「Postgres 點運作」，⛔ 唔係「Jason 個 DB 而家係點」——真 policy、grant 要靠 SQL 第 0 段同第 3 段喺 production 讀返。

## 9. 上線次序

1. Merge #77 → #78 → 呢個 PR（呢個 PR 疊喺 #78 上面）。
2. **Deploy Worker**（要一棵有齊 #77、#78、呢個 PR 嘅 tree；`ALLOWED_ORIGIN` 保留 preview origin 如果仲要用）。冇 SQL 都行得（404 ⇒ 照舊冇鎖）。
3. **Jason 逐段跑** `docs/P10-mirror-claim-草稿.sql`（第 0 段只讀 → 第 1 段 → 第 2 段 → 第 3 段驗返 ＋ `notify pgrst`）。
4. 前端（Pages）隨 merge 自動上；佢認得 `busy`。⚠️ 如果 Worker 比前端早上，舊前端見到 `busy` 會當普通失敗（數多一次、顯示嗰句「另一部裝置正在…」），唔會壞嘢。

⭐ 2 同 3 先後都得：SQL 先跑，舊 Worker 唔會叫條 function，兩個新欄冇人用；Worker 先上，見唔到 function 就照舊行。

## 10. 退回

- 退 Worker：deploy 返之前個版本，兩個欄同 function 留喺度冇人用，冇害。
- 退 SQL：草稿檔尾「退回」段 —— **先剷 function（`notify pgrst`），等 2 分鐘，再剷兩個欄。** 次序唔可以調轉：新 Worker 攞到租約之後會寫 `mirror_claim_*`，欄冇咗會報錯。

## 11. AI 代揀，待 Jason 確認

1. 用「租約欄 ＋ `security invoker` function」，唔用 advisory lock、唔另開表。
2. 租約 2 分鐘（SQL 限 10–900 秒）。
3. `busy` 回 409 ＋ `busy: true`，前端唔當失敗、唔數次數、唔顯示錯誤。
4. function 404 ⇒ 照舊冇鎖咁行（fail-open）；其他錯 ⇒ 當失敗。
5. `drive_file_id` 係 `''`／淨係空格 ⇒ 一律當未抄（Worker 同 SQL 一致）。
6. `denied` ⇒ 未掂 Drive 就停（以前係上完先喺寫 DB 嗰步失敗）。
