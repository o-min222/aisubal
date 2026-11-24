-- A66 P4: OAuth 2.1 (PKCE, DCR, refresh rotation) for MCP clients. Pasted tokens unchanged.
-- Generated from the live definitions by aisubal-notes/a66/scripts/gen-0115.py

-- ---------------------------------------------------------------------------
-- OAuth 2.1 for MCP clients (authorization code + PKCE S256, dynamic client registration, refresh rotation)
-- An OAuth connection IS an agent record: one api_tokens row per authorized agent. Its token_hash is the
-- current access token (rotated on every refresh); access_expires_at bounds it. Pasted tokens leave both
-- new columns null and behave exactly as before.
-- ---------------------------------------------------------------------------
alter table public.api_tokens
  add column if not exists oauth_client_id text,
  add column if not exists access_expires_at timestamptz;

create table if not exists public.oauth_clients (
  client_id text primary key,
  client_name text not null check (char_length(client_name) between 1 and 80),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  client_uri text check (client_uri is null or char_length(client_uri) <= 300),
  software_id text check (software_id is null or char_length(software_id) <= 120),
  software_version text check (software_version is null or char_length(software_version) <= 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists oauth_clients_created_idx on public.oauth_clients (created_at);

alter table public.api_tokens drop constraint if exists api_tokens_oauth_client_fkey;
alter table public.api_tokens add constraint api_tokens_oauth_client_fkey
  foreign key (oauth_client_id) references public.oauth_clients (client_id) on delete set null;

create table if not exists public.oauth_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  scopes text not null,
  agent_name text not null check (char_length(btrim(agent_name)) between 1 and 40),
  token_id uuid references public.api_tokens (id) on delete cascade,
  resource text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  issued_token_id uuid references public.api_tokens (id) on delete set null
);
create index if not exists oauth_codes_created_idx on public.oauth_codes (created_at);

create table if not exists public.oauth_refresh_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  token_id uuid not null references public.api_tokens (id) on delete cascade,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists oauth_refresh_token_idx on public.oauth_refresh_tokens (token_id);

alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_refresh_tokens enable row level security;
revoke all on table public.oauth_clients, public.oauth_codes, public.oauth_refresh_tokens from public, anon, authenticated;

-- token checks: an OAuth access token also stops at access_expires_at (one added condition each)
CREATE OR REPLACE FUNCTION public.api__token(p_token text, p_scopes text[])
 RETURNS api_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_scopes TEXT[];
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'api_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM public.api_tokens
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND is_revoked = FALSE
  LIMIT 1;
  IF NOT FOUND OR (t.expires_at IS NOT NULL AND t.expires_at < NOW() OR (t.access_expires_at IS NOT NULL AND t.access_expires_at < NOW())) THEN
    RAISE EXCEPTION 'api_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = t.member_id AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE
  ) THEN
    RAISE EXCEPTION 'api_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  v_scopes := ARRAY(SELECT btrim(s) FROM unnest(string_to_array(t.scopes, ',')) s);
  IF NOT (v_scopes && p_scopes) THEN
    RAISE EXCEPTION 'api_scope_missing:%', array_to_string(p_scopes, '|') USING ERRCODE = 'P0001';
  END IF;
  -- write-only calls need the agent pledge (reads that also accept a read scope stay open)
  IF t.pledge_signed_at IS NULL AND p_scopes <@ ARRAY['feed:interact', 'tools:submit']::text[] THEN
    RAISE EXCEPTION 'agent_pledge_required' USING ERRCODE = 'P0001';
  END IF;
  -- 0037: write-only calls are rate limited per agent
  IF p_scopes <@ public.api__write_scopes() THEN
    PERFORM public.api__rate_check(t.id);
  END IF;
  UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = t.id;
  RETURN t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.api__token_any(p_token text)
 RETURNS api_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t public.api_tokens%rowtype;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  select * into t from public.api_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and is_revoked = false limit 1;
  if not found or (t.expires_at is not null and t.expires_at < now() OR (t.access_expires_at IS NOT NULL AND t.access_expires_at < NOW())) then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.id = t.member_id and m.signup_completed_at is not null and m.is_banned = false) then
    raise exception 'api_unauthorized' using errcode = 'P0001';
  end if;
  update public.api_tokens set last_used_at = now() where id = t.id;
  return t;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agora__token(p_token text, p_write boolean)
 RETURNS api_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_scopes TEXT[];
  ok BOOLEAN;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'agora_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM public.api_tokens
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND is_revoked = FALSE
  LIMIT 1;
  IF NOT FOUND OR (t.expires_at IS NOT NULL AND t.expires_at < NOW() OR (t.access_expires_at IS NOT NULL AND t.access_expires_at < NOW())) THEN
    RAISE EXCEPTION 'agora_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = t.member_id AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE
  ) THEN
    RAISE EXCEPTION 'agora_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  v_scopes := ARRAY(SELECT btrim(s) FROM unnest(string_to_array(t.scopes, ',')) s);
  IF p_write THEN
    ok := 'agora:write' = ANY(v_scopes);
  ELSE
    ok := 'agora:write' = ANY(v_scopes) OR 'agora:read' = ANY(v_scopes);
  END IF;
  IF NOT ok THEN
    RAISE EXCEPTION 'agora_scope_missing' USING ERRCODE = 'P0001';
  END IF;
  IF p_write AND t.pledge_signed_at IS NULL THEN
    RAISE EXCEPTION 'agent_pledge_required' USING ERRCODE = 'P0001';
  END IF;
  -- 0037: per-agent write rate limit
  IF p_write THEN PERFORM public.api__rate_check(t.id); END IF;
  UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = t.id;
  RETURN t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_ping(p_token text, p_client text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN FALSE; END IF;
  SELECT * INTO t FROM public.api_tokens
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND is_revoked = FALSE LIMIT 1;
  IF NOT FOUND OR (t.expires_at IS NOT NULL AND t.expires_at < NOW() OR (t.access_expires_at IS NOT NULL AND t.access_expires_at < NOW())) THEN RETURN FALSE; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = t.member_id AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned) THEN
    RETURN FALSE;
  END IF;
  UPDATE public.api_tokens SET last_used_at = NOW(),
    last_client_info = COALESCE(NULLIF(left(regexp_replace(btrim(COALESCE(p_client, '')), '[[:cntrl:]<>]', '', 'g'), 80), ''), last_client_info)
  WHERE id = t.id;
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_token_scopes(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t public.api_tokens%ROWTYPE; v_admin BOOLEAN;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.api_tokens
   WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND is_revoked = FALSE LIMIT 1;
  IF NOT FOUND OR (t.expires_at IS NOT NULL AND t.expires_at < NOW() OR (t.access_expires_at IS NOT NULL AND t.access_expires_at < NOW())) THEN RETURN NULL; END IF;
  SELECT m.is_admin INTO v_admin FROM public.members m
   WHERE m.id = t.member_id AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'scopes', to_jsonb(ARRAY(SELECT btrim(s) FROM unnest(string_to_array(t.scopes, ',')) s WHERE btrim(s) <> '')),
    'admin', COALESCE(v_admin, FALSE));
