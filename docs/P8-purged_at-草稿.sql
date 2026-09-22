-- ══════════════════════════════════════════════════════════════════
-- P8 步 3：`quote_photos` 加 `purged_at` ＋ 一個**只寫得低佢**嘅 function
--
-- ⛔⛔ **草稿。Jason 親手跑。⛔ AI 唔准代跑，亦唔准分段偷步**（CLAUDE.md §3）。
--
-- ⚠️⚠️ **第 0 段有一條問題，答咗先好跑第 1 段。**
--    ⛔ 佢唔係細節 —— 答錯嗰邊，成條 `/purge` 由頭到尾一張相都清唔到。
--
-- ⛔⛔⛔ **一次跑一段。⛔ 唔准成份貼落去。**
--
--   Supabase SQL editor 一次跑幾句，**淨係 show 最後嗰句嘅結果** ——
--   前面嗰啲你**睇唔到**。⚠️ 而呢份嘢有十幾句，仲要 read-only 同 DDL 撈埋。
--
--   ⚠️ **2026-09-20 真係咁中過一次**：CO 一次過俾兩句 SQL Jason，
--   佢跑完只見到第二句嘅結果，答「唔知你講咩」，要重新問過。
--
--   ⇒ **逐段跑，每段跑完對返嗰段寫住嘅「⇒ 預期見到乜」。**
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
-- ⭐⭐ Jason 2026-09-20 批咗乜 —— ⛔ 逐字記住，⛔ 唔准放大
-- ══════════════════════════════════════════════════════════════════
--
-- CO 問咗三次先問到一個清楚嘅答案（頭兩次係「咁嚟」同「唔明你講咩」，
-- ⛔ 兩次都冇當佢批咗）。第三次用人話重寫，⛔ **冇用過「SECURITY DEFINER」呢個詞**，
-- 講嘅係：
--
--   > **「一道好窄嘅後門，得一個用途：喺張相度打個『清咗』嘅剔，⛔ 刪唔到任何嘢。」**
--
-- 佢答：**「批」**。
--
-- ⇒ ⛔⛔ **佢批嘅係「一個只寫得低 `purged_at`、刪唔到任何嘢嘅 function」**，
--   ⛔ **唔係**「一個 `SECURITY DEFINER` 隨便點寫都得」。
-- ⚠️⚠️ **將來有人想加第二個 `SECURITY DEFINER`，⛔ 唔准攞今次當先例。**
--
-- ⭐ 另外 Jason 2026-09-20 一併批咗：**⛔ 唔睇 `locked`**（見第 2 段）。
--
--
-- ══════════════════════════════════════════════════════════════════
-- 第 0 段：⛔⛔ 只讀
-- ══════════════════════════════════════════════════════════════════
--
-- ── ⓪ ✅ 已經答咗：`can_edit_quote_record()` 入面有冇 `deleted_at is null`？──
--
-- **有，而且喺 OR 括號外面 ⇒ 連 `is_quote_admin()` 都繞唔到。**
-- Jason 2026-09-20 跑咗，原文喺 `docs/P8-purge-權限-選項表.md` §0。
-- ⇒ 即係話 `quote_photos` 條現有 update policy **對一單已刪工程永遠 false**
--   ⇒ ⛔ 直接 `update purged_at` **一定 0 行，而且⛔ 唔會報錯**。
-- ⇒ 所以要第 2 段嗰個 function。**下面呢句留返做記錄，⛔ 唔使再跑。**
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

-- ⇒ **預期見到**：一行全文，入面有 `r.deleted_at is null`。
--   ⭐ 2026-09-20 已經跑過，⛔ 唔使再跑 —— 留返做記錄。

-- ── ① ⛔ CO 2026-09-20 明文要求：呢句⛔ 唔准刪 ──────────────────────
--
-- **而家 `quote_photos` 上面到底有冇 column-level grant？**
--
-- ⚠️⚠️ 要講清楚一樣，⛔ 唔好記錯個理由：
--   CO 當時寫嘅理由係「如果已經有 column grant 而 `purged_at` 唔喺入面，
--   `update` 會撞 `42501`」。⛔ **呢個理由對做法 ④ 嚟講唔成立** ——
--   第 2 段條 function 係 `SECURITY DEFINER`，入面個 `update` 行**owner** 嘅權限,
--   ⇒ `authenticated` 有冇 column grant ⛔ 撞唔到佢。
--
-- ⭐ **但呢句照擺，⛔ 唔准拆走**，兩個真理由：
--   1. 「而家到底有冇人收窄過」呢件事**本身要知** —— ⛔ 冇人查過。
--   2. 邊日改用做法 ①（見選項表），呢個數即刻用得着。
--
-- ⭐ 預期：**一行都冇**（即係得 table-wide grant，冇人收窄過）。
--   ⚠️ 有行嘅話⛔ 唔好當冇事，貼返俾我。

