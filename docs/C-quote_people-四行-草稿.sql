-- ══════════════════════════════════════════════════════════════════
-- C：`quote_people` 入五行人名（阿耀／聰／Isaac／Anna／Jason）
--
-- ⭐ 2026-10-04 加咗 **Jason** 一行（Jason 睇完原型 PR #83 拍板「補返 Jason 一行」）。
--    ⚠️ 本來淨係四個人 ⇒ Jason 開嘅單卡上冇名、搜尋揀唔到佢。
--    ⛔ 檔名照留「四行」—— 改檔名會令 PR #66 嘅舊連結失效；內容以呢度為準。
--
-- ⛔⛔ **草稿。Jason 親手跑。⛔ AI 唔准代跑，亦唔准分段偷步**（CLAUDE.md §3）。
--
-- ⚠️⚠️ **跑之前一定要讀第 0 段**（「跑咗之後會點」）同第 1 段（「要你填」）。
--    第 0 段⛔ 唔係客套說話 —— 佢講嘅係：**跑咗呢份嘢之後，
--    畫面上⛔ 乜都唔會變**，而點解仲要跑。
--
-- ⭐⭐ 跑幾多次都得（idempotent）。跑到一半死咗、或者唔記得跑咗未，
--    ⛔ 唔使查，直接**由頭再跑一次**就會收斂到正確狀態。
--
-- ⭐ 呢份嘢**淨係入資料**：⛔ 冇 `create`、⛔ 冇 `alter`、⛔ 冇 `drop`、
--   ⛔ 冇 trigger、⛔ 冇改任何 policy 或者 GRANT（CLAUDE.md §3 嗰條線）。
--   張表本身喺 `docs/P7-客戶簿-人名.sql` 第 2 段，⭐ 假設你已經跑咗。
--   ⚠️ 未跑過嘅話，第 2 段會報 `42P01 relation … does not exist` ——
--      咁就係先去跑 P7，⛔ 唔係喺呢度補一句 `create table`。
--
-- 背景：Jason 2026-09-19 拍板 **「先用 `quote_people`」**
--   ⇒ `docs/C-shared_people-草稿.sql`（另開一張 `shared_people`）**擺低咗**，
--     ⛔ 唔跑。嗰份稿頂已經標返。
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 第 0 段：⛔⛔ 跑咗之後會點 —— ⚠️ 讀完先跑
-- ══════════════════════════════════════════════════════════════════
--
-- ⛔⛔ **跑完，app 畫面上⛔ 一個字都唔會變。**
--
-- 我 2026-09-20 grep 過成個 `src/`：**冇一句 code 讀 `quote_people`。**
--   · `created_by`（邊個開呢單）由第一日就存住 —— `quote_records`、`quote_trees`、
--     `quote_photos`、`quote_clients` 四張表都有。
--   · ⛔ 但「UUID → 人名」呢個對照，**畫面由頭到尾冇攞過**。
--
-- ⇒ 即係話呢份 SQL 係**兩步入面嘅第一步**：
--     步 1（呢份）——  張表入面有人
--     步 2（未做）——  畫面讀返出嚟（工程卡出「建立人：阿耀」、搜尋面板出下拉）
--
-- ⭐⭐ 點解仲要而家跑：因為**倒轉嗰個次序會靜靜咁出事**。
--    `quote_admins` 就係咁 —— 張表建咗、policy 齊、`is_quote_admin()` 行得，
--    ⚠️ 但**入面一個人都冇**，於是「淨係辦公室改得」實際上係「冇人改得」，
--    而咁樣**唔會報錯**，空咗成個月都冇人發現
--    （`docs/開發紀錄.md` 附錄 B「建咗張權限表 ≠ 入面有人」）。
--
-- ⇒ 所以：**先入人，之後寫畫面。** ⛔ 唔好等寫完畫面先發現張表係空。


-- ══════════════════════════════════════════════════════════════════
-- 第 1 段：⛔ 要你填 —— ⭐ 我⛔ 唔知佢哋嘅 email，亦⛔ 唔准估
-- ══════════════════════════════════════════════════════════════════
--
-- `quote_people.user_id` 係 `references auth.users (id)` ⇒ **一定要真 UUID**。
-- ⛔ 我攞唔到（我掂唔到你個 DB），⛔ 亦唔准作一個出嚟 —— 作咗就會撞 FK，
--    或者更衰：撞啱另一個真人。
--
-- ⇒ 所以下面用 **email 去 `auth.users` 對返個 UUID**，⛔ 唔手打 UUID。
--
-- ── ① 先跑呢句（只讀），睇下邊幾個真係開咗帳號 ──────────────────────

