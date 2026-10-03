-- ══════════════════════════════════════════════════════════════════
-- C 補：`quote_people` 補入 Jason 一行（⚠️ 只係喺原型「乙 · 補返 Jason 一行」揀咗先要）
--
-- ⛔⛔ **草稿。Jason 親手跑。⛔ AI 唔准代跑**（CLAUDE.md §3）。⛔ 我冇跑過。
-- ⛔ 擺喺原型分枝（claude/proto-people-names），呢條分枝⛔ 永遠唔 merge。
--    你揀咗「補返 Jason」之後，⭐ 最慳嘅做法係把呢一行**直接加入 #66 份
--    `docs/C-quote_people-四行-草稿.sql` 第 2 段同第 3 段個 `values`**，一次過跑，
--    ⛔ 唔使分開跑兩份。呢份稿係俾你睇清楚「加嘅係咩」。
--
-- 點解要：#66 份 SQL 淨係入阿耀／聰／Isaac／Anna 四個人。
--   ⇒ 畫面將來用呢張表譯 `created_by`，Jason 開嘅單（例：象山、麗閣）就**譯唔到名**，
--     搜尋面板個「建立人」下拉亦⛔ 揀唔到 Jason。
--
-- ⭐ 跑幾多次都得（`on conflict … do update`）。
-- ⭐ 淨係入資料：⛔ 冇 create／alter／drop、⛔ 冇改 policy／GRANT。
-- ⚠️ 假設 P7 已經建咗 `quote_people`（`docs/P7-客戶簿-人名.sql` 第 2 段）。
-- ══════════════════════════════════════════════════════════════════

-- ① 只讀：先睇 Jason 個帳號用邊個 email
select id, email from auth.users order by created_at;

-- ② 入資料（⛔ 先把 email 改成真嘅）
with 要入嘅人 (email, display_name) as (
  values ('jason嘅email@example.com', 'Jason')   -- ⛔ 改我
)
insert into public.quote_people (user_id, display_name)
select u.id, p.display_name
  from 要入嘅人 p
  join auth.users u on lower(btrim(u.email)) = lower(btrim(p.email))
on conflict (user_id) do update
   set display_name = excluded.display_name,
       updated_at   = now();

-- ③ ⛔ 跑完即刻驗 —— 「冇報錯」⛔ 唔等於「入到咗」（join 對唔到 ⇒ 0 行，⛔ 唔會報錯）
--    ⭐ 預期：一行，結果 = ✓ 入咗
with 要入嘅人 (email, display_name) as (
  values ('jason嘅email@example.com', 'Jason')   -- ⛔ 改我（同上面一樣）
)
select p.display_name as 想入嘅名,
       u.id           as 對到嘅帳號,
       case when u.id is null then '⛔ 揾唔到帳號 —— email 打錯咗'
            when qp.user_id is null then '⛔⛔ 對到帳號但入唔到 —— 請截圖'
            else '✓ 入咗' end as 結果
  from 要入嘅人 p
  left join auth.users u on lower(btrim(u.email)) = lower(btrim(p.email))
  left join public.quote_people qp on qp.user_id = u.id;
