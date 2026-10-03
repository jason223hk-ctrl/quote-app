#!/usr/bin/env bash
# P10 草稿 SQL 本機實測。⛔ 只會開一個掉得嘅本機 PostgreSQL cluster（/tmp），⛔ 唔掂 Supabase。
#
# 用法（Debian/Ubuntu，要有 postgresql 套件；用 postgres 呢個 OS user 行）：
#   sudo -u postgres bash tools/sql-test/P10-mirror-claim.sh
#
# ⚠️ 量到嘅係「Postgres 係點運作」，⛔ 唔係「Jason 個 DB 而家係點」——
#    `can_edit_quote_record()`、啲 policy、啲 grant 全部用 stub 頂替。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DRAFT="$HERE/../../docs/P10-mirror-claim-草稿.sql"
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
DATA="$(mktemp -d /tmp/p10pg.XXXX)"
PORT=54329
export PGPORT=$PORT PGHOST=/tmp PGUSER=postgres PGDATABASE=postgres

cleanup() { "$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null
"$BIN/postgres" --version

q() { psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }

# ── stub：Supabase 嘅 roles、auth.uid()、兩張表、RLS ─────────────────
q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.quote_records (
  id uuid primary key, created_by uuid not null,
  locked boolean not null default false, deleted_at timestamptz);
create table public.quote_photos (
  id uuid primary key, record_id uuid not null references public.quote_records(id),
  drive_file_id text not null default '', drive_synced_at timestamptz, drive_error text not null default '');

create function public.can_edit_quote_record(p uuid) returns boolean language sql stable security definer
  set search_path to 'public' as
  $$ select exists (select 1 from quote_records r where r.id = p and r.deleted_at is null
                     and r.locked = false and r.created_by = auth.uid()) $$;

alter table public.quote_photos enable row level security;
create policy sel on public.quote_photos for select to authenticated using (true);
create policy upd on public.quote_photos for update to authenticated
  using (public.can_edit_quote_record(record_id)) with check (public.can_edit_quote_record(record_id));
grant select, update on public.quote_photos to authenticated;
grant select on public.quote_records to authenticated;

insert into quote_records values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', false, null),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', true, null);
insert into quote_photos (id, record_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002');
SQL

# ── 跑草稿兩次（idempotent）────────────────────────────────────────
echo "== 草稿第一次"; q -f "$DRAFT" >/dev/null
echo "== 草稿第二次"; q -f "$DRAFT" >/dev/null
echo "== 第 3 段驗返"
q -c "select p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('anon', p.oid, 'execute') from pg_proc p where proname='quote_claim_mirror'"

AS='set role authenticated; set request.jwt.claim.sub = '"'"'00000000-0000-4000-8000-0000000000aa'"'"';'
P1=b0000000-0000-4000-8000-000000000001
P2=b0000000-0000-4000-8000-000000000002
P3=b0000000-0000-4000-8000-000000000003
C1=c0000000-0000-4000-8000-000000000001
C2=c0000000-0000-4000-8000-000000000002
claim() { q -c "$AS select public.quote_claim_mirror('$1', '$2', ${3:-120})" | tail -1; }

fail=0
check() { if [ "$2" = "$3" ]; then echo "✅ $1：$2"; else echo "❌ $1：預期 $3，得到 $2"; fail=1; fi; }

check "第一次攞" "$(claim $P1 $C1)" claimed
check "另一個攞（租約未到期）" "$(claim $P1 $C2)" busy
check "同一個再攞（續租）" "$(claim $P1 $C1)" claimed
q -c "update quote_photos set mirror_claim_until = now() - interval '1 second' where id='$P1'"
check "租約過咗期 ⇒ 另一個攞到" "$(claim $P1 $C2)" claimed
check "冇權改（工程鎖咗）" "$(claim $P3 $C1)" denied
check "揾唔到張相" "$(claim d0000000-0000-4000-8000-000000000009 $C1)" missing
q -c "update quote_photos set drive_synced_at = now(), drive_file_id = 'drv-x', mirror_claim_id = null, mirror_claim_until = null where id='$P2'"
check "已經抄咗" "$(claim $P2 $C1)" done
q -c "update quote_photos set drive_file_id = '' where id='$P2'"
check "drive_synced_at 有值但 drive_file_id 係 '' ⇒ 當未抄" "$(claim $P2 $C1)" claimed
q -c "update quote_photos set drive_file_id = '   ' where id='$P2'"
check "drive_file_id 淨係空格 ⇒ 當未抄（同一個 claim 續租）" "$(claim $P2 $C1)" claimed

out=$(q -c "$AS select public.quote_claim_mirror('$P1', '$C1', 5)" 2>&1 || true)
case "$out" in *"10 至 900"*) echo "✅ 租約太短 ⇒ 報錯";; *) echo "❌ 租約太短冇報錯：$out"; fail=1;; esac
out=$(q -c "set role anon; select public.quote_claim_mirror('$P1', '$C1', 120)" 2>&1 || true)
case "$out" in *"permission denied"*) echo "✅ anon 行唔到";; *) echo "❌ anon 行到：$out"; fail=1;; esac

# 交還：只交得返自己嗰個
n=$(q -c "$AS with u as (update quote_photos set mirror_claim_id = null, mirror_claim_until = null where id='$P1' and mirror_claim_id='$C1' returning 1) select count(*) from u" | tail -1)
check "用錯 claim id 交還 ⇒ 0 行（人哋嗰個掂唔到）" "$n" 0
n=$(q -c "$AS with u as (update quote_photos set mirror_claim_id = null, mirror_claim_until = null where id='$P1' and mirror_claim_id='$C2' returning 1) select count(*) from u" | tail -1)
check "用自己 claim id 交還 ⇒ 1 行" "$n" 1

# ── 真正同時：A 攞住未 commit，B 同時攞 ⇒ B 要等，A commit 之後 B 見到 busy ──
echo "== 兩條連線同時攞"
( q -c "$AS begin; select public.quote_claim_mirror('$P1', '$C1', 120); select pg_sleep(2); commit;" > "$DATA/a.out" ) &
sleep 0.5
start=$(date +%s.%N)
b=$(claim $P1 $C2)
waited=$(echo "$(date +%s.%N) - $start" | bc)
wait
check "A 攞住緊（未 commit）⇒ B 等完見到" "$b" busy
echo "   B 等咗 ${waited}s（⭐ 應該約 1.5s ⇒ 證明係真係等 A，唔係各自睇舊資料）"
check "A 自己" "$(grep -E 'claimed|busy' "$DATA/a.out")" claimed

# ── 退回（rollback）再跑返 ──────────────────────────────────────────
echo "== rollback"
q -c "drop function if exists public.quote_claim_mirror(uuid, uuid, integer)"
q -c "alter table public.quote_photos drop column if exists mirror_claim_until, drop column if exists mirror_claim_id"
check "退回之後 function 冇咗" "$(q -c "select count(*) from pg_proc where proname='quote_claim_mirror'")" 0
check "退回之後欄冇咗" "$(q -c "select count(*) from information_schema.columns where table_name='quote_photos' and column_name like 'mirror_claim%'")" 0
q -f "$DRAFT" >/dev/null
check "退回之後再跑草稿 ⇒ 攞得返" "$(claim $P1 $C1)" claimed

[ "$fail" = 0 ] && echo "== 全部過" || { echo "== ⛔ 有失敗"; exit 1; }