select grantee as 邊個, column_name as 邊個欄, privilege_type as 咩權
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'quote_photos'
   and grantee not in ('postgres')
 order by grantee, column_name;

-- ── ② 順手睇埋 `quote_photos` 而家有咩欄（⭐ 應該**冇** `purged_at`）──
select column_name as 欄名, data_type as 型, is_nullable as 可空
  from information_schema.columns
 where table_schema = 'public' and table_name = 'quote_photos'
 order by ordinal_position;

-- ⇒ **預期見到**：十幾行，⛔ **入面冇 `purged_at`**。
--   ⚠️ 已經有 `purged_at` ⇒ 第 1 段已經跑過，⛔ 唔使再跑（跑咗都冇事）。


-- ── ③ ⛔⛔ `is_quote_admin()` 原文 —— ⛔ 讀咗先好跑第 2 段 ──────────
--
-- 第 2 段條 function 入面會叫 `public.is_quote_admin()`，
-- ⛔ **但由頭到尾冇人讀過佢原文。**
--
-- ⚠️⚠️ 今朝就係因為同一件事撞過一次：我哋**假設**
-- `can_edit_quote_record()` 唔會睇 `deleted_at` ⇒ ⛔ 錯，
-- 而且錯法係「**靜靜咁 0 行**」。⛔ 同一個假設⛔ 唔准做第二次。
--
-- ⇒ 要睇嘅三樣：
--   1. 佢自己有冇 `deleted_at` 之類嘅條件？
--   2. 佢會唔會撞返 RLS（即係佢讀嘅表自己有冇 policy 攔住佢）？
--   3. 佢係咪都係 `SECURITY DEFINER`？
--
-- ⇒ 貼返俾我睇。⛔ 讀咗先算。

select pg_get_functiondef(oid) as 原文
  from pg_proc
 where proname = 'is_quote_admin'
   and pronamespace = 'public'::regnamespace;

-- ✅ **2026-09-22 Jason 跑咗，三條全部過到**（原文逐字）：
--
--   CREATE OR REPLACE FUNCTION public.is_quote_admin()
--    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--     select exists (select 1 from public.quote_admins where user_id = auth.uid());
--   $function$
--
--   1. ⛔ 冇 `deleted_at` 之類嘅條件 ✅
--   2. `SECURITY DEFINER` 讀 `quote_admins` ⇒ ⛔ 唔會撞返 RLS ✅
--   3. 係 `SECURITY DEFINER` ✅
--
-- ⇒ **第 2 段條 function 可以照跑。呢條版咗。**


-- ── ⛔⛔ 一個陷阱：**⛔ 唔准用 `select is_quote_admin();` 去驗「我係唔係 admin」** ──
--
-- ⚠️⚠️ 喺 **Supabase SQL editor** 度跑 `select public.is_quote_admin();`
--    **一定回 `false`，就算你真係 admin。**
--
-- ⭐ 點解：editor 用緊 `postgres` 身分 ⇒ `auth.uid()` 回 **NULL**
--   ⇒ `select 1 from quote_admins where user_id = NULL` ⇒ **永遠 0 行**
--   （SQL 入面 `NULL = 任何嘢` 既唔係 true 又唔係 false，總之⛔ 唔會配到）。
--
-- ⭐ 本機實測（2026-09-22，一個掉得嘅 PostgreSQL 16 cluster，
--   條 function 逐字照 Jason 貼返嚟嗰個原文，張表入面特登放咗 2 個人）：
--
--     ⓵ auth.uid() 回 NULL（＝ SQL editor 嗰個情況）
--        auth_uid | 我係咪admin | 張表入面有幾多人
--       ----------+-------------+------------------
--                 | f           |                2      ← ⛔ 張表有人，一樣回 f
--
--     ⓶ 扮成 Jason 登住入（auth.uid() 有值）
--        我係咪admin
--       -------------
--        t
--
--     ⓷ 點解
--        NULL = 某個值 | NULL is null
--       ---------------+--------------
--                      | t                             ← ⛔ 空白，即係「唔知」
--
-- ⛔⛔ **呢個係一個「答案跌落好確定、但佢答緊另一條問題」嘅形狀** ——
--    同 `docs/開發紀錄.md` 附錄 B **D9** 嗰條界線
--    （本機量到嘅係語意、⛔ 唔係佢哋個 DB 嘅狀態）同一個家族。
--
-- ⇒ ⭐ **要驗「邊個係 admin」，直接讀張表**（順手 join 返個電郵）：
--
--     select a.user_id, u.email
--       from public.quote_admins a
--       join auth.users u on u.id = a.user_id
--      order by u.email;
--
--   ⛔ **個電郵⛔ 唔准貼入 repo。**


