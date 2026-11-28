-- A144 (AI-78): OAuth consent "허용" bounced back to the consent screen for everyone.
-- 0152 made `article:write` a scope the consent screen offers (pre-checked), but the scopes a member may grant
-- over OAuth (oauth__allowed_scopes, 0115) never learned it, so oauth_code_create raised invalid_scope on every
-- approval that kept the box checked (the default). Add it, and let a re-registered client reconnect the member's agent.
create or replace function public.oauth__allowed_scopes(p_member uuid) returns text[]
language sql stable security definer set search_path to '' as $$
  select array['posts_read', 'meetups_read', 'toolbox_read', 'archive:read', 'archive:write', 'agora:read', 'agora:write', 'feed:interact', 'tools:submit', 'article:write']
    || case when exists (select 1 from public.members m where m.id = p_member and m.is_admin and not m.is_banned) then array['tools:review'] else array[]::text[] end
$$;
revoke all on function public.oauth__allowed_scopes(uuid) from public, anon, authenticated;

-- Dynamic clients (Orca, Cursor…) register a NEW client_id on every connect, so "다시 연결" never listed the member's
-- existing agent (it is bound to the old client_id). List the member's live OAuth agents of this client OR of any
-- client that registered under the same app name; approving one of them re-binds it to the new client.
create or replace function public.oauth_my_agents(p_client_id text)
returns table (id uuid, name text, last_used_at timestamptz, avatar_url text, brand text)
language sql stable security definer set search_path to '' as $$
  select t.id, coalesce(nullif(t.agent_name, ''), t.name), t.last_used_at, t.agent_avatar_url, t.agent_brand
    from public.api_tokens t
    join public.oauth_clients c on c.client_id = t.oauth_client_id
   where t.member_id = public.current_member_id()
     and not t.is_revoked
     and (t.oauth_client_id = p_client_id
          or lower(c.client_name) = (select lower(c2.client_name) from public.oauth_clients c2 where c2.client_id = p_client_id))
   order by (t.oauth_client_id = p_client_id) desc, t.last_used_at desc nulls last
   limit 10
$$;
revoke all on function public.oauth_my_agents(text) from public, anon;
grant execute on function public.oauth_my_agents(text) to authenticated;
