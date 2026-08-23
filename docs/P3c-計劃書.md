# P3c 計劃書 —— 每個工序一格，一格多張

**狀態：等 Jason 批。⛔ 未批之前一行 code 都唔會寫，一句 SQL 都唔會跑。**
出稿日期：2026-08-23（九條決定點答齊之後重寫）

---

## 結論

**一棵樹每個揀咗嘅工序出一格，每格任影幾多張；號碼由 DB 派，永遠連續冇窿；
改名一律 PATCH，唔重抄。**

---

## ⛔ 先收回一個錯咗嘅成本假設

**上一版計劃書寫住「改名 → Drive 重抄 → 舊名孤兒檔」。⛔ 錯。**

**tree app 係認 `drive_file_id` 改名，一次 PATCH，唔係刪咗再抄。**
**quote app 一樣有 `drive_file_id`。**

**所以凡涉及改名嘅選項，成本係一次 PATCH ——
⛔ 冇重抄、冇多用 Drive 額度、冇孤兒檔。**

**呢個改變咗 D2 / D4 / D9 嘅成本判斷**，而 Jason 就係喺呢個真成本之下揀嘅。

出處：`jason223hk-ctrl/tree-app-v7`（`feature/slice2`）
`docs/SPEC-2026-08-07-改類別重新排號同步改名.md`、`src/domain/photo.ts:23-25`、
`supabase/2026-07-29-phase7-number-reuse.sql:144`。

---

## 九條決定（Jason 已拍板，⛔ 唔准改）

| | 決定 | 出處 |
| --- | --- | --- |
| **D1** | **乙** —— 由 DB 派號 | tree app `allocate_photo_number` |
| **D2** | **乙** —— 全壓縮遞補，號碼永遠連續冇窿 | SPEC §1.3「✅ 2026-08-07 Jason 已拍板 — Q1」 |
| **D3** | **甲** —— 冇上限 | Jason 2026-08-23 直接拍板 |
| **D4** | **丙** —— 取消工序，啲相變返全景相，檔名跟住改 | tree app 冇「有相但冇類別」呢個狀態 |
| **D5** | **甲** —— 兩格各自數 | SPEC §1.1「編號係每（樹 × 類別）自己數」 |
| **D6** | **丙** —— `Other-1`、`Other-2` | Jason 2026-08-23 直接拍板 |
| **D7** | **甲** —— 全部格喺改樹嗰版 | — |
| **D8** | **甲** —— 唔出格 | SPEC §2.1（tree app 對「移除樹」封住入口） |
| **D9** | **乙** —— 畀改，相跟住過去，檔名一齊改；**改過去嗰邊排最後，唔插隊** | SPEC §1.4 |

**D8 文案（照抄，⛔ 唔准改字）：**

> 請先選擇一項修剪細項，然後拍攝工序相片。

**D4 / D9 三條配套（tree app 原有）：**

1. **原子**（SPEC §1.5 / Q4）：**要嘛全部改到，要嘛全部唔改**，⛔ 唔准有半截狀態
2. **樹級鎖**（Q9）：第二個人收到**「其他同事正在整理呢棵樹，請稍後」**
3. **事前確認**（Q10）：畫面顯示**「呢個動作會改動 N 個檔名」**，撳確認先做

**兩處 docs／口頭唔一致，Jason 確認照 docs**：
「移除」自己一個位、同「修剪」同級；「其他」係彈打字欄入 `mitigation_other`，
⛔ **唔係自己改工序名**。

---

# 🚨 開頭就要講：呢個範圍會郁到六個模組

**我自己嗰條停止條件係「改到超過三個核心模組就停返出嚟講」。**
**我而家未寫 code 就已經數到六個，所以先講。**

| # | 模組 | 做咩 |
| --- | --- | --- |
| 1 | `src/lib/photos.ts` | 派號 RPC、按工序攞相、改名／重編 |
| 2 | `src/lib/photoUpload.ts` | `seq` 由寫死 `1` 改成問 DB 攞 |
| 3 | `src/components/PhotoSlot.tsx` | 由「淨係全景」變成「收一個工序參數」 |
| 4 | `src/components/TreeFormPage.tsx` | 按揀咗嘅工序render 多格 |
| 5 | `worker/src/worker.mjs` | 新增改名（PATCH Drive `name`） |
| 6 | **新** `src/lib/photoSlots.ts` | 純邏輯：邊幾格、重編計劃、`Other-N` |