-- ── ③-2 ⚠️⚠️ 但佢帶出一條新嘢：**`quote_admins` 入面有冇人** ──────
--
-- ⭐ `is_quote_admin()` 嘅意思就係「`auth.uid()` 喺唔喺 `quote_admins` 入面」。
--
-- ⚠️⚠️ **而呢個 repo 已經中過一次**：`docs/開發紀錄.md` 附錄 B
--    **「建咗張權限表 ≠ 入面有人」**（PR #18）—— `quote_admins` 靜咗一個月，
--    張表建咗、policy 齊、條 function 行得，⛔ **但入面一個人都冇**。
--
-- ⇒ **對 `/purge` 嘅實際影響**（閘二係 `v_mine or public.is_quote_admin()`）：
--
--   ⭐ **張表空 ⇒ 右邊嗰半永遠 false ⇒ 閘二退化成淨係 `v_mine`**
--     —— 即係**淨係開單嗰個人清得到**。
--
--   · Jason 自己開嘅單 ⇒ ✅ 冇事。
--   · ⚠️ **阿耀／聰開嗰單，Jason 刪咗之後想清相 ⇒ 會收到 `not_yours`。**
--
-- ⛔⛔ **呢個⛔ 唔係一個 bug** —— 條 function 照佢寫嘅做。
--    ⭐ **但人要知**，否則會變成「點解我 admin 都清唔到」，
--    而畫面上**⛔ 冇任何線索**話俾佢聽係 `quote_admins` 空咗。
--
-- ⇒ 跑呢句只讀（⭐ 一句就答到）：

select count(*) as 幾個管理員 from public.quote_admins;

-- ⇒ **預期見到**：一個數。
--
-- ✅ **2026-09-22 Jason 跑咗：`2` —— Jason 同 Anna**
--    （佢自己 `join auth.users` 核對過邊兩個人；⛔ 電郵唔入 repo）。
--
-- ⇒ **閘二對 Jason 過到** —— 佢刪任何人開嘅單都清得到相。
--   ⭐ **P8 呢條路⛔ 冇咗 blocker。**
--
-- ⚠️⚠️ **但現場兩個人⛔ 唔係 admin：阿耀、阿聰。**
--    而**阿耀係主力開單嗰個**（報價、見客），**阿聰主力做工程**
--    ⇒ **阿聰去清一單阿耀開嘅工程，就會收到 `not_yours`。**
--    ⛔ 呢個⛔ 唔係理論情況，係現場真係會發生嘅事。
--
-- ⇒ 所以 `worker/src/worker.mjs` 嗰句 `not_yours` 已經改到**指名**：
--   「請找建立這一單的同事幫手，或者找管理員（Jason 或 Anna）代勞。」
--
-- ⛔⛔ **⇒ 改 `quote_admins`（加人／減人）嗰陣，⛔ 要返嚟改埋嗰一行。**
--    ⚠️ ⛔ 冇尺守得住呢樣 —— 一個 Worker 嘅字串⛔ 對唔到 DB 一張表。

-- ⇒ **預期見到**：一行，`create or replace function public.is_quote_admin() …` 嘅全文。
--   ⚠️ 零行 ＝ 條 function 唔存在 ⇒ ⛔ 即刻停，話我知（第 2 段會撞 `42883`）。


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

