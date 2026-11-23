-- A58: shared TTL cache for link previews, in front of the SSRF-safe server fetch
-- (the per-instance memory cache stays in front of this). RPC-only.
-- A member can only fill a URL that has no fresh entry, at most 120 writes an hour, with a
-- size-capped JSON object, so the cache can't be flooded or a fresh card overwritten.

create table if not exists public.link_preview_cache (
  url text primary key check (char_length(url) <= 2000),
  value jsonb not null,
  ok boolean not null default true,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid references public.members(id) on delete set null
);
create index if not exists link_preview_cache_expires_idx on public.link_preview_cache (expires_at);
create index if not exists link_preview_cache_writer_idx on public.link_preview_cache (created_by, fetched_at);
alter table public.link_preview_cache enable row level security;
revoke all on public.link_preview_cache from public, anon, authenticated;

create or replace function public.link_preview_cache_get(p_url text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select c.value from public.link_preview_cache c
  where public.is_completed_member() and c.url = p_url and c.expires_at > now();
$$;

create or replace function public.link_preview_cache_put(p_url text, p_value jsonb, p_ok boolean default true) returns boolean
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_n integer;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_url is null or char_length(p_url) > 2000 or p_url !~ '^https?://' then return false; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 8192
     or p_value->>'url' is distinct from p_url then return false; end if;
  if (select count(*) from public.link_preview_cache where created_by = v_me and fetched_at > now() - interval '1 hour') >= 120 then
    return false;
  end if;
  insert into public.link_preview_cache as c (url, value, ok, fetched_at, expires_at, created_by)
    values (p_url, p_value, coalesce(p_ok, false), now(),
      now() + case when coalesce(p_ok, false) then interval '24 hours' else interval '30 minutes' end, v_me)
    on conflict (url) do update set value = excluded.value, ok = excluded.ok, fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at, created_by = excluded.created_by
    where c.expires_at <= now();
  get diagnostics v_n = row_count;
  -- light housekeeping: drop a few long-expired rows
  delete from public.link_preview_cache where ctid in (
    select ctid from public.link_preview_cache where expires_at < now() - interval '1 day' limit 20);
  return v_n > 0;
end $$;

revoke all on function public.link_preview_cache_get(text), public.link_preview_cache_put(text, jsonb, boolean) from public, anon;
grant execute on function public.link_preview_cache_get(text), public.link_preview_cache_put(text, jsonb, boolean) to authenticated;
