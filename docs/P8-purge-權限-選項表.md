# P8 `/purge` 權限：四個做法，⛔ 我唔揀

**2026-09-20** · ⛔ **一行 SQL 都未寫。等 CO 揀完、Jason 批。**

---

## 0. 件事係點

Jason 跑咗只讀查詢，`can_edit_quote_record()` 原文逐字：

```sql
CREATE OR REPLACE FUNCTION public.can_edit_quote_record(rid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.quote_records r
    where r.id = rid
      and r.deleted_at is null
      and ( (r.created_by = auth.uid() and r.locked = false)
            or public.is_quote_admin() )
  );
$function$
```

⛔⛔ **睇個結構**：`r.deleted_at is null` 係一個 **AND**，而且佢喺個 **OR 括號外面**
⇒ **連 `is_quote_admin()` 都繞唔到佢**。

⇒ **一單已經刪咗嘅工程，冇任何人改得到佢啲相 —— 包括 admin。**

| 閘 | 喺邊 | admin 過唔過到 |
| --- | --- | --- |
| ① `r.deleted_at is null` | **OR 括號外面** | ⛔ **過唔到** |
| ② `r.locked = false` | OR 入面 | ✅ 過到 |
| ③ `r.created_by = auth.uid()` | OR 入面 | ✅ 過到 |

⇒ `/purge`（#67）而家**一張相都清唔到**，而且照 RLS 嘅樣，佢 ⛔ **唔會報錯**，
只會 0 行（CLAUDE.md §2.6）。

### ⭐ 順帶一提：個「閘准 PATCH」做啱咗

佢喺掂任何一個 byte 之前就會 0 行、會拒。
⚠️ 照計劃書原本個次序（R2 → Drive → stamp），今日呢件事嘅結局會係：
**相已經真係冇咗，先至喺最後一步俾人拒** —— 而嗰陣救唔返。

---

## 1. ⛔ 三條硬規矩（四個做法都要守）

1. ⛔ **`SUPABASE_SERVICE_ROLE_KEY` 一個字都唔准出現**（CLAUDE.md §2.9、`wrangler.toml`）。
   ⇒ 下面四個做法**冇一個**用到佢。
2. ⛔ **我唔跑任何 SQL** —— 只寫草稿俾 Jason 親手跑（CLAUDE.md §3）。
3. ⛔ **每個做法都要答**：錯嗰陣會唔會**靜靜咁失靈**。

---

## 2. ⚠️⚠️ 先講一件影響四個做法嘅事實

### **PostgreSQL 嘅 RLS policy ⛔ 管唔到「邊個欄」。**

`USING` / `WITH CHECK` 係**行**嘅條件，⛔ 唔係欄嘅條件。
⇒ **「一條淨係俾改 `purged_at` 嘅 UPDATE policy」呢樣嘢⛔ 唔存在。**

想收窄到欄，得兩條路：

- **column-level GRANT**（`grant update (purged_at) on … to authenticated`）——
  ⚠️ 但 GRANT 係**跟 role** 嘅，⛔ 唔係跟 policy。收窄咗就**全部 UPDATE 一齊收窄**。
- **`SECURITY DEFINER` function** —— 由 function 自己決定寫邊個欄（做法 ④）。

### ⭐ 今日邊啲欄真係有人 update（⛔ 我 grep 過，⛔ 唔係估）

| 邊個 | 寫邊啲欄 |
| --- | --- |
| 前端 `src/lib/photos.ts` | ⛔ **一個 update 都冇** —— 得 `insert`（`create()`） |
| Worker `/mirror` | `drive_file_id`、`drive_synced_at`、`drive_error` |

⇒ ⭐ **今日全世界只有三個欄有人 update。** 即係收窄到
`(drive_file_id, drive_synced_at, drive_error, purged_at)` **⛔ 唔會整爛任何現有嘢**。

### ⛔ column-level grant 收唔收得窄 —— **部分我知，部分⛔ 我唔知**

| | |
| --- | --- |
| ✅ **我知**：PostgreSQL 支援 `grant update (欄名) on 表 to role` | 標準 SQL，`information_schema.column_privileges` 查得到 |
| ✅ **我知**：缺欄權限會 raise `42501 permission denied for column` | ⭐ 即係**出錯**，⛔ 唔係靜靜 0 行 —— 呢個係好事 |
| ⛔ **我唔知**：Supabase／PostgREST 會唔會把 `42501` 好好地傳返出嚟，定係變成另一個 status | ⛔ 我掂唔到個 DB，⛔ 試唔到 |
| ⛔ **我唔知**：而家 `quote_photos` 上面到底有冇 column-level grant | ⛔ 冇人查過 |

