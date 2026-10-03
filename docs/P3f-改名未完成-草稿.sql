-- ══════════════════════════════════════════════════════════════════
-- P3f §4.6：「改名未完成」記入資料庫（⚠️ 只係原型「丙 · 記入資料庫」揀咗先要）
--
-- ⛔⛔ **草稿。Jason 親手跑。⛔ AI 唔准代跑**（CLAUDE.md §3）。⛔ 我冇跑過，
--    ⛔ 亦冇連過任何 DB 去查（下面第 0 段嘅「預期」係由 docs 推出嚟，⚠️ 未驗）。
-- ⛔ 擺喺原型分枝（claude/proto-rename-tree），呢條分枝⛔ 永遠唔 merge。
--    你揀咗「記入資料庫」，正式 PR 會帶一份正式稿。
--
-- 點解要：揀「只記喺呢部手機」嘅話，第二部手機、辦公室電腦⛔ 見唔到
--   「改名未完成」，而 Drive 其實仲係半新半舊。記入 `quote_trees` 就人人見到。
--
-- ⭐ 做法：`quote_trees` 加一欄 `drive_rename_left`（整數，可空）
--     · `null`  ＝ 冇嘢未完成（⭐ 所有現有嘅樹都係呢個，⛔ 唔使補數）
--     · `n > 0` ＝ 仲有 n 張相 Drive 檔名係舊樹牌
--   App：改樹牌同一個 update **一齊寫** `drive_rename_left = 相數`（＝「改名中」），
--        叫完 `/rename-tree`：`ok` ⇒ 寫返 `null`；唔 ok ⇒ 寫剩低幾多張。
--   ⇒ 叫到一半熄 app，個數都留喺度 ⇒ 下次開照樣出橫幅。
--
-- ⚠️ 代價（⛔ 唔准收埋）：
--   1. 離線同步 / 本機快取嗰邊個 tree type 要加呢欄，⛔ 唔係淨係加一欄就完。
--   2. Worker `/rename-tree` ⛔ 唔使改（佢唔寫呢欄，由 app 寫）。
--   3. ⚠️ 未查 `quote_trees` 有冇 trigger 會因為寫呢欄而郁 `updated_at` ——
--      第 0 段 ③ 會列出嚟，有嘅話貼返俾我先。
--
-- ⭐ 跑幾多次都得（`if not exists`）。⛔ 冇 drop、⛔ 冇改 policy、⛔ 冇 default。
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 第 0 段：只讀，先睇（⭐ 全部係 select，⛔ 唔改嘢）
-- ══════════════════════════════════════════════════════════════════

-- ① `quote_trees` 而家有咩欄（⭐ 預期：⛔ 冇 `drive_rename_left`）
select column_name as 欄名, data_type as 型, is_nullable as 可空
  from information_schema.columns
 where table_schema = 'public' and table_name = 'quote_trees'
 order by ordinal_position;

-- ② 有冇人收窄過 column grant（⭐ 預期：一行都冇；有就貼返俾我，⛔ 唔好跑第 1 段）
select grantee as 邊個, column_name as 邊個欄, privilege_type as 咩權
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'quote_trees'
   and grantee not in ('postgres')
 order by grantee, column_name;

-- ③ trigger（⚠️ 有 `updated_at` 類嘅就貼返俾我）
select tgname as trigger名, pg_get_triggerdef(oid) as 內容
  from pg_trigger
 where tgrelid = 'public.quote_trees'::regclass and not tgisinternal;


-- ══════════════════════════════════════════════════════════════════
-- 第 1 段：加欄
-- ⛔ 唔准加 `default` —— 加咗 0 都冇所謂，但加錯一個正數就所有樹即刻出橫幅。
-- ⛔ 唔使加 GRANT：`authenticated` 嘅 update 係成張表，新欄自動包埋（第 2 段驗）。
-- ══════════════════════════════════════════════════════════════════

alter table public.quote_trees
  add column if not exists drive_rename_left integer
  check (drive_rename_left is null or drive_rename_left > 0);

-- ⇒ 預期：`ALTER TABLE`


-- ══════════════════════════════════════════════════════════════════
-- 第 2 段：⛔ 跑完即刻驗 ——「冇報錯」⛔ 唔等於「做咗」
-- ══════════════════════════════════════════════════════════════════

-- ① 欄喺度（⭐ 預期：一行，integer，可空 YES）
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'quote_trees'
   and column_name = 'drive_rename_left';

-- ② 現有嘅樹全部係 null（⭐ 預期：未完成 = 0）
select count(*) as 總樹數,
       count(drive_rename_left) as 未完成
  from public.quote_trees;

-- ③ `authenticated` 改得呢張表（⭐ 預期：見到 authenticated=UPDATE）
select grantee || '=' || privilege_type as 權
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'quote_trees'
   and grantee = 'authenticated' and privilege_type = 'UPDATE';


-- ── ⛔ 出事想還原（⚠️ 淨係未有 code 用呢欄之前先好做）────────────────
--   alter table public.quote_trees drop column if exists drive_rename_left;
