-- 0145 (A122 extra, t364u): per-agent MCP config refresh.
--   * api_tokens.mcp_config_version - server/config version stamped on each MCP call
--   * pending_* - safe token rotate: old secret stays valid until the new one connects, or the owner confirms
--   * pending_token_hash is never selectable by members; only the prefix is visible
--   * token lookup accepts the current or pending secret; first use of the pending secret promotes it

alter table public.api_tokens
  add column if not exists mcp_config_version text,
  add column if not exists pending_token_hash text,
  add column if not exists pending_token_prefix text,
  add column if not exists pending_created_at timestamptz;

comment on column public.api_tokens.mcp_config_version is 'MCP server/config version seen at this token''s last call.';
comment on column public.api_tokens.pending_token_hash is 'Hash of a prepared replacement secret; becomes current on first use or explicit confirm.';

create unique index if not exists api_tokens_pending_hash_uidx
  on public.api_tokens (pending_token_hash) where pending_token_hash is not null;

revoke insert (mcp_config_version, pending_token_hash, pending_token_prefix, pending_created_at)
  on public.api_tokens from public, anon, authenticated;
revoke update (mcp_config_version, pending_token_hash, pending_token_prefix, pending_created_at)
  on public.api_tokens from public, anon, authenticated;
grant select (mcp_config_version, pending_token_prefix, pending_created_at) on public.api_tokens to authenticated;

-- Bump this string (and src/lib/mcp/config-version.ts) when install config or protocol requires a reconnect.
create or replace function public.mcp_config_version()
returns text
language sql immutable parallel safe
set search_path to '' as $$
  select '2026-11-28'::text;
$$;
revoke all on function public.mcp_config_version() from public, anon;
grant execute on function public.mcp_config_version() to authenticated;

-- Find a live token by current or pending secret. Does not write.
create or replace function public.api__find_token(p_token text)
returns public.api_tokens
language plpgsql stable security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  v_hash text;
begin
  if p_token is null or length(p_token) < 16 then return null; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into t from public.api_tokens
   where not is_revoked
     and (token_hash = v_hash or pending_token_hash = v_hash)
   limit 1;
  if not found then return null; end if;
  if (t.expires_at is not null and t.expires_at < now())
     or (t.access_expires_at is not null and t.access_expires_at < now()) then
    return null;
  end if;
  if not exists (
    select 1 from public.members m
     where m.id = t.member_id and m.signup_completed_at is not null and not m.is_banned
  ) then
    return null;
  end if;
  return t;
end;
$$;
revoke all on function public.api__find_token(text) from public, anon, authenticated;

-- Stamp last use + config version. If p_token is the pending secret, promote it and retire the old one.
create or replace function public.api__touch_token(p_id uuid, p_token text, p_client text default null)
returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_client text := nullif(left(regexp_replace(btrim(coalesce(p_client, '')), '[[:cntrl:]<>]', '', 'g'), 80), '');
begin
  update public.api_tokens set
    last_used_at = now(),
    mcp_config_version = public.mcp_config_version(),
    last_client_info = coalesce(v_client, last_client_info),
    token_hash = case when pending_token_hash = v_hash then pending_token_hash else token_hash end,
    token_prefix = case when pending_token_hash = v_hash then pending_token_prefix else token_prefix end,
    rotated_at = case when pending_token_hash = v_hash then now() else rotated_at end,
    oauth_client_id = case when pending_token_hash = v_hash then null else oauth_client_id end,
    access_expires_at = case when pending_token_hash = v_hash then null else access_expires_at end,
    pending_token_hash = case when pending_token_hash = v_hash then null else pending_token_hash end,
    pending_token_prefix = case when pending_token_hash = v_hash then null else pending_token_prefix end,
    pending_created_at = case when pending_token_hash = v_hash then null else pending_created_at end
  where id = p_id and not is_revoked;
