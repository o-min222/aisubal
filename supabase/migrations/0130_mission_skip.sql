-- A99: a new member can skip the first-question mission (첫 글) and still enter the site.
-- onboarding_mission_skip sets first_mission_at (so the existing /welcome gate and digest
-- queries treat them as finished) and first_mission_skipped_at (so a skip is distinct from
-- writing the mission post). No post is written and the inviter/admin first_post alert is
-- not sent — there is nothing to react to. Idempotent: a second call, or a member who
-- already finished, is a no-op. The column is RPC-only (no select/update grant); get_my_member
-- already returns new columns.

alter table public.members add column if not exists first_mission_skipped_at timestamptz;

create or replace function public.onboarding_mission_skip() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  m public.members%rowtype;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into m from public.members where id = v_me for update;
  if m.first_mission_at is not null then
    return jsonb_build_object('ok', true, 'first', false, 'skipped', m.first_mission_skipped_at is not null);
  end if;
  update public.members
    set first_mission_at = now(), first_mission_skipped_at = now()
    where id = v_me;
  return jsonb_build_object('ok', true, 'first', true, 'skipped', true);
end $$;
revoke all on function public.onboarding_mission_skip() from public, anon;
grant execute on function public.onboarding_mission_skip() to authenticated;
