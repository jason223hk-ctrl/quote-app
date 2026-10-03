-- ══════════════════════════════════════════════════════════════════
-- P10：`quote_photos` 加「抄緊 Drive」嘅租約（mirror claim）
--
-- ⛔⛔ **草稿。Jason 親手跑。⛔ AI 唔准代跑，亦唔准分段偷步**（CLAUDE.md §3）。
-- ⛔⛔⛔ **一次跑一段。⛔ 唔准成份貼落去**（SQL editor 淨係 show 最後一句結果）。
-- ⭐⭐ 跑幾多次都得（idempotent）。
--
-- 設計、點解、同 #78 點夾：`docs/P10-Drive鎖-設計.md`。
--
-- ⭐ **跑唔跑都唔會整壞 app**：Worker 見唔到 `quote_claim_mirror`（404）就照舊行
--   （冇鎖，靠 #78 上完之後收斂）。⇒ ⛔ 唔使同 deploy 夾時間。
--
-- ⭐⭐ 同 P8 個 `quote_purge_stamp` 唔同：呢條 function 係 **`security invoker`**
--   （⛔ 唔係 `security definer`）—— 佢用**叫佢嗰個人自己嘅權限**，
--   RLS 照樣攔，佢做唔到嘅嘢你直接 `update` 一樣做唔到。
--   ⇒ ⛔ 冇開任何後門，⛔ 冇攞 P8 嗰道「好窄嘅後門」做先例。
--
-- ⛔ 淨係掂 `quote_` 開頭嘅嘢（個 Supabase project 同 tree app 共用）。
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- 第 0 段：⛔⛔ 只讀
-- ══════════════════════════════════════════════════════════════════

-- ── ① `quote_photos` 而家有咩欄（⭐ 應該**冇** `mirror_claim_id`／`mirror_claim_until`）──
select column_name as 欄名, data_type as 型, is_nullable as 可空, column_default as 預設
  from information_schema.columns
 where table_schema = 'public' and table_name = 'quote_photos'
 order by ordinal_position;

-- ⇒ **預期見到**：十幾行；`drive_file_id` 係 `text`、`NO`、`''::text`；
--   ⛔ 冇 `mirror_claim_*`。⚠️ 已經有 ⇒ 第 1 段跑過，唔使再跑（跑都冇事）。

-- ── ② 有冇人收窄過 column grant（⭐ 預期一行都冇）──────────────────
--   ⚠️ 有行而 `authenticated` 冇 `update` 新欄 ⇒ 第 2 段條 function 會撞 42501。貼返俾我。
select grantee as 邊個, column_name as 邊個欄, privilege_type as 咩權
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'quote_photos'
   and grantee not in ('postgres')
 order by grantee, column_name;

-- ── ③ 有幾多行「`drive_file_id` 係空字串」（⭐ 只數，⛔ 唔改）─────────
--   ⭐ `drive_file_id` 係 `text not null default ''` ⇒ **`''` 就係「未抄」嘅正常值**，
--     ⛔ 唔係壞資料。⚠️ 但「`drive_synced_at` 有值而 `drive_file_id` 係 `''`」就唔正常
--     （話抄咗、但冇 id）。2026-10-03 見到工程「彩」（2026-08-22）有一行 `''`，未知係邊種。
select (drive_synced_at is not null) as 話抄咗, count(*) as 幾多行
  from public.quote_photos
 where btrim(drive_file_id) = ''
 group by 1;

-- ⇒ **預期見到**：`false | 好多`（未抄嘅），**最好冇** `true` 嗰行。
--   ⚠️ 有 `true` ⇒ 貼返俾我。⛔ 唔好喺度改：新 Worker 會當佢「未抄」，
--     下次有人叫 `/mirror` 就會用 `quotePhotoId` 揾返嗰份 Drive 檔、補返個 id。


-- ══════════════════════════════════════════════════════════════════
-- 第 1 段：加兩個欄
-- ══════════════════════════════════════════════════════════════════
--
-- ⭐ `mirror_claim_id`   ＝ 邊一次 `/mirror` 攞住（每次一個新 uuid，⛔ 唔係人）
-- ⭐ `mirror_claim_until` ＝ 租約幾時到期（過咗就當冇人攞住 ⇒ 死咗嘅 Worker 唔會鎖死張相）
-- ⛔ 冇 default、⛔ 冇 not null、⛔ 冇 trigger、⛔ 冇 index（幾百行級數，見 P8 第 1 段同一個理由）。

alter table public.quote_photos
  add column if not exists mirror_claim_id uuid,
  add column if not exists mirror_claim_until timestamptz;

-- ⇒ **預期見到**：`ALTER TABLE`。


-- ══════════════════════════════════════════════════════════════════
-- 第 2 段：攞租約嘅 function（`security invoker`）
-- ══════════════════════════════════════════════════════════════════
--
-- ⭐ 一句有條件嘅 `update` 就係個鎖：兩個人同時嚟，Postgres 會叫第二個**等**
--   第一個寫完，再用**新**嗰行重新睇一次條件 ⇒ 第二個見到「有人攞住」⇒ 0 行。
--   ⇒ ⛔ 唔會兩個都攞到。（本機用兩條連線實測過，見檔尾。）
--
-- ⭐ 時間用 DB 嘅 `now()`，⛔ 唔用 Worker 個鐘（唔同機個鐘會差）。
--
-- 回五個值，⛔ 唔准合埋：
--   `claimed` ＝ 攞到，去抄
--   `busy`    ＝ 另一次 `/mirror` 攞住緊，租約未到期 ⇒ ⛔ 唔好抄
--   `done`    ＝ 已經抄咗（`drive_synced_at` 有值**而且** `drive_file_id` 唔係空）
--   `denied`  ＝ 睇到張相但改唔到（RLS：工程鎖咗／刪咗／唔係你嘅）
--   `missing` ＝ 睇唔到張相（唔存在，或者 RLS 連睇都唔俾）
--
-- ⚠️ `''` 當「未抄」：`drive_synced_at` 有值但 `drive_file_id` 係 `''` ⇒ ⛔ 唔算 `done`。

