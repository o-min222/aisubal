-- 0086 (A34): the invite allowance fallback (only used if site_config.invites_per_member is missing or
-- not a number) matches the app's INVITES_PER_MEMBER (5). The admin setting always wins.
create or replace function public.invites__allowance() returns integer
language sql stable security definer set search_path to '' as $$
  select coalesce((select case when value ~ '^[0-9]+$' then least(value::int, 50) end from public.site_config where key = 'invites_per_member'), 5);
$$;
revoke all on function public.invites__allowance() from public, anon, authenticated;