## ⛔ 所以我建議拆兩步（等 Jason 揀）

**P3c-1「一格多張」** —— 模組 1、2、3、4、6（**冇 Worker**）
- **只加相，唔改名、唔刪、唔重編**
- 即係 D1、D3、D5、D6、D7、D8
- **⛔ 唔掂 Drive 上面任何已存在嘅檔**

**P3c-2「重編同改名」** —— 模組 1、5、6（**冇畫面大改**）
- D2、D4、D9 ＋ 三條配套（原子、樹級鎖、事前確認）
- **呢一步先至會 PATCH Drive**

**點解建議拆**：**P3c-2 係唯一會郁到已經上咗 Drive 嘅檔嗰步。**
P3c-1 出事最多係「影唔到新相」；**P3c-2 出事係「已經好咗嘅相被改壞」。**
兩者風險唔同級，撈埋一齊出事就分唔清係邊件。

⛔ **拆定唔拆係 Jason 決定。下面照一次過寫齊。**

---

# 開發方法十項

## 1. 現況

- P3a／P3a.1／P3b **全部寫完、真機驗過，⛔ 喺 branch 未 merge**
- `seq` **寫死 `1`**（`photoUpload.ts:128`），`PhotoSlot` 完全冇掂 `seq`
- **一格多張而家行唔到**：第二張砌出同一個檔名，被 I7 撞名保護擋住
- `quote_photos` 已經有 `mitigation`、`seq`、`drive_file_id` 三個欄，**唔使加欄**

## 2. 問題分類

**Feature Mode，高風險。**
掂到 **schema（新 function）、外部服務（Drive 改名）、同一棵樹嘅並發**。

## 3. 證據信心

- **已證實**：`seq` 寫死 `1`（引過原文）；`quote_photos` 欄位齊
- **已證實**：`safeFilename` **唔擋中文**（所以 D6 丙嘅 `Other-N` 係純英文，安全）
- **已證實（tree app 原文）**：allocate 有一個**已知而且有界**嘅 race ——
  「先 allocate、後 insert」之間兩部機可能攞到同一個 `k`；
  tree app 靠 **worker 嘅檔名碰撞守衛**兜底，**大聲、睇得見、可重試**
- **未知**：阿耀同聰實際會唔會喺同一棵樹同時影

## 4. 範圍

### 做

**一棵樹每個揀咗嘅工序出一格；每格任影幾多張；`seq` 由 DB 派；
`NN = 2 × seq − 1`；刪相之後壓縮遞補；取消工序／改工序相跟住走，檔名 PATCH。**

### ⛔ 唔做

畫線標記（P3d）、揀相頁（P4.5）、PDF（P5）、對數 cron、轉工程（P6）。

## 5. D1 SQL —— 最終版（⛔ Jason 親手跑，四段順住嚟）

### ✅ 第 0 段跑咗，實測結果（2026-08-23）

**0a —— `quote_photos` 三條 policy 嘅逐字原文：**

| policy | cmd | `qual` | `with_check` |
| --- | --- | --- | --- |
| `quote_photos_insert` | INSERT | NULL | `can_edit_quote_record(record_id) AND (created_by is auth.uid())` |
| `quote_photos_select` | SELECT | **`true`** | NULL |
| `quote_photos_update` | UPDATE | `can_edit_quote_record(record_id)` | `can_edit_quote_record(record_id)` |

⭐ **`SELECT` 個 `qual` 真係 `true`** —— 即係「數唔到人哋嗰行」嗰個死循環
**喺實況上唔會發生**。

**0b —— 撞號檢查：零行**（`Success. No rows returned`）。
⛔ **即係 unique index 建得成。**

### `security definer` 照用（Jason 2026-08-23 定）

