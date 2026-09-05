-- ══════════════════════════════════════════════════════════════════
-- P7：客戶簿（quote_clients）＋ 建立人名（quote_people）
--
-- ⛔⛔ Jason 親手跑。⛔ AI 唔准代跑，亦唔准分段偷步。
-- ⚠️ 跑之前讀完 `docs/P7-客戶簿-人名.md`，嗰度寫住每個決定點解係咁。
--
-- ⭐ 跟返四張現有表嘅同一套規矩（`docs/開發紀錄.md` §七 實測原文）：
--    · 人人 select 到全部（`using (true)`）
--    · insert 要 `created_by = auth.uid()`
--    · ⛔ 故意冇 DELETE policy，⛔ 亦唔 grant DELETE
--    · ⛔ 唔 grant 任何嘢俾 `anon` 同 `service_role`
--
-- ⭐⭐ 呢份跑幾多次都得（idempotent）。跑到一半死咗、或者唔記得跑咗未，
--    ⛔ 唔使查，直接**由頭再跑一次**就會收斂到正確狀態。
--    ⚠️ 2026-09-05 第一版唔係咁：`create policy` 冇 `if not exists`，
--       跑第二次就撞 `42710 policy already exists`，而人係唔知自己跑咗未嘅。
--
-- 出事想返轉頭：最底有兩句 drop，⛔ 但佢會連資料一齊冇，跑之前諗清楚。
-- ══════════════════════════════════════════════════════════════════


-- ── 第 1 段：客戶簿 ────────────────────────────────────────────────
--
-- ⭐ 一筆記錄係「客戶 ＋ 聯絡人 ＋ 電話」**成組**（Jason 2026-08-25）——
--    ⛔ 唔係淨係記個客戶名。同一個房屋署會有唔同屋邨唔同管工。
--
-- ⚠️ 呢張表同 `quote_records` **冇任何 foreign key**，係特登嘅：
--    揀咗客戶之後係**複製一份**入個工程，之後改客戶簿、刪客戶，
--    ⛔ 都唔可以影響已經填咗入工程嗰啲。有 FK 就做唔到呢件事。

create table if not exists public.quote_clients (
  id          uuid primary key default gen_random_uuid(),
  client      text        not null,
  contact     text        not null default '',
  phone       text        not null default '',
  created_by  uuid        not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⛔ 零真刪（全 app 規矩）：唔要就 soft delete。
  deleted_at  timestamptz
);

-- ⛔ 三格全部空白嘅一筆⛔ 唔准入 —— 原型 `saveClient()` 出「請至少填一項」。
-- ⚠️ 畫面嗰邊擋咗一次，呢度再擋一次係特登嘅：畫面擋得到人手輸入，
--    擋唔到第二部機、第二個版本、或者將來有人直接寫 API。
--
-- ⚠️ 特登擺喺 `create table` 外面：如果張表之前已經建咗（跑到一半死咗嗰種），
--    `create table if not exists` 係**唔會**幫你補返個 constraint 嘅。
alter table public.quote_clients
  drop constraint if exists quote_clients_not_all_blank;
alter table public.quote_clients
  add constraint quote_clients_not_all_blank check (
    btrim(client) <> '' or btrim(contact) <> '' or btrim(phone) <> ''
  );

-- ⛔ 三樣完全一樣就唔准再入多次 —— 客戶簿最易變垃圾就係因為重複。
--
-- ⚠️ 比對之前先 `btrim` ＋ `lower`：
--    · `btrim` —— 打字尾後多咗個空格係人手輸入最常見嘅重複來源
--    · `lower` —— 為咗英文（`Housing Dept` vs `housing dept`）；中文冇大細楷，唔受影響
--
-- ⛔ 到此為止，⛔ 唔做模糊比對（例如電話有冇 dash、客戶名多咗「有限公司」）。
--    模糊比對會擋住一啲**真係唔同**嘅客戶，而個錯誤係靜靜咁發生 ——
--    人打完儲存唔到，佢唔會知係因為個系統覺得同另一筆「差唔多」。
--
-- ⚠️⚠️ 呢度**比原型嚴少少**，要記低：
--    原型 `saveClient()` 係 `x.co === c.co` —— trim 咗，但**分大細楷**，
--    即係 `Housing Dept` 同 `housing dept` 喺原型度當兩個唔同客戶，入得兩次。
--    ⭐ 我加咗 `lower()`，所以呢兩筆喺 DB 度會當同一個，入唔到第二次。
--    ⛔ Jason 覺得唔啱就同我講，拎走三個 `lower()` 就同原型一模一樣。
create unique index if not exists quote_clients_unique_idx
  on public.quote_clients (
    lower(btrim(client)),
    lower(btrim(contact)),
    lower(btrim(phone))
  )
  where deleted_at is null;