-- ⇒ **預期見到**：`ALTER TABLE`（跑第二次一樣，`if not exists` 擋住咗）。

-- ⛔ **⛔ 唔加 index。**
--    ⭐ 呢個⛔ 唔係漏咗：「刪咗一半」嗰個數要 join `quote_records`，
--    而兩張表而家都係幾百行級數。⚠️ 加一個估出嚟嘅 index 係「睇落做咗嘢」,
--    但佢會令每一次寫相都慢少少，而且冇人會返嚟量佢有冇用。
--    ⇒ 等真係慢咗、量到，先加。

-- ⛔ **⛔ 唔使加 GRANT。**
--    `grant update on public.quote_photos to authenticated` 係**成張表**嘅，
--    ⭐ 新加嘅欄自動包埋。第 2 段會驗返呢句係咪真。


-- ══════════════════════════════════════════════════════════════════
-- 第 2 段：一個**只寫得低 `purged_at`** 嘅 function
--
-- ⛔⛔ 呢個就係 Jason 批嗰道「好窄嘅後門」。⚠️ 跑之前讀清楚下面四段。
-- ══════════════════════════════════════════════════════════════════
--
-- ⛔⛔ **點解一定要一個 function，⛔ 唔係一條新 policy**
--
--   PostgreSQL 嘅 RLS policy 係**行**嘅條件（`USING` / `WITH CHECK`），
--   ⛔ **管唔到「邊個欄」**。⇒「一條淨係俾改 `purged_at` 嘅 UPDATE policy」
--   呢樣嘢**根本唔存在**。
--   ⇒ 想真係鎖死「淨係呢一個欄」，唯一嘅方法就係**寫死喺 function 入面**。
--
-- ⛔⛔ **佢刪唔到任何嘢 —— 呢個係 Jason 批嗰句嘅核心**
--
--   入面得一句 `update ... set purged_at = now()`。
--   ⛔ 冇 `delete`、⛔ 冇 `drop`、⛔ 改唔到第二個欄、⛔ 掂唔到第二張表。
--   ⚠️⚠️ **將來有人想加第二個 `SECURITY DEFINER`，⛔ 唔准攞今次當先例。**
--
-- ⭐⭐ **⛔ 唔睇 `locked` —— Jason 2026-09-20 明文批**
--
--   現有嗰條 `can_edit_quote_record()` 有 `r.locked = false`。
--   ⛔ 呢度**特登冇**。理由（Jason 收咗）：
--   **一單已經刪咗嘅工程，`locked` 冇意思** —— 鎖係為咗擋「唔好再改呢單嘢」，
--   而佢已經俾人刪咗，冇嘢好再改。
--   ⛔ 呢個⛔ 唔係一個實作細節、⛔ 唔係我順手拆 —— 係一個拍咗板嘅決定。
--
-- ⛔⛔ **回四個值，⛔ 唔准合埋（CO 2026-09-20 明文要求）**
--
--   `not_found` ⛔ **唔准當成「拒絕」嘅一種** ——
--   佢係一個**⛔ 唔應該發生**嘅情況（Worker 啱啱先由 DB 讀返嗰個 id 出嚟）。
--   ⚠️ 合埋咗就變成「拒絕」，而之後**冇人會再問點解**。

create or replace function public.quote_purge_stamp(
  p_photo_id uuid,
  p_dry_run  boolean
)
  returns text
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_record_deleted boolean;
  v_mine           boolean;
