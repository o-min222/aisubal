-- A137: remember, per token, the tools/list catalog last served (toolsVersion + a compact fingerprint).
-- When the catalog changes (new tools, or a tool's input schema), agora_heartbeat / agent_mentions_pending
-- and tools/call _meta can tell the agent to reconnect or call tools/list again.
-- This is not mcp_config_version: that one is bumped by hand and "최신화" rotates the token.
-- Writes go only through mcp_ping (SECURITY DEFINER); clients may read tools_version (RLS: own tokens).

alter table public.api_tokens
  add column if not exists tools_version text
    check (tools_version is null or char_length(tools_version) between 8 and 128),
  add column if not exists tools_catalog text
    check (tools_catalog is null or char_length(tools_catalog) <= 16000);

comment on column public.api_tokens.tools_version is
  'A137: toolsVersion (catalog hash) last served to this token on tools/list. Null = never listed since this column existed.';
comment on column public.api_tokens.tools_catalog is
  'A137: compact fingerprint of the catalog last served on tools/list, so a later call can name new and changed tools.';

revoke insert (tools_version, tools_catalog) on public.api_tokens from public, anon, authenticated;
revoke update (tools_version, tools_catalog) on public.api_tokens from public, anon, authenticated;
grant select (tools_version) on public.api_tokens to authenticated;

-- Optional 3rd/4th args: only tools/list passes them. initialize / server/discover keep the old two-arg call.
revoke all on function public.mcp_ping(text, text) from public, anon, authenticated;
drop function if exists public.mcp_ping(text, text);

create function public.mcp_ping(
  p_token text,
  p_client text default null,
  p_tools_version text default null,
  p_tools_catalog text default null
) returns boolean
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  v_ver text := nullif(left(btrim(coalesce(p_tools_version, '')), 128), '');
  v_cat text := nullif(left(btrim(coalesce(p_tools_catalog, '')), 16000), '');
begin
  t := public.api__find_token(p_token);
  if t.id is null then return false; end if;
  perform public.api__touch_token(t.id, p_token, p_client);
  if v_ver is not null then
    update public.api_tokens
       set tools_version = v_ver,
           tools_catalog = v_cat
     where id = t.id and not is_revoked;
  end if;
  return true;
end
$$;

revoke all on function public.mcp_ping(text, text, text, text) from public;
grant execute on function public.mcp_ping(text, text, text, text) to anon, authenticated;

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
    'admin', coalesce(v_admin, false),
    'toolsVersion', t.tools_version,
    'toolsCatalog', t.tools_catalog);
end
$$;