END;
$function$;

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
  if p_token is null or length(p_token) < 16 then return jsonb_build_object('ok', true, 'id', null); end if;
  select * into t from public.api_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and not is_revoked limit 1;
  if not found or (t.expires_at is not null and t.expires_at < now() OR (t.access_expires_at IS NOT NULL AND t.access_expires_at < NOW())) then return jsonb_build_object('ok', true, 'id', null); end if;

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

-- 새 토큰 발급 on an OAuth agent: it becomes a pasted-token agent (refresh tokens revoked)
CREATE OR REPLACE FUNCTION public.api_token_rotate(p_token uuid, p_hash text, p_prefix text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me uuid := public.current_member_id();
  v_owner uuid;
  v_revoked boolean;
  v_admin boolean := false;
  v_forced boolean;
  v_n int;
  v_at timestamptz := now();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_prefix IS NULL OR p_prefix !~ '^aisubal_[0-9a-f]{4}$' THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  SELECT member_id, is_revoked INTO v_owner, v_revoked FROM public.api_tokens WHERE id = p_token FOR UPDATE;
  IF NOT FOUND OR v_revoked THEN RAISE EXCEPTION 'token_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT (m.is_admin AND NOT m.is_banned) INTO v_admin FROM public.members m WHERE m.id = v_me;
  v_forced := v_owner <> v_me;
  IF v_forced AND NOT coalesce(v_admin, false) THEN RAISE EXCEPTION 'token_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_forced THEN
    SELECT count(*) INTO v_n FROM public.api_token_rotations r WHERE r.token_id = p_token AND r.rotated_at > v_at - interval '1 hour';
    IF v_n >= 3 THEN RAISE EXCEPTION 'rotate_rate_limited' USING ERRCODE = 'P0001'; END IF;
    SELECT count(*) INTO v_n FROM public.api_token_rotations r WHERE r.rotated_by = v_me AND r.rotated_at > v_at - interval '1 day';
    IF v_n >= 10 THEN RAISE EXCEPTION 'rotate_rate_limited' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.api_tokens WHERE token_hash = p_hash) THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  UPDATE public.api_tokens
     SET token_hash = p_hash, token_prefix = p_prefix, rotated_at = v_at, last_client_info = NULL, oauth_client_id = NULL, access_expires_at = NULL
   WHERE id = p_token;
  UPDATE public.oauth_refresh_tokens SET revoked_at = coalesce(revoked_at, v_at) WHERE token_id = p_token;
  INSERT INTO public.api_token_rotations (token_id, member_id, rotated_by, forced) VALUES (p_token, v_owner, v_me, v_forced);
  RETURN jsonb_build_object('id', p_token, 'rotated_at', v_at, 'forced', v_forced);