**唔係因為賭** —— 係因為 **tree app 同一支 function 就係咁寫**
（`supabase/allocate-photo-number.sql`：`SECURITY DEFINER` ＋ `set search_path`
＋ `grant execute` 俾 `authenticated`），而 **Jason 定咗規矩：同類問題照跟 tree app**。

⭐ **我多咗嗰句 `revoke all … from public` 保留** ——
tree app 冇，**我哋比佢嚴，方向啱**。

### 舊嗰段記錄（我當時證明唔到，留低）

**⛔ 我跑唔到 SQL**（呢個容器連唔到 Supabase），所以**我唔會扮貼一個結果出嚟**。

**手上有幾多證據，講實：**

- **有**：2026-08-22 開表嗰張 SQL 入面寫住
  `create policy quote_photos_select … for select using (true);`
  （`docs/P3a-計劃書.md:265`）
- **有**：Jason 跑完之後驗返 **「policy = 3 條（select / insert / update）」**
- ⛔ **冇**：`quote_photos_select` 嘅**逐字原文**冇 dump 返出嚟過
  （四張舊表就有逐字原文，呢張淨係有數量）

**即係「應該係 `using (true)`」有好強嘅證據，但唔係實測原文。**

**你叫嗰句唯讀檢查照放咗喺下面第 0 段 —— 而家已經跑咗，結果喺上面。**

### ⛔ 所以我改咗做 `security definer`，唔靠 policy 猜

**理由**：`security invoker` 嘅失效模式**正正就係你指出嗰個** ——
SELECT 一收窄，阿耀數唔到聰嗰行 → **永遠算返同一個號 → 撞 `23505` → 重試 →
又係同一個號**。**呢個唔係報錯，係死循環。**

**`security definer` 之下**：個 function **一定數到成格所有 live 行**，
所以**永遠派得出一個未用過嘅號**，⛔ **死循環喺根源度冇咗**。

**代價**：佢繞過 RLS。**但佢淨係回一個 `int`** ——
唔會 select 任何一行內容出嚟，**漏唔到相片資料**。
**而且 `search_path` 鎖死**（`set search_path = public, pg_temp`），
唔會被人用一張同名嘅表騙走。

⚠️ **如果第 0 段跑返出嚟真係 `using (true)`，`security invoker` 一樣安全** ——
**要唔要改返 invoker，Jason 決定。⛔ 我唔會自己揀，但我唔建議賭。**

---

### 第 0 段：⛔ 唯讀檢查，兩句都要係零行／確認咗先好行落去

```sql
-- 0a. 睇實 quote_photos 三條 policy 嘅逐字原文（尤其 SELECT 係咪 using (true)）
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'quote_photos'
 order by policyname;

-- 0b. ⛔ 建 unique index 之前一定要跑：同一格有冇兩行同號？
--     有嘅話下面 create unique index 會直接失敗。
--     ✅ 2026-08-23 跑咗：零行。
select record_id,
       tree_id,
       mitigation,
       seq,
       count(*) as 幾多行
  from public.quote_photos
 where deleted_at is null
 group by record_id, tree_id, mitigation, seq
having count(*) > 1
 order by 幾多行 desc;
```

### 第 1 段：派號 function

```sql
-- ⛔ 未跑。由 Jason 本人喺 Supabase SQL editor 貼同跑。
--
-- 派一個 seq 俾（單、樹、工序）呢一格。
--   * 攞行鎖 → 兩部電話同時影唔會攞到同一個號
--   * 數 live 行（deleted_at is null）→ D2 壓縮之後永遠連續，所以 max+1 就啱
--   * 工程相 tree_id 係 null、全景相 mitigation 係 null，所以用 is not distinct from
--   * security definer：唔靠呼叫者睇唔睇到人哋嗰行 —— 睇唔到就會派返同一個號，死循環
--   * search_path 鎖死：唔會被同名嘅表騙走
create or replace function public.allocate_quote_photo_seq(
  p_record_id  uuid,
  p_tree_id    uuid,
  p_mitigation text
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next int;
begin
  perform 1
    from public.quote_photos
   where record_id = p_record_id
     and tree_id is not distinct from p_tree_id
     and mitigation is not distinct from p_mitigation
     and deleted_at is null
   for update;

  select coalesce(max(seq), 0) + 1
    into v_next
    from public.quote_photos
   where record_id = p_record_id
     and tree_id is not distinct from p_tree_id
     and mitigation is not distinct from p_mitigation
     and deleted_at is null;

  return v_next;
end;
$$;

revoke all on function public.allocate_quote_photo_seq(uuid, uuid, text) from public;
grant execute on function public.allocate_quote_photo_seq(uuid, uuid, text) to authenticated;
```