begin
  -- ⛔ 一次讀晒，⛔ 唔分兩句 —— 分開就會有兩個「揾唔到」嘅出口。
  select (r.deleted_at is not null),
         (r.created_by = auth.uid())
    into v_record_deleted, v_mine
    from public.quote_photos p
    join public.quote_records r on r.id = p.record_id
   where p.id = p_photo_id;

  -- ⛔⛔ 一個⛔ 唔應該發生嘅情況。⛔ 唔准同「拒絕」合埋。
  if not found then
    return 'not_found';
  end if;

  -- 閘一：母單一定要真係刪咗。⛔ admin 都繞唔到 —— 呢道閘擋嘅唔係「邊個」，
  --       係「呢單嘢仲用緊」。
  if not v_record_deleted then
    return 'record_not_deleted';
  end if;

  -- 閘二：開單嗰個，或者 admin。⛔ 冇 `locked`（見上面）。
  if not (v_mine or public.is_quote_admin()) then
    return 'not_yours';
  end if;

  -- ⭐ 試完先做：`p_dry_run` 行到呢度就代表「你做得」，而⛔ 一個字都冇寫。
  --   ⛔ 呢個⛔ 唔係第二套判斷 —— 上面同一段 code，同一個出口。
  if p_dry_run then
    return 'ok';
  end if;

  -- ⛔ 淨係呢一個欄。⛔ 唔准加第二個。
  -- ⭐ 已經有值就⛔ 唔覆蓋 —— 保住「第一次清走係幾時」。
  --
  -- ⚠️⚠️ **連帶後果，⛔ 唔准當佢唔存在**：已經有值嗰陣，呢句 `update`
  --    影響 **0 行**，⛔ 但下面照樣回 `ok`。
  --    ⇒ **Worker 嗰邊⛔ 唔可以靠個回值去數「今次清咗幾多張」** ——
  --      `ok` 嘅意思係「而家呢張相係打咗剔嘅狀態」，
  --      ⛔ **唔係**「今次係我打嘅」。
  --    ⭐ 2026-09-21 本機實測：第二次 stamp 之後個 `purged_at` 一個字都冇變。
  update public.quote_photos
     set purged_at = now()
   where id = p_photo_id
     and purged_at is null;

  return 'ok';
end
$function$;

-- ⛔ `authenticated` 行得。⛔ 唔 grant 俾 `anon`、⛔ 唔 grant 俾 `service_role`。
-- ══════════════════════════════════════════════════════════════════
-- ⭐⭐ 呢條 function 實測過 —— ⛔ 唔係讀 code 讀出嚟
--
-- 2026-09-21，喺一個**本機掉得嘅 PostgreSQL 16.13** cluster 上面行過。
--   ⛔ 唔係 Jason 個 Supabase、⛔ 冇任何真資料、用完即刻剷咗。
--   ⭐ 條 function 係**由呢份草稿原文抽出嚟**（1476 bytes），⛔ 冇手抄。
--   `auth.uid()` 同 `is_quote_admin()` 用咗可以撥嘅 stub 頂替。
--
-- ⚠️⚠️ **量到嘅係「Postgres 係點運作」，⛔ 唔係「Jason 個 DB 而家係點」。**
--   `is_quote_admin()` 入面真係寫住乜、啲 policy、邊個 role 有咩 grant ——
--   全部係**佢哋嗰邊嘅事實**，⛔ 本機量唔到。（見第 0 段 ③。）
--
-- ── 實測輸出（⛔ 逐字貼返，⛔ 未經加工）──────────────────────────
--
--      情況     |      dry_run
--   --------------+--------------------
--    刪咗＋我開   | ok
--    未刪         | record_not_deleted
--    刪咗＋人哋開 | not_yours
--    揾唔到張相   | not_found
--   (4 rows)
--
--    相行數 | 未打剔
--   --------+--------
--         3 |      3          ← ⭐ dry run 行完四次，⛔ 一個字都冇寫
--   (1 row)
--
--    真寫一次
--   ----------
--    ok
--   (1 row)
--
--    再寫一次
--   ----------
--    ok               ← ⚠️ 照樣 ok，但個 update 影響 0 行（見上面嗰段註解）
--   (1 row)
--
--    相仲有 | 單仲有
--   --------+--------
--         3 |      3
--   (1 row)
--
-- ⭐⭐ **最後嗰行就係 Jason 批嗰句嘅證據**：由頭到尾行晒四條路、
--    真寫兩次，**3 張相、3 單工程一行都冇少** ——
--    **「⛔ 刪唔到任何嘢」⛔ 唔係讀 code 讀出嚟，係量出嚟。**
--
-- ⚠️ 另外量過（同一個 cluster）：admin 過得到「刪咗＋人哋開」，
--    ⛔ **但一樣過唔到「未刪」** —— 閘一真係繞唔到。
-- ══════════════════════════════════════════════════════════════════

-- ⇒ 上面 `create` 嗰句**預期見到**：`CREATE FUNCTION`。
--   ⚠️ 撞 `42883 function auth.uid() does not exist` ⇒ ⛔ 停，話我知。