⇒ **一句只讀查詢就答到最後兩條**，擺咗喺每份草稿最前：

```sql
select grantee, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'quote_photos'
   and grantee not in ('postgres')
 order by grantee, column_name;
```

---

## 3. 四個做法

### ① 新開一個窄 function ＋ 一條新 UPDATE policy

**改咩**

```sql
-- 新 function：單係「已刪」＋（開單嗰個 或 admin）
create or replace function public.can_purge_quote_record(rid uuid) …
  select exists (select 1 from public.quote_records r
                  where r.id = rid
                    and r.deleted_at is not null          -- ⭐ 反轉咗
                    and (r.created_by = auth.uid() or public.is_quote_admin()));

-- 新 policy（同現有嗰條並存，RLS 係 OR）
create policy quote_photos_purge on public.quote_photos
  for update using (public.can_purge_quote_record(record_id))
           with check (public.can_purge_quote_record(record_id));
```

⚠️ 注意 ⛔ **冇咗 `locked = false`** —— 一單已經刪咗嘅工程，`locked` ⛔ 冇意思。
⭐ 呢個係一個**要你拍板**嘅細節，⛔ 唔係我順手拆。

**邊個跑** Jason（新 function ＋ 新 policy ＝ 改權限，CLAUDE.md §3 要佢本人批）

**代價**
⛔⛔ RLS policy 管唔到欄（見 §2）⇒ 加咗呢條之後，**一單已刪工程嘅相，
開單嗰個同 admin 就改得到佢嘅所有欄**（`drive_file_id`、`r2_key`、`sha256`…），
⛔ 唔止 `purged_at`。

⭐ 想真係收窄到欄，就要**同時**收 column grant：

```sql
revoke update on public.quote_photos from authenticated;
grant update (drive_file_id, drive_synced_at, drive_error, purged_at)
  on public.quote_photos to authenticated;
```

⚠️ ⛔ 但呢句要先跑咗 §2 嗰條只讀查詢、確認冇第二個 role 靠緊 table-wide UPDATE 先做得。

**最衰情況**
⚠️ 忘記收 column grant ⇒ 一個**比而家闊**嘅寫入權限靜靜咁存在咗，
而⛔ 冇任何嘢會提你 —— 因為「多咗權限」⛔ 唔會令任何嘢報錯。

**錯嗰陣會唔會靜靜失靈**
- **改少咗**（policy 寫錯條件）⇒ ⭐ **⛔ 唔會靜** —— 個「閘准 PATCH」會 0 行、會拒，
  而 `/purge` 會回 `failed` ＋ 中文原因。**bytes 一個都唔會冇。**
- **改多咗**（權限太闊）⇒ ⛔⛔ **會靜** —— 見上面。

**⛔ 唔使改 Worker** —— 閘准 PATCH 同 stamp 照用，⛔ 一行 code 都唔使郁。

---

### ② ⛔ 唔喺 DB stamp，另想辦法記低「邊張清咗」

**改咩** 唔加 `purged_at`；改為喺 R2／Drive／部機邊度記住。

**邊個跑** ⛔ 唔使 SQL。

**⛔ 我覺得唔掂，而理由係我自己寫過嗰句**：

> 一行「`deleted_at` 有值、`purged_at` 冇值」嘅相，**就係「未清完」呢個狀態本身**
> ⇒ ⛔ 唔使另開一張表、⛔ 唔使另外記帳。

⛔ 攞走個欄，就要另外起一本帳 —— 而**兩本帳一定會有一日唔夾**
（同 CLAUDE.md §2.13 嗰句一模一樣）。

⚠️ 而且逐個地方數過，冇一個記得住：

| 記喺邊 | 點解唔得 |
| --- | --- |
| R2 | 我哋**啱啱先刪咗**嗰個 object —— ⛔ 冇嘢剩低可以做記號 |
| Drive | 檔喺垃圾桶，30 日後**自己消失** ⇒ 記號跟住冇 |
| 部機 IndexedDB | ⛔ 只係嗰部機知。第二個人開 app 會見到「未清完」，然後再清一次 |
| Worker KV／D1 | ⛔ 而家冇，開一個 ＝ **多一個要對數嘅地方**（§2.8 精神相反） |