END;
$function$;

-- scopes a member may grant over OAuth (same set as a pasted token from 내 AI 연결하기; tools:review admins only)
create or replace function public.oauth__allowed_scopes(p_member uuid) returns text[]
language sql stable security definer set search_path to '' as $$
  select array['posts_read', 'meetups_read', 'toolbox_read', 'archive:read', 'archive:write', 'agora:read', 'agora:write', 'feed:interact', 'tools:submit']
    || case when exists (select 1 from public.members m where m.id = p_member and m.is_admin and not m.is_banned) then array['tools:review'] else array[]::text[] end
$$;

create or replace function public.oauth__member_ok(p_member uuid) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.members m where m.id = p_member and m.signup_completed_at is not null and not m.is_banned)
$$;

-- RFC 7591 registration (public clients only). Redirect URIs are validated by the app before this call.
create or replace function public.oauth_client_register(p_name text, p_redirect_uris text[], p_client_uri text default null,
  p_software_id text default null, p_software_version text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_id text; v_at timestamptz := now(); v_u text;
begin
  if p_redirect_uris is null or cardinality(p_redirect_uris) not between 1 and 10 then raise exception 'invalid_redirect_uri' using errcode = '22023'; end if;
  foreach v_u in array p_redirect_uris loop
    if v_u is null or char_length(v_u) > 500 or v_u !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' or v_u ~ '#' then raise exception 'invalid_redirect_uri' using errcode = '22023'; end if;
  end loop;
  -- spam guard: registration is open to anyone, so cap it globally
  if (select count(*) from public.oauth_clients c where c.created_at > v_at - interval '1 hour') >= 300 then
    raise exception 'registration_rate_limited' using errcode = 'P0001';
  end if;
  v_id := 'aisubal-' || encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.oauth_clients (client_id, client_name, redirect_uris, client_uri, software_id, software_version, created_at)
  values (v_id, left(coalesce(nullif(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '<[^>]*>', '', 'g'), '[[:cntrl:]<>]', '', 'g')), ''), 'MCP client'), 80), p_redirect_uris,
          nullif(left(p_client_uri, 300), ''), nullif(left(p_software_id, 120), ''), nullif(left(p_software_version, 60), ''), v_at);
  return jsonb_build_object('clientId', v_id, 'issuedAt', extract(epoch from v_at)::bigint);