⚠️ **`revoke … from public` 唔可以漏** ——
`security definer` 嘅 function 預設 `public` 執行得，
即係**未登入都叫得**（`docs/開發紀錄.md` §十二 第 11 項就係呢一類 warning）。

### 第 2 段：最後一道閘

```sql
-- ✅ 第 0b 段 2026-08-23 跑咗，零行，所以呢句建得成。
create unique index quote_photos_slot_seq_uidx
  on public.quote_photos (
    record_id,
    coalesce(tree_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(mitigation, ''),
    seq
  )
  where deleted_at is null;
```

### 第 3 段：Rollback

```sql
drop index if exists public.quote_photos_slot_seq_uidx;
drop function if exists public.allocate_quote_photo_seq(uuid, uuid, text);
```

⛔ **三句都唔會郁任何一行資料**，rollback 之後啲相原封不動。

## 5.5 ⛔ 重試要有上限同終點（第一件）

**上一版寫「撞 `23505` 就重試攞下一個號」，冇上限、冇終點 —— ⛔ 錯。**
Jason 工作指引第三節第三點：**唔准無限重試，要有上限，到頂要落入一個
明確終點狀態，而且嗰個狀態要有地方睇得到。**

| | |
| --- | --- |
| **上限** | **同一張相最多試 3 次派號** |
| **每次之間** | 短暫等一等（0.2s / 0.4s），⛔ 唔係連環撞 |
| **到頂之後** | 狀態變 **「有事要人睇」** |
| **睇得到嘅地方** | ①張相自己個狀態行 ②**車上補嘢清單**（佢係真失敗，唔係過渡） |
| **⛔ 唔會發生嘅事** | 相**唔會冇咗** —— 佢已經喺部機同 R2，淨係未排到號 |

**文案（一個具體動作 ＋ 一個具體對象）：**

> 呢張相排唔到號，可能有人同時影緊同一格。請撳「再試一次」，或者截圖搵 Jason。

⚠️ **3 次係按「同一格同時有兩部機」呢個情境計** ——
兩部機互相讓一次就夠。**如果真機見到三次都唔夠，返嚟講，⛔ 唔好自己加大個數。**

## 6. Source of truth

- **`quote_photos` 一行** = 呢張相係邊格第幾張。⛔ UI 唔准自己另外記
- **Drive 檔名** = 由 DB 砌出嚟嘅結果，⛔ **唔係身分**（I7）
- **身分永遠係 `appProperties.quotePhotoId`**

## 7. 狀態同失敗

- **派號攞唔到**（冇網）→ 出中文，⛔ 唔准自己填一個號
- **`23505` 撞號** → **重試攞下一個號**（同 P3a 個 23505 一樣，唔當出錯）
- **改名改到一半死咗** → ⛔ **原子**：要嘛全部改到要嘛全部唔改
- **另一部機鎖住咗** → 「其他同事正在整理呢棵樹，請稍後」
- **legacy `pruning`** → 唔出格 + D8 文案

## 8. ⛔ Regression contract（跌任何一項都唔准出街）

1. ⛔ **現有三張相嘅 `seq` 1/2/3 同佢哋喺 Drive 嘅檔一個字都唔准郁**
2. ⛔ **撞名保護（I7）唔准拆走** —— `findNameClash` 要照喺
3. ⛔ **`quotePhotoId` 身分制唔准退回「檔名當身分」**
4. **P3a／P3a.1／P3b 成條路一步都唔准跌**，196 個測試一個都唔可以少
5. **tree app 嘅表、bucket、Worker、Drive 資料夾一個 byte 都唔准掂**
6. **`quote_records` / `quote_trees` / `quote_site_form` / `quote_photos`
   現有欄位一個都唔准改**（今次只加 function 同 index）