revoke all on function public.quote_purge_stamp(uuid, boolean) from public;
grant execute on function public.quote_purge_stamp(uuid, boolean) to authenticated;

-- ⇒ **預期見到**：`REVOKE` 一句、`GRANT` 一句。


-- ══════════════════════════════════════════════════════════════════
-- 第 3 段：⛔ 跑完即刻驗（只讀）—— ⭐「冇報錯」⛔ 唔等於「加到咗」
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
--    ⚠️ 第 2 段⛔ 冇加過任何 policy —— 加咗就係我寫錯，話我知。
select policyname as 名, cmd as 乜動作
  from pg_policies
 where schemaname = 'public' and tablename = 'quote_photos'
 order by policyname;

-- ⑤ 條新 function 喺唔喺度，而且係咪 `SECURITY DEFINER`
--    ⭐ 預期：一行，`security_definer = true`，`回乜 = text`
select p.proname as 名, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as 收咩,
       pg_get_function_result(p.oid) as 回乜
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname = 'quote_purge_stamp';

-- ⑥ ⛔⛔ 條 function 入面⛔ 唔准有 delete／drop／truncate
--
-- ⛔⛔ **⛔ 唔准寫成 `ilike '%delete%'`** —— ⚠️ 我第一版就係咁寫，而佢**一定誤報**：
--    條 function body 入面有 `r.deleted_at is not null` 同 `v_record_deleted`
--    ⇒ `'%delete%'` 配到 `deleted_at` ⇒ **永遠 true**。
--    ⭐ 而個指示係「true ＝ 即刻停手」⇒ **Jason 會停低一鑊唔使停嘅**；
--    ⚠️ 或者更衰：佢學識「呢個紅燈唔使理」，而真係有 `delete` 嗰日佢照樣唔理。
--
-- ⭐ 改用**字界**比對（`\m` ＝ 字頭、`\M` ＝ 字尾）。
--   ⛔ 呢個⛔ 唔係我估嘅 —— 2026-09-21 喺一個本機 PostgreSQL 16.13 上面實測過，
--   用條 function 嘅**逐字 body** 同一條真係有 `DELETE` 嘅 function 做對照：
--
--     邊條                ilike '%delete%'    ~* '\mdelete\M'
--     quote_purge_stamp          t                   f      ← ⭐ 分得開
--     （真係有 DELETE 嗰條）      t                   t
--
--   仲試過：大階 `DELETE FROM`、`delete` 同 `from` 中間換行、
--   `execute 'delete from …'`（動態 SQL）—— **三種都捉到**；
--   而 `'nothing deletes here'`（字係 `deletes`）⛔ 唔會誤報。
--
-- ⚠️⚠️ **佢有一個已知誤報**（一樣係實測）：**註解入面有個 `delete` 字，一樣會 true。**
--    ⇒ 所以下面個指示⛔ **唔係「true 就停手」**，係
--      **「true ⇒ 行埋 ⑥-2 用人眼睇一次」**。⛔ 一個字串比對⛔ 做唔到判決。

select
  (pg_get_functiondef(p.oid) ~* '\mdelete\M')   as 有冇delete,
  (pg_get_functiondef(p.oid) ~* '\mdrop\M')     as 有冇drop,
  (pg_get_functiondef(p.oid) ~* '\mtruncate\M') as 有冇truncate
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname = 'quote_purge_stamp';

-- ⇒ **預期見到**：三個都係 `f`。
--   ⚠️ 任何一個 `t` ⇒ ⛔ 唔好當佢一定有事，行埋下面 ⑥-2。

-- ⑥-2 ⭐ 印晒條 function 出嚟，**人眼睇一次**（⛔ 呢個先係判決）
--     ⇒ 預期見到：`update public.quote_photos set purged_at = now() …` **得呢一句寫入**，
--       ⛔ 冇 `delete from`、⛔ 冇 `drop`、⛔ 冇 `truncate`、⛔ 冇第二張表。
select pg_get_functiondef(p.oid) as 原文
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname = 'quote_purge_stamp';

-- ⑦ 邊個行得呢條 function（⭐ 預期：得 `authenticated`）
select grantee as 邊個, privilege_type as 咩權
  from information_schema.routine_privileges
 where routine_schema = 'public' and routine_name = 'quote_purge_stamp'
   and grantee not in ('postgres')
 order by grantee;


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
