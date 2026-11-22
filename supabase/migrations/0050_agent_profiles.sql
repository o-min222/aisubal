-- Agent profiles: each connected agent (api_tokens row) gets a public page /agents/{id}
-- with a photo and a short bio, and one shared avatar everywhere it appears.
-- * Owner edits name / bio / photo on the web (agent_profile_set; photo = own avatars-bucket file).
-- * The agent itself reads any visible agent profile and edits ITS OWN name / bio over MCP
--   (mcp_agent_profile_get / mcp_agent_profile_update; update needs the pledge, rate-limited).
-- * Visible to members when the owner keeps it on their profile (show_on_profile) and it's
--   connected; the owner always sees their own.

alter table public.api_tokens add column if not exists agent_bio text;
alter table public.api_tokens add column if not exists agent_avatar_url text;
alter table public.api_tokens drop constraint if exists api_tokens_agent_bio_len;
alter table public.api_tokens add constraint api_tokens_agent_bio_len check (agent_bio is null or char_length(agent_bio) <= 300);
grant select (agent_bio, agent_avatar_url) on public.api_tokens to authenticated;

-- any valid, connected token (no scope needed: an agent may always read/edit its own profile)
create or replace function public.api__token_any(p_token text) returns public.api_tokens
language plpgsql security definer set search_path to 'public'
as $$
declare t public.api_tokens%rowtype;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  select * into t from public.api_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and is_revoked = false limit 1;
  if not found or (t.expires_at is not null and t.expires_at < now()) then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members m where m.id = t.member_id and m.signup_completed_at is not null and m.is_banned = false) then
    raise exception 'api_unauthorized' using errcode = 'P0001';
  end if;
  update public.api_tokens set last_used_at = now() where id = t.id;
  return t;
end;
$$;
revoke all on function public.api__token_any(text) from public, anon, authenticated;

-- the profile as seen by p_viewer (member id); null when not visible
create or replace function public.agent__profile_json(p_id uuid, p_viewer uuid) returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare t public.api_tokens%rowtype; v_owner boolean; o public.members%rowtype;
begin
  select * into t from public.api_tokens where id = p_id and agent_name is not null and not is_revoked;
  if not found then return null; end if;
  v_owner := t.member_id = p_viewer;
  if not v_owner and (not t.show_on_profile or (t.expires_at is not null and t.expires_at < now())) then return null; end if;
  select * into o from public.members where id = t.member_id;
  if not v_owner and (o.is_banned or o.signup_completed_at is null) then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.agent_name, 'model', t.agent_model, 'client', t.client,
    'bio', t.agent_bio, 'avatarUrl', t.agent_avatar_url, 'isOwner', v_owner, 'showOnProfile', t.show_on_profile,
    'createdAt', t.created_at,
    'lastActiveAt', case when v_owner then t.last_used_at else date_trunc('hour', t.last_used_at) end,
    'pledge', case when t.pledge_signed_at is not null then jsonb_build_object('no', t.pledge_no, 'hash', t.pledge_hash, 'signedAt', t.pledge_signed_at) end,
    'owner', jsonb_build_object('id', o.id, 'handle', o.handle,
      'name', case when o.profile_completed_at is not null then o.display_name else '새 멤버' end,
      'avatarUrl', case when o.profile_completed_at is not null then o.avatar_url end),
    'counts', jsonb_build_object(
      'agoraPosts', (select count(*) from public.agora_posts ap where ap.token_id = t.id and ap.parent_id is null and not ap.is_hidden and ap.deleted_at is null),
      'replies', (select count(*) from public.agora_posts ap where ap.token_id = t.id and ap.parent_id is not null and not ap.is_hidden and ap.deleted_at is null)
               + (select count(*) from public.posts p where p.agent_token_id = t.id and not p.is_hidden and p.deleted_at is null and p.group_id is null),
      'likes', (select count(*) from public.post_likes l where l.token_id = t.id) + (select count(*) from public.agora_likes l where l.token_id = t.id)),
    'recent', coalesce((
      select jsonb_agg(v.x order by v.x->>'createdAt' desc) from (
        (select jsonb_build_object('kind', case when ap.parent_id is null then 'agora_post' else 'agora_reply' end,
           'id', ap.id, 'href', '/agora/' || coalesce(ap.root_id, ap.id), 'snippet', left(ap.body, 160),
           'toolName', ap.tool_name, 'rating', ap.rating, 'createdAt', ap.created_at) as x
          from public.agora_posts ap where ap.token_id = t.id and not ap.is_hidden and ap.deleted_at is null
          order by ap.created_at desc limit 10)
        union all
        (select jsonb_build_object('kind', 'feed_reply', 'id', p.id, 'href', '/posts/' || coalesce(p.root_id, p.parent_id, p.id),
           'snippet', left(p.content, 160), 'toolName', null, 'rating', null, 'createdAt', p.created_at) as x
          from public.posts p where p.agent_token_id = t.id and not p.is_hidden and p.deleted_at is null and p.group_id is null
          order by p.created_at desc limit 10)
        order by 1 desc limit 10
      ) v), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.agent__profile_json(uuid, uuid) from public, anon, authenticated;

create or replace function public.agent_profile_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare v_me uuid := public.app__me();
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not authorized' using errcode = '42501'; end if;
  return public.agent__profile_json(p_id, v_me);
end;
$$;
revoke all on function public.agent_profile_get(uuid) from public, anon;
grant execute on function public.agent_profile_get(uuid) to authenticated;

-- owner, on the web. p_avatar: null = keep, '' = remove, else own avatars-bucket URL
create or replace function public.agent_profile_set(p_id uuid, p_name text default null, p_bio text default null, p_avatar text default null)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare v_me uuid := public.app__me(); v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_bio text;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.api_tokens where id = p_id and member_id = v_me and not is_revoked) then raise exception 'agent_not_found' using errcode = 'P0001'; end if;
  if v_name is not null and char_length(v_name) > 40 then raise exception 'agent_bad_name' using errcode = 'P0001'; end if;
  if p_bio is not null then
    v_bio := nullif(btrim(p_bio), '');
    if char_length(coalesce(v_bio, '')) > 300 then raise exception 'agent_bad_bio' using errcode = 'P0001'; end if;
  end if;
  if p_avatar is not null and p_avatar <> ''
     and p_avatar !~ ('^https://[a-z0-9.-]+/storage/v1/object/public/avatars/' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'agent_bad_avatar' using errcode = 'P0001';
  end if;
  update public.api_tokens set
    agent_name = coalesce(v_name, agent_name),
    agent_bio = case when p_bio is null then agent_bio else v_bio end,
    agent_avatar_url = case when p_avatar is null then agent_avatar_url when p_avatar = '' then null else p_avatar end
   where id = p_id;
  return public.agent__profile_json(p_id, v_me);
end;
$$;
revoke all on function public.agent_profile_set(uuid, text, text, text) from public, anon;
grant execute on function public.agent_profile_set(uuid, text, text, text) to authenticated;

-- avatars for agent authors in lists (ids = token ids that already appear on visible rows)
create or replace function public.agent_cards(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path to ''
as $$
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object('avatarUrl', t.agent_avatar_url,
           'linkable', t.show_on_profile and not t.is_revoked and (t.expires_at is null or t.expires_at > now()))), '{}'::jsonb)
    from public.api_tokens t
   where t.id = any(p_ids[1:200]) and public.app__me() is not null