create or replace function public.quote_claim_mirror(
  p_photo_id      uuid,
  p_claim_id      uuid,
  p_lease_seconds integer
)
  returns text
  language plpgsql
  security invoker
  set search_path to 'public'
as $function$
declare
  v_rows  integer;
  v_done  boolean;
  v_until timestamptz;
begin
  if p_claim_id is null then
    raise exception 'quote_claim_mirror: p_claim_id 不可以是空值';
  end if;
  -- ⛔ 租約長度有上下限：太短會喺抄緊嗰陣過期，太長會令死咗嘅 Worker 鎖住張相太耐。
  if p_lease_seconds is null or p_lease_seconds < 10 or p_lease_seconds > 900 then
    raise exception 'quote_claim_mirror: p_lease_seconds 要在 10 至 900 之間（收到 %）', p_lease_seconds;
  end if;

  update public.quote_photos
     set mirror_claim_id    = p_claim_id,
         mirror_claim_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_photo_id
     and (drive_synced_at is null or btrim(drive_file_id) = '')
     and (mirror_claim_id is null
          or mirror_claim_until is null
          or mirror_claim_until <= now()
          or mirror_claim_id = p_claim_id);
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    return 'claimed';
  end if;

  -- 攞唔到 ⇒ 讀返張相睇點解（⛔ 一樣受 RLS 管）。
  select (drive_synced_at is not null and btrim(drive_file_id) <> ''),
         mirror_claim_until
    into v_done, v_until
    from public.quote_photos
   where id = p_photo_id;

  if not found then
    return 'missing';
  end if;
  if v_done then
    return 'done';
  end if;
  if v_until is not null and v_until > now() then
    return 'busy';
  end if;
  -- 睇到、冇人攞住、未抄 ⇒ 但 update 0 行 ⇒ RLS 唔俾改。
  return 'denied';
end
$function$;

revoke all on function public.quote_claim_mirror(uuid, uuid, integer) from public;
revoke all on function public.quote_claim_mirror(uuid, uuid, integer) from anon;
grant execute on function public.quote_claim_mirror(uuid, uuid, integer) to authenticated;

-- ⇒ **預期見到**：`CREATE FUNCTION`、`REVOKE`、`REVOKE`、`GRANT`。
--
-- ⭐ 交還租約⛔ 唔使 function：Worker 用普通 `PATCH`
--   （`quote_photos?id=eq.…&mirror_claim_id=eq.<自己個 uuid>` ⇒ 兩個欄設返 null），
--   ⇒ 淨係交得返**自己**嗰個；人哋攞住嘅⛔ 掂唔到。


-- ══════════════════════════════════════════════════════════════════
-- 第 3 段：⛔⛔ 只讀 —— 驗返
-- ══════════════════════════════════════════════════════════════════

select p.proname as 名, p.prosecdef as 係咪definer, pg_get_function_identity_arguments(p.oid) as 參數,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated行得,
       has_function_privilege('anon', p.oid, 'execute') as anon行得
  from pg_proc p
 where p.proname = 'quote_claim_mirror' and p.pronamespace = 'public'::regnamespace;

-- ⇒ **預期見到**：一行 `quote_claim_mirror | f | p_photo_id uuid, p_claim_id uuid, p_lease_seconds integer | t | f`。
--   ⚠️ `係咪definer` 係 `t` ⇒ ⛔ 唔啱，即刻話我知。

-- ⭐ 跑完之後要叫 PostgREST 重新讀一次（否則 Worker 可能仲見唔到條 function，⛔ 但唔會壞，只係照舊冇鎖）：
notify pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════
-- 退回（rollback）—— ⛔ 平時唔好跑。要退先跑，同樣一次一段。
-- ══════════════════════════════════════════════════════════════════
--
-- ⭐ 次序：**先退 function，再退欄**。
--   退咗 function 之後 Worker 自動變返「冇鎖」（404 ⇒ 照舊行），⛔ 唔使先改 Worker。
-- ⚠️⚠️ 但**欄**⛔ 唔好喺新 Worker 仲行緊而 function 仲喺度嗰陣先剷：
--   Worker 攞到租約之後會寫 `mirror_claim_*`，欄冇咗就會報錯。⇒ 一定先剷 function、
--   等一分鐘（⭐ 租約最長 2 分鐘），再剷欄。
--
-- R1：
-- drop function if exists public.quote_claim_mirror(uuid, uuid, integer);
-- notify pgrst, 'reload schema';
--
-- R2（等兩分鐘之後）：
-- alter table public.quote_photos
--   drop column if exists mirror_claim_until,
--   drop column if exists mirror_claim_id;
-- notify pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════
-- 本機實測：`tools/sql-test/P10-mirror-claim.sh`（見設計文件 §8）
-- ══════════════════════════════════════════════════════════════════
