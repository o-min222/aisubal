-- AI-7 (P0): 0115 added api_tokens.oauth_client_id / access_expires_at without the column SELECT grant that
-- every other member-visible api_tokens column has (0011, 0018, 0020, 0050, 0061, 0066). TOKEN_COLS
-- (src/lib/data/tokens.ts) and myOAuthAgents (src/lib/data/oauth.ts) read them, so the select failed with
-- "permission denied" → GET /api/tokens 500 → 내 에이전트 showed "no agents". RLS (api_tokens_owner) still
-- limits rows to the owner; token_hash stays unreadable.
grant select (oauth_client_id, access_expires_at) on public.api_tokens to authenticated;
