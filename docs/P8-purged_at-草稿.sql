-- ══════════════════════════════════════════════════════════════════
-- P8 步 3：`quote_photos` 加一個 `purged_at`
--
-- ⛔⛔ **草稿。Jason 親手跑。⛔ AI 唔准代跑，亦唔准分段偷步**（CLAUDE.md §3）。
--
-- ⚠️⚠️ **第 0 段有一條問題，答咗先好跑第 1 段。**
--    ⛔ 佢唔係細節 —— 答錯嗰邊，成條 `/purge` 由頭到尾一張相都清唔到。
--
-- ⭐⭐ 跑幾多次都得（idempotent）。
--
-- 背景：2026-09-20 寫 Worker `/purge` 嗰陣揾到 ——
--   計劃書由頭到尾寫住「stamp `quote_photos.purged_at`」，
--   ⛔ **但呢個欄根本唔存在**。grep 過成個 repo：得計劃書提過，
--   `src/lib/purgeCounts.ts:72` 仲寫住「將來（P8 步 3）會多一個」。
--   ⇒ ⛔ 冇呢個欄，`/purge` 個第 ④ 步（stamp）一定失敗。
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 第 0 段：⛔⛔ 只讀。⭐ 一條**會決定成件事成唔成立**嘅問題
-- ══════════════════════════════════════════════════════════════════
--
-- ⛔⛔ **問題：`can_edit_quote_record()` 入面有冇 `deleted_at is null`？**
--
--   `quote_photos` 條 update policy 係 `can_edit_quote_record(record_id)`。
--   而 `/purge` **只會清一單已經刪咗嘅工程**（`deleted_at` 有值）——
--   呢個係特登嘅閘，⛔ 唔准清一單仲用緊嘅。
--
--   ⚠️⚠️ 兩個可能，後果完全相反：
--     · 條 function **冇**睇 `deleted_at` ⇒ ✅ 冇嘢要改，行得。
--     · 條 function **有** `deleted_at is null` ⇒ ⛔⛔ 已刪嘅單一律改唔到
--       ⇒ `/purge` 嘅「問准」同「stamp」**兩步都會俾人拒**
--       ⇒ **一張相都清唔到，而且⛔ 唔會報錯**（RLS 只係 0 行，CLAUDE.md §2.6）。
--
--   ⛔ 我讀唔到條 function 嘅原文（我掂唔到個 DB），⛔ 亦唔准估。
--   ⇒ 跑呢句，把結果貼返俾我：

select pg_get_functiondef(oid) as 原文
  from pg_proc
 where proname = 'can_edit_quote_record'
   and pronamespace = 'public'::regnamespace;

-- ── 順手睇埋 `quote_photos` 而家有咩欄（⭐ 應該**冇** `purged_at`）──
select column_name as 欄名, data_type as 型, is_nullable as 可空
  from information_schema.columns
 where table_schema = 'public' and table_name = 'quote_photos'
 order by ordinal_position;


-- ══════════════════════════════════════════════════════════════════
-- 第 1 段：加個欄
--
-- ⚠️ 答咗第 0 段條問題先跑。
-- ══════════════════════════════════════════════════════════════════
--
-- ⛔ **只加一個欄，⛔ 冇 default、⛔ 冇 not null、⛔ 冇 trigger。**
--
-- ⭐ `null` ＝ **未清完**，有值 ＝ 雲端兩份都處理完。
--   ⚠️ 呢個「null 就係一個狀態」係特登嘅（計劃書 §3.1）：
--   一行「`deleted_at` 有值、`purged_at` 冇值」嘅相，**就係「清到一半」呢件事本身**
--   ⇒ ⛔ 唔使另開一張表、⛔ 唔使另外記帳。
--
-- ⛔ **⛔ 唔准加 `default now()`** —— 加咗嘅話**所有現有嘅相即刻變咗「已清走」**,
--    而佢哋啲 bytes 其實仲喺 R2 同 Drive，⇒ 永遠冇人會再去清。

alter table public.quote_photos
  add column if not exists purged_at timestamptz;

-- ⛔ **⛔ 唔加 index。**
--    ⭐ 呢個⛔ 唔係漏咗：「刪咗一半」嗰個數要 join `quote_records`，
--    而兩張表而家都係幾百行級數。⚠️ 加一個估出嚟嘅 index 係「睇落做咗嘢」,
--    但佢會令每一次寫相都慢少少，而且冇人會返嚟量佢有冇用。
--    ⇒ 等真係慢咗、量到，先加。