select id, email, created_at, last_sign_in_at
  from auth.users
 order by created_at;

-- ⚠️ 睇完先做下面。⭐ 特別留意：
--    · **未開帳號嘅人喺呢張表度⛔ 唔會出現** —— 佢就入唔到 `quote_people`。
--      （Anna 最有機會係呢個情況。）
--    · 有人用咗第二個 email 開帳號嘅話，要用**佢真係嗰個**，⛔ 唔係你以為嗰個。
--
-- ── ② 把下面五行嘅 email 改成真嘅 ───────────────────────────────────
--
-- ⛔⛔ 下面五個 email 係**位置佔住先**，⛔ 唔係真資料，⛔ 唔准照跑。
--    ⭐ 個顯示名照你想喺工程卡上面見到嗰個寫（「阿耀」就寫「阿耀」）。
--    ⚠️ 未開帳號嗰個**照留喺度** —— 第 3 段會逐個報返「揾唔到」，
--       ⛔ 好過你靜靜咁刪咗一行然後唔記得。


-- ══════════════════════════════════════════════════════════════════
-- 第 2 段：入資料
--
-- ⭐ 你喺 Supabase SQL editor 係 `postgres`（張表個 owner）⇒ **繞過 RLS**，
--   所以 `quote_people_write`（要 `is_quote_admin()`）⛔ 唔會擋你。
--   ⚠️ 即係話呢份嘢**淨係你跑得**，app 入面嘅人跑唔到 —— 咁樣先啱。
-- ══════════════════════════════════════════════════════════════════

with 要入嘅人 (email, display_name) as (
  values
    ('阿耀嘅email@example.com',  '阿耀'),   -- ⛔ 改我
    ('聰嘅email@example.com',    '聰'),     -- ⛔ 改我
    ('isaac嘅email@example.com', 'Isaac'),  -- ⛔ 改我
    ('anna嘅email@example.com',  'Anna'),   -- ⛔ 改我
    ('jason嘅email@example.com', 'Jason')   -- ⛔ 改我（2026-10-04 加）
)
insert into public.quote_people (user_id, display_name)
select u.id, p.display_name
  from 要入嘅人 p
  join auth.users u
    -- ⚠️ `lower(btrim(...))` 兩邊都要：email 唔分大細楷，
    --    而人手貼過嚟最常見嘅垃圾就係頭尾多咗個空格。
    on lower(btrim(u.email)) = lower(btrim(p.email))
-- ⭐ 已經有嗰個就更新個名，⛔ 唔會撞 primary key ⇒ 跑幾多次都得。
on conflict (user_id) do update
   set display_name = excluded.display_name,
       updated_at   = now();

-- ⚠️ 撞到 `21000 ON CONFLICT DO UPDATE command cannot affect row a second time`？
--    ⇒ 即係上面五行入面**有兩行寫咗同一個 email**（貼漏咗改）。
--    ⭐ 呢個錯係**好事** —— 佢擋住咗「兩個人共用一個帳號」嗰種靜靜咁錯。
--    改返個 email，再跑一次就得。


-- ══════════════════════════════════════════════════════════════════
-- 第 3 段：⛔⛔ 跑完即刻驗 —— ⭐「冇報錯」⛔ 唔等於「入到咗」
--
-- ⚠️ 第 2 段嗰句**一行都入唔到都⛔ 唔會報錯** —— `join` 對唔到就係 0 行，
--    而 0 行喺 SQL 度係一個**正常結果**，⛔ 唔係一個錯誤。
--    ⭐ 呢個同 CLAUDE.md §2.6 講 RLS 嗰句一模一樣：
--      「RLS 唔會 throw，佢只係令 0 行受影響 —— 所以『冇報錯』唔等於『做咗嘢』。」
-- ══════════════════════════════════════════════════════════════════

-- ── ① 逐個報：邊個入到、邊個揾唔到帳號 ───────────────────────────────
--
-- ⛔⛔ 呢句係成份嘢最重要嗰句。⚠️ 五行入面**每一行都要出一句**，
--    而且要出得明明白白 ——「揾唔到」⛔ 唔准靠「總數少咗一個」去估。
--
-- ⚠️ 記得把 email 改成同第 2 段**一模一樣**嗰五個。