-- 清單排序用。
create index if not exists quote_clients_live_idx
  on public.quote_clients (client)
  where deleted_at is null;

alter table public.quote_clients enable row level security;

-- 全公司共用嘅通訊錄 ⇒ 人人睇到（同其餘四張表一致）。
drop policy if exists quote_clients_select on public.quote_clients;
create policy quote_clients_select on public.quote_clients
  for select using (true);

-- ⭐ 現場同事都加得客戶 —— 揀客戶嗰個彈窗入面就有「新增」（Jason 2026-08-25）。
--    ⛔ 唔限死辦公室：現場撞到新客戶而加唔到，佢就會打返落工程度算數，
--       個客戶簿就永遠唔會齊。
drop policy if exists quote_clients_insert on public.quote_clients;
create policy quote_clients_insert on public.quote_clients
  for insert with check (created_by = auth.uid());

-- ⚠️ 改同「刪」（寫 `deleted_at`）都行呢一條。
--    ⭐ 特登畀所有人改：呢張係共用通訊錄，⛔ 唔係邊個開就邊個嘅嘢。
--       而且改咗**唔會影響已經填咗入工程嗰啲**（見上面冇 FK 嗰段），
--       所以改錯嘅代價係「下次揀嗰陣睇到錯資料」，⛔ 唔係「舊單被改咗」。
drop policy if exists quote_clients_update on public.quote_clients;
create policy quote_clients_update on public.quote_clients
  for update using (true) with check (true);

-- ⛔ 冇 DELETE policy。⛔ 唔准加。

grant select, insert, update on public.quote_clients to authenticated;
-- ⛔ 一個字都唔 grant 俾 anon 同 service_role。


-- ── 第 2 段：建立人名 ──────────────────────────────────────────────
--
-- ⚠️ 「邊個開呢單」**一直都有記** —— `quote_records.created_by` 由第一日就存住。
--    差嘅淨係「UUID → 人名」呢個對照，⛔ 唔使再開多個欄去記邊個開。
--
-- ⛔ 呢張表**唔係**權限表。權限係 `quote_admins`，兩者⛔ 唔准溝埋。
--    一個人喺呢度有名，唔代表佢係辦公室。

create table if not exists public.quote_people (
  user_id      uuid primary key references auth.users (id),
  display_name text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.quote_people enable row level security;

-- 人人睇到 —— 工程卡要出「建立人：阿耀」，搜尋面板要出成條下拉。
drop policy if exists quote_people_select on public.quote_people;
create policy quote_people_select on public.quote_people
  for select using (true);

-- ⛔ 只有辦公室加得、改得。
--    ⭐ 呢個同客戶簿相反，理由唔同：改人名會**改寫歷史**——
--       所有舊工程卡即刻跟住變。客戶簿改咗只影響將來揀嗰陣。
drop policy if exists quote_people_write on public.quote_people;
create policy quote_people_write on public.quote_people
  for all using (public.is_quote_admin()) with check (public.is_quote_admin());

-- ⛔ 冇 DELETE policy。人走咗都唔准刪 —— 刪咗佢開嘅舊工程就會冇返個名。

grant select, insert, update on public.quote_people to authenticated;
-- ⛔ 一個字都唔 grant 俾 anon 同 service_role。


-- ── 跑完之後自己驗（只讀，⛔ 唔改嘢）────────────────────────────────
--
-- 兩張表應該各出三條 / 兩條 policy，而且**一條 DELETE 都冇**：
--
--   select tablename, policyname, cmd
--     from pg_policies
--    where tablename in ('quote_clients','quote_people')
--    order by tablename, policyname;
--
-- 確認冇 grant 咗 DELETE，亦冇 grant 俾 anon / service_role：
--
--   select grantee, privilege_type, table_name
--     from information_schema.role_table_grants
--    where table_name in ('quote_clients','quote_people')
--    order by table_name, grantee, privilege_type;


-- ── ⛔ 出事先跑（⚠️ 會連資料一齊冇）───────────────────────────────
-- drop table if exists public.quote_clients;
-- drop table if exists public.quote_people;