**最衰情況** 「清完」同「未清完」永遠分唔清 ⇒ 要麼重複清（冇害但永遠減唔落），
要麼有相**永遠冇人再清**（bytes 留喺雲端）。

**錯嗰陣會唔會靜靜失靈** ⛔⛔ **會，而且係最靜嗰個** —— 兩本帳唔夾⛔ 冇任何嘢會報。

---

### ③ 放寬而家條 `can_edit_quote_record()`

**改咩** 把 `r.deleted_at is null` 拆走，或者改成 `or r.deleted_at is not null`。

**邊個跑** Jason。

**代價 ⛔⛔ 影響範圍遠遠大過 `/purge`**

⭐ 呢條 function ⛔ 唔止 `quote_photos` 用。實測（`docs/開發紀錄.md` §七）：

- `quote_trees_insert`、`quote_trees_update`
- `quote_site_form_insert`、`quote_site_form_update`
- `quote_photos` 條 update policy

⇒ 拆走嗰句 ＝ **「已刪嘅單唔准改」呢道閘，喺成個 app 一次過冇咗**。
⚠️ 一單刪咗嘅工程，佢啲樹、現場資料、相，全部**重新變成改得**。

**最衰情況**
一個人喺「已刪」篩選度開返一單舊工程，改咗嘢，⛔ 而畫面⛔ 冇任何嘢講佢改緊一單已刪嘅單。

**錯嗰陣會唔會靜靜失靈** ⛔⛔ **會** —— 「多咗權限」⛔ 永遠唔會報錯。

⭐ ⛔ **我唔建議**：為咗一條路（`/purge`）去拆一道守住四張表嘅閘。

---

### ④ 一個 `SECURITY DEFINER` RPC，淨係做 stamp 一件事

**改咩**

```sql
create or replace function public.quote_purge_stamp(p_photo_id uuid, p_dry_run boolean)
  returns boolean language plpgsql security definer set search_path to 'public' as $$
declare ok boolean;
begin
  select exists (
    select 1 from public.quote_photos p
      join public.quote_records r on r.id = p.record_id
     where p.id = p_photo_id
       and r.deleted_at is not null
       and (r.created_by = auth.uid() or public.is_quote_admin())
  ) into ok;
  if not ok then return false; end if;
  if p_dry_run then return true; end if;
  update public.quote_photos set purged_at = now() where id = p_photo_id;
  return true;
end $$;

grant execute on function public.quote_purge_stamp(uuid, boolean) to authenticated;
```

**邊個跑** Jason。

**好處**
⭐⭐ **佢係四個入面唯一一個真係做到「淨係改 `purged_at`」嘅做法** ——
因為寫邊個欄係**寫死喺 function 入面**，⛔ 唔靠 grant、⛔ 唔靠 policy。
⇒ ⛔ **唔使郁任何現有 policy、⛔ 唔使郁任何 grant、⛔ 唔使收 column grant。**

⭐ `p_dry_run` 就係 CLAUDE.md §2.13 個「閘准」：**同一條 function、同一段判斷**，
⛔ 唔係第二套「邊個刪得」嘅講法。

**代價**
⚠️ `SECURITY DEFINER` ＝ **繞過 RLS**。條 function 入面嗰段 `where` 就係**全部**把關
⇒ 寫錯一個字就係一個漏。

⚠️⚠️ CLAUDE.md §2.1 寫住 ⛔ **唔准抄 tree app 嗰個 `SECURITY DEFINER` 刪除 RPC**。
⭐ 呢個⛔ 唔係嗰樣（佢⛔ 唔刪任何嘢，只係寫一個 timestamp），
**⛔ 但佢喺同一個家族，所以要 Jason 本人明文批。**

⚠️ 要改 Worker：`patchPhoto` 兩下換成兩下 `rpc/quote_purge_stamp`
（`p_dry_run = true` 做閘准、`false` 做 stamp）。⇒ #67 要改，測試要跟住改。

**最衰情況**
條 function 個 `where` 寫漏咗 `r.deleted_at is not null`
⇒ **一單仲用緊嘅工程都 stamp 得到**。
⭐ 但 `/purge` 閘一（母單一定要刪咗）喺 Worker 度**仲喺度**，⇒ 兩道閘要同時錯先出事。

