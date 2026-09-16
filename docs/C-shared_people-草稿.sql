-- ══════════════════════════════════════════════════════════════════
-- C：`public.shared_people` —— ⛔⛔ **草稿，未批，⛔ 唔准跑**
--
-- ⛔⛔ Jason 親手跑。⛔ AI 唔准代跑，亦唔准分段偷步（CLAUDE.md §3）。
--
-- ⚠️⚠️⚠️ **跑之前一定要讀最底嗰兩段「⛔ 兩個要你先答嘅問題」。**
--    佢哋⛔ 唔係細節 —— 一個係「呢張表使唔使存在」，
--    一個係「呢個名破咗 CLAUDE.md §3 條線」。
--    ⭐ 兩條未答之前，⛔ 呢份嘢一句都唔好跑。
--
-- ⭐⭐ 跑幾多次都得（idempotent）。跑到一半死咗、或者唔記得跑咗未，
--    ⛔ 唔使查，直接**由頭再跑一次**就會收斂到正確狀態。
--    ⚠️ 2026-09-05 P7 第一版唔係咁：`create policy` 冇先 `drop`，
--       跑第二次就撞 `42710 policy already exists`，而人係唔知自己跑咗未嘅。
-- ══════════════════════════════════════════════════════════════════


-- ── 張表 ──────────────────────────────────────────────────────────
--
-- ⛔⛔ **⛔ 冇 foreign key 去 `auth.users`**（明文要求）。
--    ⭐ 點解要特別寫低：呢張表記嘅係**人**，⛔ 唔係**登入帳號**。
--    ⚠️ 有 FK 就等於「冇開過帳號嘅人唔准入」—— 而現場好多人
--       （分判、管工、客戶嗰邊嘅聯絡人）**永遠唔會有呢個 app 嘅帳號**。
--    ⚠️ 亦都即係話：呢張表**⛔ 唔係權限表**。喺呢度有名 ⛔ 唔代表登入得、
--       更加⛔ 唔代表係辦公室（權限係 `quote_admins` ＋ `is_quote_admin()`）。
--
-- ⭐ `id` 用 `gen_random_uuid()`，同 `quote_clients` 一套。

create table if not exists public.shared_people (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  email       text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⛔ 零真刪（CLAUDE.md §2.1）：唔要就 soft delete。
  deleted_at  timestamptz
);


-- ── 檢查：名同 email 都唔准係空白 ──────────────────────────────────
--
-- ⚠️ 特登擺喺 `create table` 外面：張表之前已經建咗（跑到一半死咗嗰種）嘅話，
--    `create table if not exists` ⛔ **唔會**幫你補返個 constraint。
--
-- ⚠️ 用 `btrim(...) <> ''` ⛔ 唔用 `not null` 就算 ——
--    `not null` 擋唔到一個**得幾個空格**嘅值，而嗰個係人手輸入最常見嘅垃圾。

alter table public.shared_people
  drop constraint if exists shared_people_name_not_blank;
alter table public.shared_people
  add constraint shared_people_name_not_blank check (btrim(name) <> '');

-- ⚠️ ⛔ 唔用正則去「驗」一個 email 啱唔啱 —— 世上冇一條正則驗得準，
--    而驗得太嚴就會擋走真人（例如 `+` 號、長 TLD）。
-- ⭐ 呢度只擋**明顯唔係 email** 嘅嘢：要有 `@`、`@` 前後都要有嘢、⛔ 冇空格。
alter table public.shared_people
  drop constraint if exists shared_people_email_shape;
alter table public.shared_people
  add constraint shared_people_email_shape check (
    btrim(email) <> ''
    and position('@' in btrim(email)) > 1
    and position('@' in btrim(email)) < length(btrim(email))
    and btrim(email) !~ '\s'
  );


