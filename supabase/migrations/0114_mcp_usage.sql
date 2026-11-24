-- A66 P3: per-token MCP usage log (tool, status, latency) + per-token / per-member rate limits.
--   * mcp_usage_begin(token, tool): verifies the token, checks the limits, logs a pending row → { ok, id } or
--     { ok:false, limited:{ scope, window, limit, retryAfter } }. Unknown / revoked tokens: { ok:true, id:null }
--     (the tool call itself answers unauthorized, exactly as before).
--   * mcp_usage_end(token, id, status, latency): fills in the outcome (only the token's own pending row).
--   * limits live in site_config (admin-tunable without a migration); defaults below.
--   * owners read their agent's summary (mcp_usage_summary), admins the whole picture (mcp_usage_admin).
--   * rows older than 30 days are pruned nightly.

create table if not exists public.mcp_usage (
  id bigint generated always as identity primary key,
  token_id uuid not null references public.api_tokens(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  tool text not null,
  status text not null default 'pending',
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists mcp_usage_token_time on public.mcp_usage (token_id, created_at desc);
create index if not exists mcp_usage_member_time on public.mcp_usage (member_id, created_at desc);
create index if not exists mcp_usage_time on public.mcp_usage (created_at);
alter table public.mcp_usage enable row level security;
revoke all on table public.mcp_usage from public, anon, authenticated;

insert into public.site_config (key, value) values
  ('mcp_rate_token_per_min', '60'), ('mcp_rate_token_per_day', '2000'),
  ('mcp_rate_member_per_min', '120'), ('mcp_rate_member_per_day', '5000')
on conflict (key) do nothing;

create or replace function public.mcp__limit(p_key text, p_default integer) returns integer
language sql stable security definer set search_path to '' as $$
  select coalesce((select case when value ~ '^\d{1,7}$' then value::integer end from public.site_config where key = p_key), p_default)
$$;

create or replace function public.mcp__limits() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'tokenPerMin', public.mcp__limit('mcp_rate_token_per_min', 60), 'tokenPerDay', public.mcp__limit('mcp_rate_token_per_day', 2000),
    'memberPerMin', public.mcp__limit('mcp_rate_member_per_min', 120), 'memberPerDay', public.mcp__limit('mcp_rate_member_per_day', 5000))
$$;

create or replace function public.mcp_usage_begin(p_token text, p_tool text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  l jsonb := public.mcp__limits();
  tok_min integer; tok_day integer; mem_min integer; mem_day integer;
  v_scope text; v_window text; v_limit integer; v_oldest timestamptz; v_id bigint;
  v_tool text := left(coalesce(nullif(regexp_replace(btrim(coalesce(p_tool, '')), '[^A-Za-z0-9_:/.-]', '', 'g'), ''), 'unknown'), 64);
begin
  if p_token is null or length(p_token) < 16 then return jsonb_build_object('ok', true, 'id', null); end if;
  select * into t from public.api_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and not is_revoked limit 1;
  if not found or (t.expires_at is not null and t.expires_at < now()) then return jsonb_build_object('ok', true, 'id', null); end if;

  -- refused-by-limit rows are logged but never count toward the limit (no lock-out loops)
  select count(*) filter (where u.created_at > now() - interval '1 minute'), count(*)
    into tok_min, tok_day from public.mcp_usage u
   where u.token_id = t.id and u.created_at > now() - interval '1 day' and u.status <> 'limited';
  select count(*) filter (where u.created_at > now() - interval '1 minute'), count(*)
    into mem_min, mem_day from public.mcp_usage u
   where u.member_id = t.member_id and u.created_at > now() - interval '1 day' and u.status <> 'limited';

  if tok_min >= (l->>'tokenPerMin')::integer then v_scope := 'token'; v_window := 'minute'; v_limit := (l->>'tokenPerMin')::integer;
  elsif mem_min >= (l->>'memberPerMin')::integer then v_scope := 'member'; v_window := 'minute'; v_limit := (l->>'memberPerMin')::integer;
  elsif tok_day >= (l->>'tokenPerDay')::integer then v_scope := 'token'; v_window := 'day'; v_limit := (l->>'tokenPerDay')::integer;
  elsif mem_day >= (l->>'memberPerDay')::integer then v_scope := 'member'; v_window := 'day'; v_limit := (l->>'memberPerDay')::integer;
  end if;

  if v_scope is not null then
    select min(u.created_at) into v_oldest from public.mcp_usage u
     where (case when v_scope = 'token' then u.token_id = t.id else u.member_id = t.member_id end)
       and u.status <> 'limited'
       and u.created_at > now() - (case when v_window = 'minute' then interval '1 minute' else interval '1 day' end);
    insert into public.mcp_usage (token_id, member_id, tool, status, latency_ms) values (t.id, t.member_id, v_tool, 'limited', 0);
    return jsonb_build_object('ok', false, 'limited', jsonb_build_object(
      'scope', v_scope, 'window', v_window, 'limit', v_limit,
      'retryAfter', greatest(1, ceil(extract(epoch from (v_oldest + (case when v_window = 'minute' then interval '1 minute' else interval '1 day' end) - now())))::integer)));
  end if;

  insert into public.mcp_usage (token_id, member_id, tool) values (t.id, t.member_id, v_tool) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.mcp_usage_end(p_token text, p_id bigint, p_status text, p_latency_ms integer) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if p_id is null or p_token is null or length(p_token) < 16 then return; end if;
  update public.mcp_usage u
     set status = case when p_status in ('ok', 'error', 'refused', 'unknown', 'unauthorized', 'invalid') then p_status else 'error' end,
         latency_ms = greatest(0, least(coalesce(p_latency_ms, 0), 600000))
   where u.id = p_id and u.status = 'pending'
     and u.token_id = (select a.id from public.api_tokens a where a.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') limit 1);
end $$;

-- the owner's (or an admin's) view of one agent
create or replace function public.mcp_usage_summary(p_token_id uuid, p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_days integer := least(greatest(coalesce(p_days, 7), 1), 30); v_since timestamptz; v jsonb; tok public.api_tokens%rowtype;
begin
  select * into tok from public.api_tokens a where a.id = p_token_id;
  if not found or not (tok.member_id = public.current_member_id() or public.app__is_admin()) then
    raise exception 'mcp_usage_not_found' using errcode = 'P0001';
  end if;
  v_since := now() - make_interval(days => v_days);
  select jsonb_build_object(
    'days', v_days,
    'total', count(*) filter (where u.status <> 'limited'),
    'ok', count(*) filter (where u.status = 'ok'),
    'errors', count(*) filter (where u.status in ('error', 'unknown', 'unauthorized', 'invalid')),
    'refused', count(*) filter (where u.status = 'refused'),
    'limited', count(*) filter (where u.status = 'limited'),
    'avgMs', round(avg(u.latency_ms) filter (where u.status in ('ok', 'error'))),
    'p95Ms', round(percentile_cont(0.95) within group (order by u.latency_ms) filter (where u.status in ('ok', 'error'))),
    'lastAt', max(u.created_at)
  ) into v from public.mcp_usage u where u.token_id = p_token_id and u.created_at > v_since;
  return v || jsonb_build_object(
    'byTool', coalesce((select jsonb_agg(x order by x.calls desc) from (
        select u.tool, count(*) filter (where u.status <> 'limited') as calls,
               count(*) filter (where u.status in ('error', 'unknown', 'unauthorized', 'invalid')) as errors,
               round(avg(u.latency_ms) filter (where u.status in ('ok', 'error'))) as "avgMs"
          from public.mcp_usage u where u.token_id = p_token_id and u.created_at > v_since
         group by u.tool order by 2 desc limit 8) x), '[]'::jsonb),
    'byDay', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'calls', d.calls) order by d.day) from (
        select (u.created_at at time zone 'Asia/Seoul')::date as day, count(*) filter (where u.status <> 'limited') as calls
          from public.mcp_usage u where u.token_id = p_token_id and u.created_at > v_since group by 1) d), '[]'::jsonb),
    'limits', public.mcp__limits(),
    'lastMinute', (select count(*) from public.mcp_usage u where u.token_id = p_token_id and u.created_at > now() - interval '1 minute' and u.status <> 'limited'),
    'today', (select count(*) from public.mcp_usage u where u.token_id = p_token_id and u.created_at > now() - interval '1 day' and u.status <> 'limited'));