with 要入嘅人 (email, display_name) as (
  values
    ('阿耀嘅email@example.com',  '阿耀'),   -- ⛔ 改我（同上面一樣）
    ('聰嘅email@example.com',    '聰'),     -- ⛔ 改我
    ('isaac嘅email@example.com', 'Isaac'),  -- ⛔ 改我
    ('anna嘅email@example.com',  'Anna'),   -- ⛔ 改我
    ('jason嘅email@example.com', 'Jason')   -- ⛔ 改我（2026-10-04 加）
)
select
  p.display_name                                   as 想入嘅名,
  p.email                                          as 用咗邊個email,
  u.id                                             as 對到嘅帳號,
  qp.display_name                                  as 表入面而家係,
  case
    when u.id is null      then '⛔ 揾唔到帳號 —— 呢個人未開過帳號，或者 email 打錯咗'
    when qp.user_id is null then '⛔⛔ 對到帳號但入唔到 —— 唔應該發生，請截圖'
    when qp.display_name = p.display_name then '✓ 入咗'
    else '⚠️ 入咗但個名唔同，請睇清楚'
  end                                              as 結果
  from 要入嘅人 p
  left join auth.users u
    on lower(btrim(u.email)) = lower(btrim(p.email))
  left join public.quote_people qp on qp.user_id = u.id
 order by p.display_name;

-- ── ② 張表而家總共有幾多人（⭐ 預期：5，⚠️ 除非有人未開帳號）────────
select count(*) as 總人數,
       string_agg(display_name, '、' order by display_name) as 逐個
  from public.quote_people;

-- ── ③ policy：⭐ 預期**兩條** —— 一條 SELECT、一條 ALL，⛔ 冇 DELETE ────
select count(*) as policy_條數,
       string_agg(policyname || '=' || cmd, ', ' order by policyname) as 逐條
  from pg_policies
 where schemaname = 'public' and tablename = 'quote_people';

-- ── ④ GRANT：⭐ 預期**啱啱好三行** —— `authenticated` 嘅
--    SELECT／INSERT／UPDATE，⛔ 冇 DELETE、⛔ 冇 anon、⛔ 冇 service_role
--
-- ⚠️ `postgres` 係 owner，佢有齊所有嘢係正常嘅 ⇒ 隔走佢。
--    ⛔ 淨係數總數分唔出「owner 有」同「authenticated 有」（2026-08-22 中過）。
select count(*) as grant_行數,
       string_agg(grantee || '=' || privilege_type, ', ' order by grantee, privilege_type) as 逐行
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'quote_people'
   and grantee not in ('postgres');

-- ⚠️ ④ 如果見到 `service_role=...`：⛔ 唔好當冇事，跑埋呢句收返佢
--    （CLAUDE.md §2.9 —— Supabase 會喺新表自動派，收權限係**常設規矩**）：
--
--   revoke all on public.quote_people from service_role;
--   revoke all on public.quote_people from anon;


-- ══════════════════════════════════════════════════════════════════
-- ⛔ 兩樣我要寫低，⛔ 唔准當佢哋唔存在
-- ══════════════════════════════════════════════════════════════════
--
-- ⚠️ 一 · **未開帳號嗰個入唔到，而且冇辦法繞過。**
--    `quote_people.user_id` 有 FK 去 `auth.users` ⇒ 冇帳號就冇 UUID ⇒ 冇得入。
--    ⛔ 我⛔ 唔會建議拆走條 FK 去遷就 —— 拆咗就變咗「一張可以塞任何 UUID 入去嘅表」，
--       而嗰啲塞錯嘅 UUID ⛔ 冇任何嘢會捉到。
--    ⇒ 佢要先開帳號（登入一次），之後**由頭再跑一次呢份嘢**（跑幾多次都得）。
--
-- ⚠️ 二 · **改一個名 ＝ 改寫歷史。**
--    畫面（將來）會用呢張表去譯所有舊工程嘅 `created_by`
--    ⇒ 改咗「阿耀」做第二個名，**所有佢以前開嘅單即刻跟住變**。
--    ⭐ 呢個同客戶簿相反：客戶簿改咗只影響將來揀嗰陣（因為冇 FK，係複製一份）。
--    ⇒ 所以 `quote_people` 嘅 write policy 特登收窄到 `is_quote_admin()`。
--
--
-- ── ⛔ 出事想剷走某一行（⚠️ 而張表冇 DELETE policy，係特登嘅）────────
--
-- ⛔⛔ **⛔ 唔准 `delete from public.quote_people`**。
--    張表特登冇 DELETE policy、亦冇 grant DELETE —— 人走咗都唔准刪，
--    刪咗佢開嘅舊工程就會**冇返個名**。
--    ⇒ 打錯字就 `update` 個 `display_name`，⛔ 唔係刪咗再入。
--
--   update public.quote_people
--      set display_name = '正確嘅名', updated_at = now()
--    where user_id = '……';