-- ── email ⛔ 唔准撞 ────────────────────────────────────────────────
--
-- ⚠️ 比對之前先 `btrim` ＋ `lower`：
--    · `btrim` —— 打完尾後多咗個空格係最常見嘅重複來源
--    · `lower` —— email 嘅 domain 本來就唔分大細楷
--
-- ⛔ 用 unique **index**（⛔ 唔係 unique constraint）—— 因為要 `where deleted_at is null`：
--    ⭐ soft delete 咗一個人之後，同一個 email 要入得返。
--    ⚠️ constraint 做唔到條件式，index 先做到。

create unique index if not exists shared_people_email_unique_idx
  on public.shared_people (lower(btrim(email)))
  where deleted_at is null;


-- ── RLS ＋ GRANT（⛔ 兩樣缺一不可，CLAUDE.md §2.2）──────────────────
--
-- ⚠️ 淨係開 RLS 而冇 GRANT，app 一開就紅字 `permission denied for table …`，
--    睇落似 RLS 寫錯，其實係權限未開（2026-08-13 P1 中過一次）。

alter table public.shared_people enable row level security;

-- 人人睇到全部。⭐ 呢張表本身就係一本俾大家查嘅簿。
drop policy if exists shared_people_select on public.shared_people;
create policy shared_people_select on public.shared_people
  for select using (true);

-- ⛔⛔ **⛔ 冇任何 write policy**（明文要求）。
--    ⇒ 即係話 `authenticated` **insert／update／delete 一律做唔到**，
--      就算下面 grant 咗 insert／update 都一樣 —— RLS 冇 policy ＝ 全部拒絕。
--    ⭐ 入資料淨係得一條路：**Jason 喺 Supabase SQL editor 自己 insert**。
--
-- ⚠️⚠️ 呢個設計有一個**已知後果**，⛔ 唔准當佢唔存在：
--    **張表跑完係空嘅**，而且⛔ 冇任何畫面入口可以加人。
--    ⭐ `quote_admins` 就係咁空咗成個月都冇人發現（`docs/開發紀錄.md` 附錄 B）。
--    ⇒ 跑完之後**即刻**行最底嗰段讀返出嚟，⛔ 唔好等。

-- ⛔ 唔 grant DELETE（零真刪，CLAUDE.md §2.1）。
-- ⛔ 一個字都唔 grant 俾 `anon`（未登入唔應該掂到）同 `service_role`
--    （CLAUDE.md §2.9：每開一張新表都要 revoke 一次 —— Supabase 預設會派）。
grant select on public.shared_people to authenticated;

-- ⚠️ Supabase 開新表會自動派權限俾 `service_role`。⛔ 呢句收返佢。
--    ⭐ 呢個⛔ 唔係一次性動作，係常設規矩（§2.9）。
revoke all on public.shared_people from service_role;
revoke all on public.shared_people from anon;


-- ══════════════════════════════════════════════════════════════════
-- ⛔ 跑完即刻讀返出嚟（只讀，⛔ 唔改嘢）
--
-- ⭐ 四句都會**出行數**。⛔ 唔好淨係睇「跑咗冇報錯」——
--    2026-08-13 同 2026-09-14 兩次都係「冇報錯」但其實冇嘢喺入面。
-- ══════════════════════════════════════════════════════════════════

-- ① 張表入面而家有幾多人（⭐ 預期：0，⛔ 而 0 就即係仲未用得）
select count(*) as 總人數,
       count(*) filter (where deleted_at is null) as 仲喺度,
       count(*) filter (where deleted_at is not null) as 刪咗
  from public.shared_people;

-- ② policy：⭐ 預期**啱啱好一條**，而且係 SELECT
select count(*) as policy_條數,
       string_agg(policyname || '=' || cmd, ', ' order by policyname) as 逐條
  from pg_policies
 where schemaname = 'public' and tablename = 'shared_people';