end $$;

-- admins: the busiest agents and tools
create or replace function public.mcp_usage_admin(p_days integer default 1) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_days integer := least(greatest(coalesce(p_days, 1), 1), 30); v_since timestamptz;
begin
  if not public.app__is_admin() then raise exception 'mcp_usage_forbidden' using errcode = 'P0001'; end if;
  v_since := now() - make_interval(days => v_days);
  return jsonb_build_object(
    'days', v_days,
    'limits', public.mcp__limits(),
    'total', (select count(*) filter (where u.status <> 'limited') from public.mcp_usage u where u.created_at > v_since),
    'errors', (select count(*) filter (where u.status in ('error', 'unknown', 'unauthorized', 'invalid')) from public.mcp_usage u where u.created_at > v_since),
    'limited', (select count(*) filter (where u.status = 'limited') from public.mcp_usage u where u.created_at > v_since),
    'agents', coalesce((select jsonb_agg(x order by x.calls desc) from (
        select u.token_id as "tokenId", coalesce(a.agent_name, a.name) as name, a.agent_handle as handle,
               m.display_name as owner, m.handle as "ownerHandle",
               count(*) filter (where u.status <> 'limited') as calls,
               count(*) filter (where u.status in ('error', 'unknown', 'unauthorized', 'invalid')) as errors,
               count(*) filter (where u.status = 'limited') as limited,
               round(avg(u.latency_ms) filter (where u.status in ('ok', 'error'))) as "avgMs"
          from public.mcp_usage u join public.api_tokens a on a.id = u.token_id join public.members m on m.id = u.member_id
         where u.created_at > v_since
         group by u.token_id, a.agent_name, a.name, a.agent_handle, m.display_name, m.handle
         order by 6 desc limit 20) x), '[]'::jsonb),
    'tools', coalesce((select jsonb_agg(x order by x.calls desc) from (
        select u.tool, count(*) filter (where u.status <> 'limited') as calls,
               count(*) filter (where u.status in ('error', 'unknown', 'unauthorized', 'invalid')) as errors,
               round(avg(u.latency_ms) filter (where u.status in ('ok', 'error'))) as "avgMs"
          from public.mcp_usage u where u.created_at > v_since group by u.tool order by 2 desc limit 15) x), '[]'::jsonb));
end $$;

create or replace function public.mcp_usage__prune() returns void
language sql security definer set search_path to '' as $$
  delete from public.mcp_usage where created_at < now() - interval '30 days'
$$;

revoke all on function public.mcp__limit(text, integer), public.mcp__limits(), public.mcp_usage__prune() from public, anon, authenticated;
revoke all on function public.mcp_usage_begin(text, text), public.mcp_usage_end(text, bigint, text, integer),
  public.mcp_usage_summary(uuid, integer), public.mcp_usage_admin(integer) from public, anon, authenticated;
-- token-verified (called by /api/mcp with the anon key, like every mcp_* RPC)
grant execute on function public.mcp_usage_begin(text, text), public.mcp_usage_end(text, bigint, text, integer) to anon, authenticated;
-- signed-in owners / admins (checked inside)
grant execute on function public.mcp_usage_summary(uuid, integer), public.mcp_usage_admin(integer) to authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'mcp-usage-prune';
  perform cron.schedule('mcp-usage-prune', '41 18 * * *', 'select public.mcp_usage__prune()');
end $$;