end;
$$;
revoke all on function public.api__touch_token(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- token resolvers now accept a pending secret
create or replace function public.api__token(p_token text, p_scopes text[])
returns api_tokens
language plpgsql security definer set search_path to 'public' as $$
declare
  t public.api_tokens%rowtype;
  v_scopes text[];
begin
  t := public.api__find_token(p_token);
  if t.id is null then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  v_scopes := array(select btrim(s) from unnest(string_to_array(t.scopes, ',')) s);
  if not (v_scopes && p_scopes) then
    raise exception 'api_scope_missing:%', array_to_string(p_scopes, '|') using errcode = 'P0001';
  end if;
  if t.pledge_signed_at is null and p_scopes <@ array['feed:interact', 'tools:submit']::text[] then
    raise exception 'agent_pledge_required' using errcode = 'P0001';
  end if;
  if p_scopes <@ public.api__write_scopes() then
    perform public.api__rate_check(t.id);
  end if;
  perform public.api__touch_token(t.id, p_token, null);
  return t;
end;
$$;

create or replace function public.api__token_any(p_token text)
returns api_tokens
language plpgsql security definer set search_path to 'public' as $$
declare t public.api_tokens%rowtype;
begin
  t := public.api__find_token(p_token);
  if t.id is null then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  perform public.api__touch_token(t.id, p_token, null);
  return t;
end;
$$;

create or replace function public.agora__token(p_token text, p_write boolean)
returns api_tokens
language plpgsql security definer set search_path to 'public' as $$
declare
  t public.api_tokens%rowtype;
  v_scopes text[];
  ok boolean;
begin
  t := public.api__find_token(p_token);
  if t.id is null then raise exception 'agora_unauthorized' using errcode = 'P0001'; end if;
  v_scopes := array(select btrim(s) from unnest(string_to_array(t.scopes, ',')) s);
  if p_write then
    ok := 'agora:write' = any(v_scopes);
  else
    ok := 'agora:write' = any(v_scopes) or 'agora:read' = any(v_scopes);
  end if;
  if not ok then raise exception 'agora_scope_missing' using errcode = 'P0001'; end if;
  if p_write and t.pledge_signed_at is null then
    raise exception 'agent_pledge_required' using errcode = 'P0001';
  end if;
  if p_write then perform public.api__rate_check(t.id); end if;
  perform public.api__touch_token(t.id, p_token, null);
  return t;
end;
$$;

create or replace function public.mcp_ping(p_token text, p_client text default null::text)
returns boolean
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype;
begin
  t := public.api__find_token(p_token);
  if t.id is null then return false; end if;
  perform public.api__touch_token(t.id, p_token, p_client);
  return true;
end;
$$;

create or replace function public.mcp_token_scopes(p_token text)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_admin boolean;
begin
  t := public.api__find_token(p_token);
  if t.id is null then return null; end if;
  select m.is_admin into v_admin from public.members m
   where m.id = t.member_id and m.signup_completed_at is not null and not m.is_banned;
  if not found then return null; end if;
  return jsonb_build_object(
    'scopes', to_jsonb(array(select btrim(s) from unnest(string_to_array(t.scopes, ',')) s where btrim(s) <> '')),
    'admin', coalesce(v_admin, false));
end;
$$;

create or replace function public.mcp_token_check(p_token text)
returns boolean
language sql stable security definer set search_path to '' as $$
  select public.api__find_token(p_token) is not null;
$$;

-- mcp_usage_begin: accept a pending secret so a first tools/call still records usage (body = 0115).
CREATE OR REPLACE FUNCTION public.mcp_usage_begin(p_token text, p_tool text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t public.api_tokens%rowtype;
  l jsonb := public.mcp__limits();
  tok_min integer; tok_day integer; mem_min integer; mem_day integer;
  v_scope text; v_window text; v_limit integer; v_oldest timestamptz; v_id bigint;
  v_tool text := left(coalesce(nullif(regexp_replace(btrim(coalesce(p_tool, '')), '[^A-Za-z0-9_:/.-]', '', 'g'), ''), 'unknown'), 64);
begin
  t := public.api__find_token(p_token);
  if t.id is null then return jsonb_build_object('ok', true, 'id', null); end if;

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
end $function$;

-- ---------------------------------------------------------------- safe rotate: prepare / commit / cancel
create or replace function public.api_token_rotate(p_token uuid, p_hash text, p_prefix text)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  v_owner uuid;
  v_revoked boolean;
  v_admin boolean := false;
  v_forced boolean;
  v_n int;
  v_at timestamptz := now();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_prefix is null or p_prefix !~ '^aisubal_[0-9a-f]{4}$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  select member_id, is_revoked into v_owner, v_revoked from public.api_tokens where id = p_token for update;
  if not found or v_revoked then raise exception 'token_not_found' using errcode = 'P0002'; end if;
  select (m.is_admin and not m.is_banned) into v_admin from public.members m where m.id = v_me;
  v_forced := v_owner <> v_me;
  if v_forced and not coalesce(v_admin, false) then raise exception 'token_not_found' using errcode = 'P0002'; end if;
  if not v_forced then
    select count(*) into v_n from public.api_token_rotations r where r.token_id = p_token and r.rotated_at > v_at - interval '1 hour';
    if v_n >= 3 then raise exception 'rotate_rate_limited' using errcode = 'P0001'; end if;
    select count(*) into v_n from public.api_token_rotations r where r.rotated_by = v_me and r.rotated_at > v_at - interval '1 day';
    if v_n >= 10 then raise exception 'rotate_rate_limited' using errcode = 'P0001'; end if;
  end if;
  if exists (select 1 from public.api_tokens where token_hash = p_hash or pending_token_hash = p_hash) then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  update public.api_tokens
     set pending_token_hash = p_hash,
         pending_token_prefix = p_prefix,
         pending_created_at = v_at
   where id = p_token;
  insert into public.api_token_rotations (token_id, member_id, rotated_by, forced) values (p_token, v_owner, v_me, v_forced);
  return jsonb_build_object('id', p_token, 'prepared_at', v_at, 'pending', true, 'forced', v_forced);
end;
$$;

create or replace function public.api_token_rotate_commit(p_token uuid)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  t public.api_tokens%rowtype;
  v_admin boolean := false;
  v_at timestamptz := now();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into t from public.api_tokens where id = p_token for update;
  if not found or t.is_revoked then raise exception 'token_not_found' using errcode = 'P0002'; end if;
  if t.pending_token_hash is null then raise exception 'rotate_not_pending' using errcode = 'P0001'; end if;
  select (m.is_admin and not m.is_banned) into v_admin from public.members m where m.id = v_me;
  if t.member_id <> v_me and not coalesce(v_admin, false) then raise exception 'token_not_found' using errcode = 'P0002'; end if;
  update public.api_tokens set
    token_hash = pending_token_hash,
    token_prefix = pending_token_prefix,
    rotated_at = v_at,
    last_client_info = null,
    oauth_client_id = null,
    access_expires_at = null,
    pending_token_hash = null,
    pending_token_prefix = null,
    pending_created_at = null
  where id = p_token;
  update public.oauth_refresh_tokens set revoked_at = coalesce(revoked_at, v_at) where token_id = p_token;
  return jsonb_build_object('id', p_token, 'rotated_at', v_at, 'pending', false);
end;
$$;

create or replace function public.api_token_rotate_cancel(p_token uuid)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  t public.api_tokens%rowtype;
  v_admin boolean := false;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into t from public.api_tokens where id = p_token for update;
  if not found or t.is_revoked then raise exception 'token_not_found' using errcode = 'P0002'; end if;
  select (m.is_admin and not m.is_banned) into v_admin from public.members m where m.id = v_me;
  if t.member_id <> v_me and not coalesce(v_admin, false) then raise exception 'token_not_found' using errcode = 'P0002'; end if;
  update public.api_tokens set
    pending_token_hash = null,
    pending_token_prefix = null,
    pending_created_at = null
  where id = p_token;
  return jsonb_build_object('id', p_token, 'pending', false);
end;
$$;

revoke all on function public.api_token_rotate_commit(uuid), public.api_token_rotate_cancel(uuid) from public, anon;
grant execute on function public.api_token_rotate_commit(uuid), public.api_token_rotate_cancel(uuid) to authenticated;

-- onboarding status includes version + pending prefix (never the hash)
create or replace function public.agent_onboarding_status(p_token_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_me uuid := public.app__me();
  t public.api_tokens%rowtype;
  m public.agent_mentions%rowtype;
  r public.posts%rowtype;
  v_ver text := public.mcp_config_version();
begin
  if v_me is null then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  select * into t from public.api_tokens where id = p_token_id and member_id = v_me and not is_revoked;
  if not found then raise exception 'token_not_found' using errcode = 'P0001'; end if;
  select am.* into m
    from public.agent_mentions am
    join public.posts p on p.id = am.source_id
   where am.token_id = t.id and am.source_kind = 'feed' and p.onboarding_test and p.deleted_at is null
   order by am.created_at desc
   limit 1;
  if found and m.reply_id is not null then
    select * into r from public.posts where id = m.reply_id;
  end if;
  return jsonb_build_object(
    'connected', t.first_used_at is not null,
    'firstUsedAt', t.first_used_at,
    'lastUsedAt', t.last_used_at,
    'clientInfo', t.last_client_info,
    'mcpConfigVersion', t.mcp_config_version,
    'currentVersion', v_ver,
    'needsUpdate', t.last_used_at is not null and t.mcp_config_version is distinct from v_ver,
    'pendingPrefix', t.pending_token_prefix,
    'pendingAt', t.pending_created_at,
    'test', case when m.id is null then null else jsonb_build_object(
      'mentionId', m.id,
      'postId', m.source_id,
      'rootId', coalesce(m.root_id, m.source_id),
      'url', '/posts/' || coalesce(m.root_id, m.source_id),
      'createdAt', m.created_at,
      'replied', m.answered_at is not null,
      'replyId', m.reply_id,
      'replyUrl', case when m.reply_id is not null then '/posts/' || coalesce(m.root_id, m.source_id) else null end,
      'replyBody', case when r.id is not null then left(r.content, 500) else null end
    ) end
  );
end;
$$;
