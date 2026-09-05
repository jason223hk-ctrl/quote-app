-- ══════════════════════════════════════════════════════════════════
-- P7 補篇：填 `quote_people` 嘅人名（UUID → 人名對照）
--
-- ⛔⛔ Jason 親手跑。⛔ AI 唔准代跑。
-- ⚠️ 跑之前 `P7-客戶簿-人名.sql` 要跑咗（兩張表要存在）。
--
-- ⭐⭐ 跑幾多次都得（idempotent）：`on conflict do update`。
--    改錯名？改返個 VALUES 再跑多次就係。
--
-- ⚠️ 一共三段，⛔ 一段一段跑，⛔ 唔准一次過 highlight 晒。
--    （點解：`開發紀錄.md` §附錄B —— Supabase SQL editor 淨係跑你 highlight 咗嗰段，
--      「跑咗一半」喺呢個工具度係常態。）
-- ══════════════════════════════════════════════════════════════════


-- ── 第 1 段：睇下而家有邊啲人（⭐ 只讀，改唔到嘢）──────────────────
--
-- ⛔ 未睇過呢個結果之前，唔好填第 2 段。
-- ⚠️ 個 email 要**原文照抄**，⛔ 唔准靠記憶打。

select u.id                as user_id,
       u.email,
       u.created_at        as 開戶日,
       u.last_sign_in_at   as 最後登入,
       p.display_name      as 而家個名
  from auth.users u
  left join public.quote_people p on p.user_id = u.id
 order by u.created_at;


-- ── 第 2 段：⛔ 先驗 email，⛔ 未出到「0 rows」唔准跑第 3 段 ─────────
--
-- 🚨 點解要有呢一段：第 3 段係 `join`，email 打錯嘅話嗰個人**靜靜咁唔會入**，
--    ⛔ 唔會報錯。你會見到「Success」然後以為填咗，其實少咗一個人。
--    ⭐ 呢一段就係專登逼佢出聲。
--
-- ⚠️ 下面四行係樣本 —— 用第 1 段攞到嘅真 email 改晒佢，
--    唔喺公司做嘅人整行刪走。

with 人名 (email, display_name) as (
  values
    ('jason223hk@gmail.com', 'Jason'),
    ('請改我@example.com',   '阿耀'),
    ('請改我2@example.com',  '聰'),
    ('請改我3@example.com',  'Isaac')
)
select 人名.email as ⛔呢個email喺auth_users度揾唔到
  from 人名
  left join auth.users u on lower(u.email) = lower(人名.email)
 where u.id is null;

-- ⭐ 出到 `Success. No rows returned` = 四個 email 全部對得上，可以去第 3 段。
-- ⛔ 出到任何一行 = 嗰個 email 錯咗（或者嗰個人未開過戶）。改返佢，再跑呢一段。


-- ── 第 3 段：真係寫入去 ────────────────────────────────────────────
--
-- ⚠️ 個 VALUES 一定要同第 2 段**一模一樣**（連刪走咗嗰啲行都要一致）。
--    ⛔ 兩段唔同 = 第 2 段驗過嘅嘢唔代表第 3 段。

with 人名 (email, display_name) as (
  values
    ('jason223hk@gmail.com', 'Jason'),
    ('請改我@example.com',   '阿耀'),
    ('請改我2@example.com',  '聰'),
    ('請改我3@example.com',  'Isaac')
)
insert into public.quote_people (user_id, display_name)
select u.id, 人名.display_name
  from 人名
  join auth.users u on lower(u.email) = lower(人名.email)
on conflict (user_id) do update
   set display_name = excluded.display_name,
       updated_at   = now();

-- ⭐ 應該出 `Success. N rows` —— N 要**啱啱好等於**你 VALUES 入面嘅行數。
-- ⛔ 少咗就係有人冇入到，返去第 2 段。


-- ── 第 4 段：對數（⭐ 只讀）────────────────────────────────────────

select p.display_name as 人名, u.email, p.user_id, p.updated_at
  from public.quote_people p
  join auth.users u on u.id = p.user_id
 order by p.display_name;

-- ⭐ 每個人一行、名同 email 對得返，就係搞掂。
