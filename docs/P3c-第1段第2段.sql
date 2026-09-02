-- P3c 第 1 段：派號 function
-- 第 0a / 0b 段 2026-08-23 已經跑咗（SELECT policy = using (true)、撞號零行）
create or replace function public.allocate_quote_photo_seq(
  p_record_id  uuid,
  p_tree_id    uuid,
  p_mitigation text
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next int;
begin
  perform 1
    from public.quote_photos
   where record_id = p_record_id
     and tree_id is not distinct from p_tree_id
     and mitigation is not distinct from p_mitigation
     and deleted_at is null
   for update;

  select coalesce(max(seq), 0) + 1
    into v_next
    from public.quote_photos
   where record_id = p_record_id
     and tree_id is not distinct from p_tree_id
     and mitigation is not distinct from p_mitigation
     and deleted_at is null;

  return v_next;
end;
$$;

revoke all on function public.allocate_quote_photo_seq(uuid, uuid, text) from public;
grant execute on function public.allocate_quote_photo_seq(uuid, uuid, text) to authenticated;

-- P3c 第 2 段：最後一道閘（同一格唔可以有兩行同號）
create unique index quote_photos_slot_seq_uidx
  on public.quote_photos (
    record_id,
    coalesce(tree_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(mitigation, ''),
    seq
  )
  where deleted_at is null;

-- ⛔ 出事先跑呢兩句（唔會郁任何一行相片資料）
-- drop index if exists public.quote_photos_slot_seq_uidx;
-- drop function if exists public.allocate_quote_photo_seq(uuid, uuid, text);