**錯嗰陣會唔會靜靜失靈**
- **改少咗** ⇒ ⭐ ⛔ 唔會靜 —— dry run 回 `false`，`/purge` 出中文原因，bytes 唔掂。
- **改多咗** ⇒ ⛔ 會靜，**但範圍最窄**：最衰都只係「`purged_at` 被寫」，
  ⛔ 郁唔到任何其他欄、⛔ 郁唔到任何其他表。

---

## 4. 四個擺埋一齊

| | 改咩 | 邊個跑 | 影響範圍 | 改少咗會唔會靜 | 改多咗會唔會靜 | 要唔要改 Worker |
| --- | --- | --- | --- | --- | --- | --- |
| **①** | 新 function ＋ 新 policy（＋ 最好收 column grant） | Jason | `quote_photos` 一張表 | ⛔ 唔會 | ⚠️ **會**（唔收 column grant 就全欄開咗） | ⛔ 唔使 |
| **②** | ⛔ 唔加欄，另起一本帳 | ⛔ 唔使 | 全 app | — | ⛔⛔ **會，最靜** | ✅ 要（大改） |
| **③** | 拆 `can_edit_quote_record()` 條閘 | Jason | **四張表** | ⛔ 唔會 | ⛔⛔ **會** | ⛔ 唔使 |
| **④** | `SECURITY DEFINER` RPC，寫死只改 `purged_at` | Jason | **一個欄** | ⛔ 唔會 | ⚠️ 會，**但範圍最窄** | ✅ 要（細改） |

⛔ **我⛔ 唔揀** —— ①④ 兩個都企得住，而佢哋換嘅嘢唔同：

- **①** 換「⛔ 唔使郁 Worker、⛔ 唔使 `SECURITY DEFINER`」，
  代價係**要記得埋收 column grant**，而忘記咗⛔ 冇嘢提你。
- **④** 換「影響範圍窄到一個欄、`dry_run` 天生就係 §2.13 嗰個閘准」，
  代價係**多一個 `SECURITY DEFINER`**，而佢入面嗰段 `where` 就係全部把關。

⛔ **②③ 我明文唔建議**，理由喺上面。

---

## 5. ⚠️ 兩個順帶要講嘅

### 一 · `quote_photos` 個 `deleted_at`（相自己都有 soft delete）

⛔ **`/purge` 同佢有一個唔夾嘅地方，而家仲未出事，但要寫低。**

- `/purge` 揀相係 `quote_photos?record_id=eq.X` —— ⛔ **冇隔 `deleted_at`**
  ⇒ 連軟刪咗嗰啲一齊清。⭐ 咁樣係啱嘅：成單工程都冇咗，嗰啲相冇理由留。
- ⚠️ **但彈窗數出嚟嗰個 N ⛔ 唔係咁數** —— `src/lib/purgeCounts.ts:64`
  寫住「已經軟刪咗嗰啲唔算」。

⇒ 即係話：**彈窗話「N 張相會消失」，而 `/purge` 實際上會清多過 N 張。**

⭐ **今日撞唔到**：我 grep 過成個 `src/`，⛔ **冇任何一句 code 寫過
`quote_photos.deleted_at`** —— 所以今日永遠係 0 張軟刪相。
⛔ **但邊日加咗「刪一張相」呢個功能，呢兩個數就即刻唔夾。**

⇒ 要麼 `/purge` 跟住隔走軟刪嗰啲，要麼彈窗照數埋。⛔ 兩個都得，⛔ 但要揀一個。
**⛔ 呢個唔急（今日撞唔到），但⛔ 唔准當佢唔存在。**

### 二 · `purged_at` 個欄本身照計要加

Jason 跑咗欄表，**確認冇 `purged_at`** ✅ ⇒ `docs/P8-purged_at-草稿.sql`
第 1 段照計要跑。⛔ 四個做法入面有三個（①③④）都要嗰個欄。

---

## 6. 次序（⛔ 釘死）

```
選項表（呢份）→ CO 揀 → 我寫草稿 → Jason 親手跑 SQL
→ npx wrangler deploy → 同日 flip PHOTOS_REALLY_PURGED = true
```

⛔⛔ **喺 CO 揀之前：`/purge` ⛔ 唔准 deploy，`PHOTOS_REALLY_PURGED` ⛔ 唔准郁。**