-- ⛔ **⛔ 唔使加 GRANT。**
--    `grant update on public.quote_photos to authenticated` 係**成張表**嘅，
--    ⭐ 新加嘅欄自動包埋。第 2 段會驗返呢句係咪真。


-- ══════════════════════════════════════════════════════════════════
-- 第 2 段：⛔ 跑完即刻驗（只讀）—— ⭐「冇報錯」⛔ 唔等於「加到咗」
-- ══════════════════════════════════════════════════════════════════

-- ① 個欄喺唔喺度（⭐ 預期：1 行，`timestamptz`，可空 YES，⛔ 冇 default）
select column_name as 欄名, data_type as 型, is_nullable as 可空,
       column_default as 有冇default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'quote_photos'
   and column_name = 'purged_at';

-- ② ⛔⛔ 現有嘅相⛔ 唔准俾人當成「已清走」
--    ⭐ 預期：`已清走 = 0`。⚠️ 唔係 0 就係第 1 段寫錯咗 default，⛔ 即刻話我知。
select count(*) as 總相數,
       count(*) filter (where purged_at is not null) as 已清走,
       count(*) filter (where purged_at is null)     as 未清走
  from public.quote_photos;

-- ③ GRANT ⛔ 冇變（⭐ 預期：`authenticated` 有 SELECT／INSERT／UPDATE，
--    ⛔ 冇 DELETE、⛔ 冇 anon、⛔ 冇 service_role）
--    ⚠️ 隔走 `postgres`（owner 有齊係正常）——
--    ⛔ 淨係數總數分唔出「owner 有」同「authenticated 有」（2026-08-22 中過）。
select grantee as 邊個, string_agg(privilege_type, ', ' order by privilege_type) as 有咩權
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'quote_photos'
   and grantee not in ('postgres')
 group by grantee
 order by grantee;

-- ④ policy ⛔ 冇變（⭐ 預期三條，⛔ 一條 DELETE 都冇）
select policyname as 名, cmd as 乜動作
  from pg_policies
 where schemaname = 'public' and tablename = 'quote_photos'
 order by policyname;


-- ══════════════════════════════════════════════════════════════════
-- ⛔ 三樣我要寫低
-- ══════════════════════════════════════════════════════════════════
--
-- ⚠️ 一 · **加完呢個欄，⛔ 仲未清到任何相。**
--    `/purge` 要**你喺 Terminal 跑 `npx wrangler deploy`** 先生效
--    （Worker ⛔ 唔經 GitHub，`docs/雲端做嘢-規矩.md` §四）。
--    ⇒ 次序：**呢份 SQL → `wrangler deploy` → 同日改
--      `PHOTOS_REALLY_PURGED = true`**。⛔ 唔准拖過夜。
--
-- ⚠️ 二 · **`PHOTOS_REALLY_PURGED` 而家仲係 `false`**
--    （`src/lib/deleteDialog.ts:48`）。即係話彈窗而家講嘅係「刪除工程？」，
--    ⛔ 唔係「永久刪除？」。⭐ 咁樣係啱嘅 —— **而家真係未清相**。
--    ⛔ 唔准早過 Worker deploy 就改佢：改咗就變成「畫面講永久刪除，
--       但實物一件都冇清」，⚠️ 而嗰個係最衰嗰種假話。
--
-- ⚠️ 三 · **第一次真清，一定要喺一單假工程上面做**（永久例外）。
--    ⛔ 唔准攞真工程試。清完之後兩邊對數：
--      · R2 —— 嗰幾條 key 攞唔到（404）
--      · Drive —— 嗰幾個檔喺垃圾桶
--      · DB —— 嗰幾行 `purged_at` 有值，而**行本身仲喺度**
--
--
-- ── ⛔ 出事想返轉頭 ────────────────────────────────────────────────
--
-- ⛔⛔ **⛔ 唔准 `drop column`** —— 一 drop 就冇咗「邊幾張已經清走」呢個紀錄,
--    而啲 bytes 已經冇咗，⇒ 之後永遠分唔清邊張係清咗、邊張係未清。
--    ⇒ 真係要停，就唔好 deploy 個 Worker（冇人叫 `/purge` 就冇人寫呢個欄）。