-- ③ GRANT：⭐ 預期**啱啱好一行** —— `authenticated` 嘅 `SELECT`
--    ⚠️ `postgres` 係 owner，佢有齊所有嘢係正常嘅，所以下面隔走佢。
--    ⛔ 淨係數總數分唔出「owner 有」同「authenticated 有」（2026-08-22 中過）。
select count(*) as grant_行數,
       string_agg(grantee || '=' || privilege_type, ', ' order by grantee, privilege_type) as 逐行
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'shared_people'
   and grantee not in ('postgres');

-- ④ 兩個 check ＋ 個 unique index 都喺度（⭐ 預期：2 同 1）
select
  (select count(*) from pg_constraint
    where conrelid = 'public.shared_people'::regclass and contype = 'c') as check_條數,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'shared_people_email_unique_idx') as unique_index_條數;


-- ══════════════════════════════════════════════════════════════════
-- ⛔⛔ 兩個要你先答嘅問題 —— ⭐ 未答之前，上面一句都唔好跑
-- ══════════════════════════════════════════════════════════════════
--
-- ⛔ 問題一：**呢張表同 `quote_people` 係咪重複咗？**
--
--   `docs/P7-客戶簿-人名.sql` 已經定義咗 `public.quote_people`：
--
--     create table if not exists public.quote_people (
--       user_id      uuid primary key references auth.users (id),
--       display_name text not null, …
--     );
--
--   ⚠️ 兩張表都係「人名對照」。分別係：
--
--     quote_people    綁住登入帳號（有 FK 去 auth.users）、有 write policy
--                     （辦公室改得）、用嚟出「建立人：阿耀」
--     shared_people   ⛔ 冇 FK、⛔ 冇 write policy、有 email
--
--   ⭐ 兩張都講得通（一張係「邊個開呢單」，一張係「一本人名簿」），
--   ⚠️ **但兩張都空咗、兩張都要人手入名、而且兩張都叫「people」** ——
--      ⛔ 三個月後冇人分得返邊張係邊張。
--
--   ⇒ **要你講明**：
--      甲：兩張都要，而且寫低邊張做乜（⭐ 咁就要改名，見問題二）
--      乙：得一張 —— 邊張？另一張嗰份草稿／SQL 要劃走
--
--   ⛔ 我⛔ 唔會自己揀。
--
--
-- ⛔ 問題二：**個名 `shared_people` 破咗 CLAUDE.md §3 條線**
--
--   §3 寫住：**「只可以掂 `quote_` 開頭嘅表同 `quote` / `is_quote_` 開頭嘅 function」**，
--   理由係 Supabase 同 tree app **真係共用**，而 `projects` / `photos` / `admins`
--   嗰啲係 tree app 嘅，⛔ 一個字都唔准郁。
--
--   ⚠️ `shared_people` **冇 `quote_` 前綴**。睇個名，佢係**特登**要俾兩個 app 共用嘅
--   —— 但咁樣就同 §3 嗰條「只掂 `quote_`」直接相撞。
--
--   ⭐ 我嘅睇法（⛔ 一個建議，⛔ 唔係決定）：
--      · **新開一張表**同「郁 tree app 嗰啲表」⛔ 唔同級 —— 前者唔會整爛任何現有嘢。
--      · ⚠️ 但真正嘅風險喺後面：一旦 tree app 都讀呢張表，
--        **以後改佢就要同時諗兩個 app** —— 而 §3 成條線就係為咗避開呢樣。
--      · ⇒ 如果只係 quote app 用，建議叫 **`quote_people_book`**（或者直接用返
--        `quote_people`，見問題一），⛔ 唔好行出 `quote_` 呢個範圍。
--      · ⇒ 如果**真係**兩個 app 都要共用，咁就⛔ 唔止係改個名嘅事 ——
--        要 Jason 本人明文批，而且要寫低**邊個 app 改得、邊個只讀**。
--
--   ⛔ 未有佢呢句之前，⛔ 唔准跑。
--
--
-- ── ⛔ 出事先跑（⚠️ 會連資料一齊冇）────────────────────────────────
-- drop table if exists public.shared_people;
