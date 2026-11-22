-- Invite auto-renewal period: 1 month -> 7 days (Colin 2026-11-23). Same lazy, idempotent
-- renewal as 0045; only the due interval changes. invites__renew_mine() calls this unchanged.

create or replace function public.invites__renew_due(p_member uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_member public.members%rowtype;
  v_due record;
  v_code text;
  v_n integer := 0;
begin
  select * into v_member from public.members where id = p_member;
  if not found or v_member.signup_completed_at is null or v_member.is_banned then
    return 0;
  end if;
  for v_due in
    select id from public.invite_codes
    where created_by_id = p_member
      and used_by_id is not null and used_at is not null
      and renewed_at is null
      and used_at <= now() - interval '7 days'
    order by used_at
    for update skip locked
  loop
    loop
      v_code := public.generate_invite_code();
      exit when not exists (select 1 from public.invite_codes where code = v_code);
    end loop;
    insert into public.invite_codes (code, created_by_id, renewed_from_id, note)
    values (v_code, p_member, v_due.id, 'auto-renewal')
    on conflict do nothing;
    update public.invite_codes set renewed_at = now() where id = v_due.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.invites__renew_due(uuid) from public, anon, authenticated;
