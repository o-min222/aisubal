-- Invite auto-renewal: a USED code comes back as one fresh code a month after it was used.
-- Unused codes never multiply. Lazy + idempotent (no cron): the app calls invites__renew_mine()
-- only when one of the member's used codes is due (renewed_at null, used_at <= now() - 1 month).

alter table public.invite_codes
  add column if not exists renewed_at timestamptz,
  add column if not exists renewed_from_id uuid references public.invite_codes(id) on delete set null;

-- one renewal per used code, ever (also makes concurrent calls safe)
create unique index if not exists invite_codes_renewed_from_uniq on public.invite_codes(renewed_from_id) where renewed_from_id is not null;

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
      and used_at <= now() - interval '1 month'
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

-- caller's own codes only
create or replace function public.invites__renew_mine()
returns integer
language sql
security definer
set search_path to ''
as $$
  select coalesce(public.invites__renew_due(public.current_member_id()), 0)
$$;
revoke all on function public.invites__renew_mine() from public, anon;
grant execute on function public.invites__renew_mine() to authenticated;