7. **GPS、十八區、篩選、封存、登出照行**

## 9. 測試

**我自己跑**：`npm run gate` 全綠；新純函數測試（重編計劃、`Other-N`、
邊幾格、`NN` 由 `seq` 計）；harness 用假 API 行一格三張、刪中間一張、改工序。

**要 Jason 真機做（三個動作）**：

1. **同一格連續影三張** → `NN` 應該係 **01 / 03 / 05**，Drive 三個檔
2. **刪中間嗰張** → 剩返兩張應該變 **01 / 03**，**Drive 兩個檔都改咗名**
3. **取消嗰個工序** → 啲相變返全景相，**檔名變 `Whole View`**，
   而且**做之前有「會改動 N 個檔名」嘅確認**

## 10. 停止條件

- ⛔ **已經講咗會郁六個模組** —— **如果超出上面張表，即刻停**
- 同一個問題連續兩版未解決 → 停
- 10 分鐘揾唔到根因 → 只加最窄嘅只讀診斷

## 11. Rollback

- **Code**：唔 merge／revert。`main` 由頭到尾冇動過
- **DB**：兩句 `drop`（上面），⛔ **唔郁任何一行資料**
- **Drive**：⚠️ **P3c-2 改咗嘅檔名唔會自己變返**。
  ⛔ **要復原就要再 PATCH 一次返舊名，唔准刪。**
  （呢個就係我建議拆兩步嘅原因。）

---

## 批准欄

- [ ] Jason 睇完，批准開工
- [x] 拆兩步 —— **2026-08-23 批咗**（P3c-1 一格多張／P3c-2 重編同改名）
- [x] `pair_counters` 唔開 —— **2026-08-23 批咗**（tree app SPEC §10.2 自己都要收窄佢）
- [x] 第 0 段兩句唯讀檢查 —— **2026-08-23 跑咗：SELECT `qual` = `true`；撞號零行**
- [x] `security definer` —— **2026-08-23 定咗照用**（tree app 同一支 function 就係咁寫）
- [ ] Jason 本人跑咗第 1、2 段
- [x] `can_edit_quote_record()` 個內容 —— **2026-08-23 攞到逐字原文**
- [ ] `locked` 同鏡像／重編號嘅衝突點處理（P3c-2 先需要）
- [ ] Jason 本人跑咗第五節張 SQL

---

# ⚠️ 0a 帶出嚟兩件事，P3c-2 之前要處理

## 一、全壓縮遞補會 UPDATE 到同事嗰行

**`quote_photos_update` 個 `qual` 係 `can_edit_quote_record(record_id)`** ——
**注意佢係睇「邊一單」，唔係睇「邊個影嗰張相」。**

**所以 D2 壓縮遞補（改人哋嗰行嘅 `seq`）過唔過到，
完全取決於 `can_edit_quote_record()` 入面寫咗咩。** ⛔ **我未見過佢個內容。**

## ⚠️ 二、同一個問題其實更大：兩個人可能根本唔可以影同一單

**`quote_photos_insert` 都係要 `can_edit_quote_record(record_id)`。**

**如果 `can_edit_quote_record()` 係「淨係開單嗰個（或者 admin）先改得」**，
咁**聰根本 insert 唔到相入阿耀開嗰單** —— ⛔ **連 P3a 都行唔到，唔止 P3c。**

**而如果係咁**，D1 嗰個「兩部電話同時影同一格」嘅前提就唔成立，
**P3c-2 嗰個「樹級鎖」亦都冇嘢好鎖。**

⚠️ **兩個方向都有可能，我唔會估。**

## ✅ 2026-08-23 攞到咗，逐字原文

```sql
-- can_edit_quote_record(rid uuid)
-- LANGUAGE sql, STABLE SECURITY DEFINER
select exists (
  select 1
    from public.quote_records r
   where r.id = rid
     and r.deleted_at is null
     and (
       (r.created_by = auth.uid() and r.locked = false)
       or public.is_quote_admin()
     )
);
```

**即係：淨係開單嗰個人（而且張單未鎖）或者 quote admin 先改得。**

### 一、P3c-2 唔係 blocker