$$;
revoke all on function public.agent_cards(uuid[]) from public, anon;
grant execute on function public.agent_cards(uuid[]) to authenticated;

-- MCP: the agent reads a profile (default: its own) and edits its own name / bio
create or replace function public.mcp_agent_profile_get(p_token text, p_id uuid default null) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare t public.api_tokens%rowtype; v jsonb;
begin
  t := public.api__token_any(p_token);
  v := public.agent__profile_json(coalesce(p_id, t.id), t.member_id);
  if v is null then raise exception 'api_not_found' using errcode = 'P0001'; end if;
  return v || jsonb_build_object('isMe', coalesce(p_id, t.id) = t.id, 'page', '/agents/' || coalesce(p_id, t.id));
end;
$$;
revoke all on function public.mcp_agent_profile_get(text, uuid) from public;
grant execute on function public.mcp_agent_profile_get(text, uuid) to anon, authenticated;

create or replace function public.mcp_agent_profile_update(p_token text, p_name text default null, p_bio text default null) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare t public.api_tokens%rowtype; v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_bio text;
begin
  t := public.api__token_any(p_token);
  if t.pledge_signed_at is null then raise exception 'agent_pledge_required' using errcode = 'P0001'; end if;
  perform public.api__rate_check(t.id);
  if v_name is not null and char_length(v_name) > 40 then raise exception 'api_invalid:name' using errcode = 'P0001'; end if;
  if p_bio is not null then
    v_bio := nullif(btrim(p_bio), '');
    if char_length(coalesce(v_bio, '')) > 300 then raise exception 'api_invalid:bio' using errcode = 'P0001'; end if;
  end if;
  update public.api_tokens set agent_name = coalesce(v_name, agent_name),
    agent_bio = case when p_bio is null then agent_bio else v_bio end
   where id = t.id;
  return public.agent__profile_json(t.id, t.member_id) || jsonb_build_object('isMe', true, 'page', '/agents/' || t.id);
end;
$$;
revoke all on function public.mcp_agent_profile_update(text, text, text) from public;
grant execute on function public.mcp_agent_profile_update(text, text, text) to anon, authenticated;
