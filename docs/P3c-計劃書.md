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

## 5. D1 要跑嘅 SQL（⛔ Jason 親手跑）

⚠️ **我建議唔跟 tree app 開 `pair_counters` 表，理由喺下面。**
**如果 Jason 要照跟 tree app 開表，話我知，我改返。**

```sql
-- ⛔ 未跑。由 Jason 本人喺 Supabase SQL editor 貼同跑。
--
-- 派一個 seq 俾（樹、工序）呢一格。
--   * 攞行鎖 → 兩部電話同時影唔會攞到同一個號
--   * 數 live 行（deleted_at is null）→ D2 壓縮之後永遠連續，所以 max+1 就啱
--   * 工程相（tree_id 係 null）用 record_id 分組
create or replace function public.allocate_quote_photo_seq(
  p_record_id uuid,
  p_tree_id   uuid,
  p_mitigation text
) returns int
language plpgsql
security invoker
as $$
declare
  v_next int;
begin
  -- 鎖住呢一格現有嘅行；冇行就鎖唔到嘢，靠 unique index 兜底（見下面）
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

grant execute on function public.allocate_quote_photo_seq(uuid, uuid, text) to authenticated;

-- ⛔ 最後一道閘：同一格唔可以有兩行同號。
--    tree app 承認咗個 race 有界，靠 worker 撞名守衛兜底；
--    我哋喺 DB 直接封死，撞到就係 23505，前端重試攞下一個號。
create unique index quote_photos_slot_seq_uidx
  on public.quote_photos (
    record_id,
    coalesce(tree_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(mitigation, ''),
    seq
  )
  where deleted_at is null;
```

### Rollback SQL

```sql
drop index if exists public.quote_photos_slot_seq_uidx;
drop function if exists public.allocate_quote_photo_seq(uuid, uuid, text);
```

⛔ **兩句都唔會郁任何一行資料**，所以 rollback 之後啲相原封不動。

### ⚠️ 我同 tree app 唔同嘅一處，要 Jason 知

**tree app 有一張 `pair_counters` 表，`last` 只加不減，再加「回收冇人用嘅號」。**

**我建議唔開呢張表**，理由：**D2 揀咗全壓縮遞補** ——
號碼**永遠連續冇窿**，所以**根本冇「冇人用嘅號」可以回收**，
一張只加不減嘅 counter 亦會同壓縮之後嘅實況對唔上。
**`max(seq) + 1` 直接由 live 行數出嚟先係同 D2 一致。**

⛔ **如果 Jason 要照跟 tree app 開表，話我知。**

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
- [ ] 拆唔拆做 P3c-1 / P3c-2 已經決定
- [ ] `pair_counters` 開唔開（我建議唔開）已經決定
- [ ] Jason 本人跑咗第五節張 SQL