end $$;

create or replace function public.oauth_client_get(p_client_id text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('clientId', c.client_id, 'name', c.client_name, 'redirectUris', to_jsonb(c.redirect_uris), 'clientUri', c.client_uri, 'createdAt', c.created_at)
    from public.oauth_clients c where c.client_id = p_client_id
$$;

-- the signed-in member approves: one-time code (10 min) bound to client, redirect URI, PKCE challenge, scopes and agent
create or replace function public.oauth_code_create(p_code_hash text, p_client_id text, p_redirect_uri text, p_challenge text,
  p_scopes text[], p_agent_name text, p_token_id uuid default null, p_resource text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_c public.oauth_clients%rowtype; v_scopes text[]; v_bad text[];
begin
  if v_me is null or not public.oauth__member_ok(v_me) then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_c from public.oauth_clients where client_id = p_client_id;
  if not found then raise exception 'invalid_client' using errcode = '22023'; end if;
  if not (p_redirect_uri = any (v_c.redirect_uris)) then raise exception 'invalid_redirect_uri' using errcode = '22023'; end if;
  v_scopes := array(select distinct btrim(s) from unnest(coalesce(p_scopes, array[]::text[])) s where btrim(s) <> '');
  v_bad := array(select s from unnest(v_scopes) s where not (s = any (public.oauth__allowed_scopes(v_me))));
  if cardinality(v_scopes) = 0 or cardinality(v_bad) > 0 then raise exception 'invalid_scope' using errcode = '22023'; end if;
  if p_token_id is not null and not exists (
    select 1 from public.api_tokens t where t.id = p_token_id and t.member_id = v_me and not t.is_revoked and t.oauth_client_id is not null) then
    raise exception 'token_not_found' using errcode = 'P0002';
  end if;
  -- a member can only approve so fast (stops a hostile page from looping consent)
  if (select count(*) from public.oauth_codes c where c.member_id = v_me and c.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'authorize_rate_limited' using errcode = 'P0001';
  end if;
  insert into public.oauth_codes (code_hash, client_id, member_id, redirect_uri, code_challenge, scopes, agent_name, token_id, resource, expires_at)
  values (p_code_hash, p_client_id, v_me, p_redirect_uri, p_challenge, array_to_string(v_scopes, ','), btrim(p_agent_name), p_token_id, nullif(left(p_resource, 300), ''), now() + interval '10 minutes');
  return jsonb_build_object('ok', true);
end $$;

-- kill every credential an OAuth agent holds (code replay / refresh replay / revoke)
create or replace function public.oauth__kill(p_token_id uuid) returns void
language sql security definer set search_path to '' as $$
  update public.oauth_refresh_tokens set revoked_at = coalesce(revoked_at, now()) where token_id = p_token_id;
  update public.api_tokens set access_expires_at = now() - interval '1 second' where id = p_token_id and oauth_client_id is not null;
$$;

-- token endpoint, grant_type=authorization_code. The app computes S256(code_verifier) and fresh token hashes.
-- Grant failures RETURN {error:'invalid_grant'} (never raise), so a replay's revocation is not rolled back.
create or replace function public.oauth_token_exchange(p_code_hash text, p_client_id text, p_redirect_uri text, p_verifier_challenge text,
  p_access_hash text, p_access_prefix text, p_refresh_hash text, p_access_ttl integer, p_refresh_ttl integer) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.oauth_codes%rowtype; v_tid uuid; v_now timestamptz := now();
begin
  if p_access_hash !~ '^[0-9a-f]{64}$' or p_refresh_hash !~ '^[0-9a-f]{64}$' or p_access_prefix !~ '^aisubal_[0-9a-f]{4}$' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select * into c from public.oauth_codes where code_hash = p_code_hash for update;
  if not found then return jsonb_build_object('error', 'invalid_grant'); end if;
  if c.used_at is not null then
    -- RFC 6749 4.1.2: a replayed code revokes what it issued
    if c.issued_token_id is not null then perform public.oauth__kill(c.issued_token_id); end if;
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  if c.expires_at < v_now or c.client_id <> p_client_id or c.redirect_uri <> p_redirect_uri or c.code_challenge <> p_verifier_challenge then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  if not public.oauth__member_ok(c.member_id) then return jsonb_build_object('error', 'invalid_grant'); end if;
  if c.token_id is not null then
    update public.api_tokens set token_hash = p_access_hash, token_prefix = p_access_prefix, scopes = c.scopes, oauth_client_id = c.client_id,
           access_expires_at = v_now + make_interval(secs => p_access_ttl), rotated_at = v_now
     where id = c.token_id and member_id = c.member_id and not is_revoked
     returning id into v_tid;
    if v_tid is null then return jsonb_build_object('error', 'invalid_grant'); end if;
    update public.oauth_refresh_tokens set revoked_at = coalesce(revoked_at, v_now) where token_id = v_tid;
  else
    insert into public.api_tokens (member_id, name, agent_name, token_hash, token_prefix, scopes, oauth_client_id, access_expires_at, show_on_profile)
    values (c.member_id, c.agent_name, c.agent_name, p_access_hash, p_access_prefix, c.scopes, c.client_id, v_now + make_interval(secs => p_access_ttl), false)
    returning id into v_tid;
  end if;
  insert into public.oauth_refresh_tokens (token_hash, token_id, client_id, expires_at) values (p_refresh_hash, v_tid, c.client_id, v_now + make_interval(secs => p_refresh_ttl));
  update public.oauth_codes set used_at = v_now, issued_token_id = v_tid where code_hash = c.code_hash;
  update public.oauth_clients set last_used_at = v_now where client_id = c.client_id;
  return jsonb_build_object('tokenId', v_tid, 'scope', replace(c.scopes, ',', ' '), 'expiresIn', p_access_ttl);
end $$;

-- token endpoint, grant_type=refresh_token (one-time refresh tokens; replay kills the agent's credentials)
create or replace function public.oauth_token_refresh(p_refresh_hash text, p_client_id text, p_access_hash text, p_access_prefix text,
  p_new_refresh_hash text, p_access_ttl integer, p_refresh_ttl integer) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r public.oauth_refresh_tokens%rowtype; t public.api_tokens%rowtype; v_now timestamptz := now();
begin
  if p_access_hash !~ '^[0-9a-f]{64}$' or p_new_refresh_hash !~ '^[0-9a-f]{64}$' or p_access_prefix !~ '^aisubal_[0-9a-f]{4}$' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select * into r from public.oauth_refresh_tokens where token_hash = p_refresh_hash for update;
  if not found or r.client_id <> p_client_id then return jsonb_build_object('error', 'invalid_grant'); end if;
  if r.used_at is not null or r.revoked_at is not null then
    if r.used_at is not null then perform public.oauth__kill(r.token_id); end if;
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  select * into t from public.api_tokens where id = r.token_id for update;
  if r.expires_at < v_now or not found or t.is_revoked or (t.expires_at is not null and t.expires_at < v_now)
     or t.oauth_client_id is distinct from r.client_id or not public.oauth__member_ok(t.member_id) then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  update public.oauth_refresh_tokens set used_at = v_now where token_hash = r.token_hash;
  update public.api_tokens set token_hash = p_access_hash, token_prefix = p_access_prefix, access_expires_at = v_now + make_interval(secs => p_access_ttl), rotated_at = v_now
   where id = t.id;
  insert into public.oauth_refresh_tokens (token_hash, token_id, client_id, expires_at) values (p_new_refresh_hash, t.id, r.client_id, v_now + make_interval(secs => p_refresh_ttl));
  update public.oauth_clients set last_used_at = v_now where client_id = r.client_id;
  return jsonb_build_object('tokenId', t.id, 'scope', replace(t.scopes, ',', ' '), 'expiresIn', p_access_ttl);
end $$;

-- RFC 7009: revoke an OAuth access or refresh token (the agent record stays; reconnect re-authorizes it).
-- Pasted tokens are not revocable here (the owner disconnects them on the agent page).
create or replace function public.oauth_revoke(p_hash text, p_client_id text) returns void
language plpgsql security definer set search_path to '' as $$
declare v_tid uuid;
begin
  select token_id into v_tid from public.oauth_refresh_tokens where token_hash = p_hash and client_id = p_client_id;
  if v_tid is null then select id into v_tid from public.api_tokens where token_hash = p_hash and oauth_client_id = p_client_id; end if;
  if v_tid is not null then perform public.oauth__kill(v_tid); end if;
end $$;

-- every MCP request (not just the handshake): is this bearer usable right now? (401 + WWW-Authenticate otherwise)
create or replace function public.mcp_token_check(p_token text) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select true from public.api_tokens t join public.members m on m.id = t.member_id
     where p_token is not null and length(p_token) >= 16 and t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
       and not t.is_revoked and (t.expires_at is null or t.expires_at > now()) and (t.access_expires_at is null or t.access_expires_at > now())
       and m.signup_completed_at is not null and not m.is_banned limit 1), false)
$$;

create or replace function public.oauth__prune() returns void
language sql security definer set search_path to '' as $$
  delete from public.oauth_codes where created_at < now() - interval '1 day';
  delete from public.oauth_refresh_tokens where expires_at < now() - interval '7 days' or coalesce(used_at, revoked_at) < now() - interval '7 days';
  delete from public.oauth_clients c where c.created_at < now() - interval '30 days'
    and not exists (select 1 from public.api_tokens t where t.oauth_client_id = c.client_id)
    and not exists (select 1 from public.oauth_codes k where k.client_id = c.client_id);
$$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'oauth-prune') then perform cron.unschedule('oauth-prune'); end if;
  perform cron.schedule('oauth-prune', '47 18 * * *', 'select public.oauth__prune()');
end $$;

revoke all on function public.oauth__allowed_scopes(uuid), public.oauth__member_ok(uuid), public.oauth__kill(uuid), public.oauth__prune() from public, anon, authenticated;
revoke all on function public.oauth_client_register(text, text[], text, text, text), public.oauth_client_get(text),
  public.oauth_code_create(text, text, text, text, text[], text, uuid, text),
  public.oauth_token_exchange(text, text, text, text, text, text, text, integer, integer),
  public.oauth_token_refresh(text, text, text, text, text, integer, integer),
  public.oauth_revoke(text, text), public.mcp_token_check(text) from public;
grant execute on function public.oauth_client_register(text, text[], text, text, text), public.oauth_client_get(text),
  public.oauth_token_exchange(text, text, text, text, text, text, text, integer, integer),
  public.oauth_token_refresh(text, text, text, text, text, integer, integer),
  public.oauth_revoke(text, text), public.mcp_token_check(text) to anon, authenticated;
grant execute on function public.oauth_code_create(text, text, text, text, text[], text, uuid, text) to authenticated;
revoke execute on function public.oauth_code_create(text, text, text, text, text[], text, uuid, text) from anon;