**一張單入面所有相都係同一個人開嗰張單先入到** ——
⛔ **根本冇「同事嗰行」呢回事。**
**全壓縮遞補 UPDATE 得到自己嗰啲行。**

### 二、D1 個 race 收窄咗，但⛔ 唔取消

**兩個唔同同事唔可能同時影同一單**（第二個 `insert` 根本過唔到 `with_check`）。

**剩返真嘅情況得兩個**：**同一個帳號兩部機**、或者**兩個 admin**。

⛔ **決定唔變：D1 乙照做，unique index 照落。**
**保險係平嘅**，而且 0b 已經證咗建得成。

⚠️ **但樹級鎖嗰句文案要改** ——
實際觸發機會比之前估嘅**低好多**，
⛔ **唔好令人以為成日有人搶**：

| | |
| --- | --- |
| ⛔ 舊 | 「其他同事正在整理呢棵樹，請稍後」 |
| ✅ 新 | **「呢棵樹而家有另一部機喺度改緊，請等一等再試。」** |

**⛔ 個鎖唔准拆走**，淨係改個講法。

### 三、⚠️ 新嘢：`locked` 會令重編號靜靜雞失敗

**`quote_records` 有個 `locked` 欄，`locked = true` 之後非 admin 就改唔到。**

**而 `quote_photos_update` 個 `qual` 就係 `can_edit_quote_record(record_id)`** ——
**張單一鎖，非 admin 連改一行相片紀錄都改唔到。**

⛔ **呢個正正就係「靜靜雞失敗」嗰種**：
**RLS 唔會 throw，佢只係令 0 行受影響。**

**要入 P3c-2 失敗矩陣嘅三個情況：**

| 情況 | 後果 | ⛔ 要點做 |
| --- | --- | --- |
| 鎖咗之後改工序／刪相 → 重編號 | **UPDATE 0 行** | **⛔ 唔准當做咗** —— 要出中文，講明張單鎖咗 |
| 重編號改到一半先撞 `locked` | **半截狀態** | ⛔ **違反原子規矩** —— 要**一開始就檢查**，唔係做到一半先發現 |
| Drive 改名成功但 DB 改唔到 | **檔名同 DB 對唔上** | ⛔ **所以一定要先確認改得到 DB，先至 PATCH Drive** |

**⛔ 次序寫死**：**先驗 `can_edit_quote_record`（試一次 `update … returning`）→
確認改得到 → 先至郁 Drive。**

### ⚠️ 順帶：`locked` 唔止影響 P3c-2，佢而家已經影響緊 P3b

**P3b 個鏡像寫返 `drive_file_id` / `drive_synced_at` 都係行同一條 update policy。**

**即係話：張單一旦 `locked = true`，未鏡像嘅相就永遠鏡像唔到**
（非 admin）—— 每次補做都係 0 行。

⭐ **好消息：唔會靜靜死。** `patchPhoto()` 已經用
`return=representation` readback，0 行就 throw，
出「資料庫唔俾改呢張相嘅紀錄。可能母單已經鎖定，或者唔係你開嗰單。」

⚠️ **但佢會撞正第六章嗰條規矩**：**未上齊之前唔准出 PDF**。
**鎖咗 → 上唔齊 → 出唔到 PDF → 要解鎖先得。**

⛔ **呢個唔喺 P3c 範圍，但要記低**，唔好等到 Anna 鎖咗單先發現。

## （已答，留返做紀錄）要跑嘅唯讀查詢

```sql
select pg_get_functiondef(oid)
  from pg_proc
 where proname = 'can_edit_quote_record'
   and pronamespace = 'public'::regnamespace;
```

**攞到之後兩件事即刻答得到：**

1. **壓縮遞補改唔改得到同事嗰行**（P3c-2 blocker）
2. **兩個人到底可唔可以影同一單**（決定 D1 個 race 同樹級鎖係咪真嘅需要）

⛔ **未見到之前，P3c-2 唔好開工。**
⚠️ **但 P3c-1 唔受影響** —— 佢淨係 insert 自己影嘅相，
`with_check` 有 `created_by is auth.uid()`，本來就係自己嗰行。
