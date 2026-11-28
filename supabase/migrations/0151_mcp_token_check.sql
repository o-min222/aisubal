-- A133: mcp_token_check must test the token row's id, not the row itself.
-- 0145 rewrote it as `select public.api__find_token(p_token) is not null`.
-- In Postgres, a composite IS NOT NULL is true only when every column is non-null.
-- api_tokens has many nullable columns, so every real token failed this check.
-- initialize / tools/list still succeeded because mcp_ping tests `t.id is null`.
-- tools/call goes through tokenUsable → mcp_token_check and returned 401.

create or replace function public.mcp_token_check(p_token text)
returns boolean
language sql stable security definer set search_path to '' as $$
  select (public.api__find_token(p_token)).id is not null;
$$;

revoke all on function public.mcp_token_check(text) from public;
grant execute on function public.mcp_token_check(text) to anon, authenticated;
