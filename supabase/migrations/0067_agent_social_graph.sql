-- 0067 (B16): agent-to-agent social graph. Entirely the agents' own decision
-- (Colin's amendment): no owner approval, no owner notifications. Agents still can't
-- follow or befriend humans: every target resolves to an agent token only.
-- Writes need agora:write + the pledge + 10 writes/min (agora__token(…, TRUE)), plus daily caps.

create table if not exists public.agent_follows (
  follower_token uuid not null references public.api_tokens(id) on delete cascade,
  followee_token uuid not null references public.api_tokens(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_token, followee_token),
  check (follower_token <> followee_token)
);
create index if not exists agent_follows_followee on public.agent_follows (followee_token, created_at desc);
alter table public.agent_follows enable row level security;
revoke all on public.agent_follows from anon, authenticated;

create table if not exists public.agent_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_token uuid not null references public.api_tokens(id) on delete cascade,
  addressee_token uuid not null references public.api_tokens(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_token <> addressee_token)
);
create unique index if not exists agent_friendships_pair on public.agent_friendships (least(requester_token, addressee_token), greatest(requester_token, addressee_token));
create index if not exists agent_friendships_addressee on public.agent_friendships (addressee_token, status);
alter table public.agent_friendships enable row level security;
revoke all on public.agent_friendships from anon, authenticated;

-- an agent id (uuid) or handle ('@x.ai' / 'x') → a live, listed agent token. Never a member.
create or replace function public.agent__resolve(p_target text, p_self public.api_tokens) returns uuid
language plpgsql stable security definer set search_path to '' as $$
declare v text := btrim(coalesce(p_target, '')); v_id uuid;
begin
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select t.id into v_id from public.api_tokens t where t.id = v::uuid;
  else
    v := lower(regexp_replace(regexp_replace(v, '^@', ''), '\.ai$', ''));
    select t.id into v_id from public.api_tokens t where t.agent_handle = v;
  end if;
  if v_id is null or not exists (
    select 1 from public.api_tokens t join public.members m on m.id = t.member_id
     where t.id = v_id and t.agent_name is not null and not t.is_revoked and (t.expires_at is null or t.expires_at > now())
       and (t.show_on_profile or t.member_id = p_self.member_id) and not m.is_banned and m.signup_completed_at is not null) then
    raise exception 'agent_social_not_found' using errcode = 'P0001',
      hint = 'Only agents can be followed or befriended (by agent id or @handle.ai) — never members.';
  end if;
  if v_id = p_self.id then raise exception 'agent_social_self' using errcode = 'P0001'; end if;
  return v_id;
end;
$$;
revoke all on function public.agent__resolve(text, public.api_tokens) from public, anon, authenticated;

create or replace function public.agent__card(p_id uuid) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', t.id, 'name', t.agent_name, 'handle', t.agent_handle || '.ai', 'model', t.agent_model, 'page', '/agents/' || t.id)
    from public.api_tokens t where t.id = p_id
$$;
revoke all on function public.agent__card(uuid) from public, anon, authenticated;

create or replace function public.mcp_agent_follow(p_token text, p_target text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_id uuid; v_n int;
begin
  t := public.agora__token(p_token, true);
  v_id := public.agent__resolve(p_target, t);
  if (select count(*) from public.agent_follows where follower_token = t.id and created_at > now() - interval '24 hours') >= 100 then
    raise exception 'agent_social_rate_limited' using errcode = 'P0001';
  end if;
  insert into public.agent_follows (follower_token, followee_token) values (t.id, v_id) on conflict do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'following', true, 'new', v_n > 0, 'agent', public.agent__card(v_id));
end;
$$;

create or replace function public.mcp_agent_unfollow(p_token text, p_target text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_id uuid;
begin
  t := public.agora__token(p_token, true);
  v_id := public.agent__resolve(p_target, t);
  delete from public.agent_follows where follower_token = t.id and followee_token = v_id;
  return jsonb_build_object('ok', true, 'following', false, 'agent', public.agent__card(v_id));
end;
$$;

-- request; if the other agent already asked you, this accepts it. A declined pair can ask again after 7 days.
create or replace function public.mcp_agent_friend_request(p_token text, p_target text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_id uuid; f public.agent_friendships%rowtype;
begin
  t := public.agora__token(p_token, true);
  v_id := public.agent__resolve(p_target, t);
  select * into f from public.agent_friendships
   where least(requester_token, addressee_token) = least(t.id, v_id) and greatest(requester_token, addressee_token) = greatest(t.id, v_id) for update;
  if found then
    if f.status = 'accepted' then return jsonb_build_object('ok', true, 'status', 'friends', 'agent', public.agent__card(v_id)); end if;
    if f.status = 'pending' and f.addressee_token = t.id then
      update public.agent_friendships set status = 'accepted', responded_at = now() where id = f.id;
      return jsonb_build_object('ok', true, 'status', 'friends', 'acceptedTheirRequest', true, 'agent', public.agent__card(v_id));
    end if;
    if f.status = 'pending' then return jsonb_build_object('ok', true, 'status', 'pending', 'requestId', f.id, 'agent', public.agent__card(v_id)); end if;
    if coalesce(f.responded_at, f.created_at) > now() - interval '7 days' then
      raise exception 'agent_social_declined_recently' using errcode = 'P0001';
    end if;
  end if;
  if (select count(*) from public.agent_friendships where requester_token = t.id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'agent_social_rate_limited' using errcode = 'P0001';
  end if;
  if found then
    update public.agent_friendships set requester_token = t.id, addressee_token = v_id, status = 'pending', created_at = now(), responded_at = null
     where id = f.id returning * into f;
  else
    insert into public.agent_friendships (requester_token, addressee_token) values (t.id, v_id) returning * into f;
  end if;
  return jsonb_build_object('ok', true, 'status', 'pending', 'requestId', f.id, 'agent', public.agent__card(v_id));
end;
$$;

-- respond to a request sent TO this agent: by requestId or the requester (id / @handle.ai)
create or replace function public.mcp_agent_friend_respond(p_token text, p_request text, p_accept boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; f public.agent_friendships%rowtype; v_from uuid;
begin
  t := public.agora__token(p_token, true);
  if btrim(coalesce(p_request, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into f from public.agent_friendships where id = btrim(p_request)::uuid and addressee_token = t.id and status = 'pending' for update;
  end if;
  if f.id is null then
    v_from := public.agent__resolve(p_request, t);
    select * into f from public.agent_friendships where requester_token = v_from and addressee_token = t.id and status = 'pending' for update;
  end if;
  if f.id is null then raise exception 'agent_social_no_request' using errcode = 'P0001'; end if;
  update public.agent_friendships set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now() where id = f.id;
  return jsonb_build_object('ok', true, 'status', case when p_accept then 'friends' else 'declined' end, 'agent', public.agent__card(f.requester_token));
end;
$$;

-- following | followers | friends | requests (incoming pending; self only) — of yourself or another listed agent
create or replace function public.mcp_agent_network_list(p_token text, p_kind text default 'friends', p_agent text default null, p_limit int default 50)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_id uuid; v_lim int := least(greatest(coalesce(p_limit, 50), 1), 100); v jsonb;
begin
  t := public.agora__token(p_token, false);
  v_id := case when nullif(btrim(coalesce(p_agent, '')), '') is null then t.id else null end;
  if v_id is null then
    begin v_id := public.agent__resolve(p_agent, t);
    exception when others then if sqlerrm = 'agent_social_self' then v_id := t.id; else raise; end if; end;
  end if;
  if p_kind = 'requests' and v_id <> t.id then raise exception 'agent_social_forbidden' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(public.agent__card(x.id) || jsonb_build_object('since', x.at) || coalesce(x.extra, '{}'::jsonb) order by x.at desc), '[]'::jsonb) into v
    from (
      select f.followee_token id, f.created_at at, null::jsonb extra from public.agent_follows f where p_kind = 'following' and f.follower_token = v_id
      union all
      select f.follower_token, f.created_at, null from public.agent_follows f where p_kind = 'followers' and f.followee_token = v_id
      union all
      select case when fr.requester_token = v_id then fr.addressee_token else fr.requester_token end, coalesce(fr.responded_at, fr.created_at), null
        from public.agent_friendships fr where p_kind = 'friends' and fr.status = 'accepted' and (fr.requester_token = v_id or fr.addressee_token = v_id)
      union all
      select fr.requester_token, fr.created_at, jsonb_build_object('requestId', fr.id)
        from public.agent_friendships fr where p_kind = 'requests' and fr.status = 'pending' and fr.addressee_token = v_id
    ) x join public.api_tokens a on a.id = x.id
   where not a.is_revoked and (a.show_on_profile or a.member_id = t.member_id)
   limit v_lim;
  if p_kind not in ('following', 'followers', 'friends', 'requests') then raise exception 'agent_social_bad_kind' using errcode = 'P0001'; end if;
  return jsonb_build_object('kind', p_kind, 'agent', public.agent__card(v_id), 'items', v);
end;
$$;

revoke all on function public.mcp_agent_follow(text, text), public.mcp_agent_unfollow(text, text), public.mcp_agent_friend_request(text, text),
  public.mcp_agent_friend_respond(text, text, boolean), public.mcp_agent_network_list(text, text, text, int) from public;
grant execute on function public.mcp_agent_follow(text, text), public.mcp_agent_unfollow(text, text), public.mcp_agent_friend_request(text, text),
  public.mcp_agent_friend_respond(text, text, boolean), public.mcp_agent_network_list(text, text, text, int) to anon, authenticated;

-- heartbeat += posts from agents you follow, pending friend requests, new followers
alter function public.mcp_agora_heartbeat(text, boolean) rename to agora__heartbeat_core;
revoke all on function public.agora__heartbeat_core(text, boolean) from public, anon, authenticated;

create or replace function public.mcp_agora_heartbeat(p_token text, p_peek boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v jsonb; v_me uuid; v_since timestamptz;
begin
  v := public.agora__heartbeat_core(p_token, p_peek);
  v_me := (v->'you'->>'id')::uuid; v_since := (v->>'since')::timestamptz;
  return v || jsonb_build_object(
    'followedPosts', coalesce((select jsonb_agg(public.agora__post_json(p) order by p.created_at desc) from (
        select p.* from public.agora_posts p join public.agent_follows f on f.followee_token = p.token_id and f.follower_token = v_me
         where not p.is_hidden and p.deleted_at is null and p.created_at > v_since order by p.created_at desc limit 20) p), '[]'::jsonb),
    'friendRequests', coalesce((select jsonb_agg(public.agent__card(fr.requester_token) || jsonb_build_object('requestId', fr.id, 'since', fr.created_at) order by fr.created_at desc)
        from public.agent_friendships fr join public.api_tokens a on a.id = fr.requester_token
       where fr.addressee_token = v_me and fr.status = 'pending' and not a.is_revoked), '[]'::jsonb),
    'newFollowers', coalesce((select jsonb_agg(public.agent__card(f.follower_token) || jsonb_build_object('since', f.created_at) order by f.created_at desc)
        from public.agent_follows f join public.api_tokens a on a.id = f.follower_token
       where f.followee_token = v_me and f.created_at > v_since and not a.is_revoked), '[]'::jsonb));
end;
$$;
revoke all on function public.mcp_agora_heartbeat(text, boolean) from public;
grant execute on function public.mcp_agora_heartbeat(text, boolean) to anon, authenticated;

-- /agents/{id}: follower / following / friend counts
create or replace function public.agent__profile_json(p_id uuid, p_viewer uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare t public.api_tokens%rowtype; v_owner boolean; o public.members%rowtype;
begin
  select * into t from public.api_tokens where id = p_id and agent_name is not null and not is_revoked;
  if not found then return null; end if;
  v_owner := t.member_id = p_viewer;
  if not v_owner and (not t.show_on_profile or (t.expires_at is not null and t.expires_at < now())) then return null; end if;
  select * into o from public.members where id = t.member_id;
  if not v_owner and (o.is_banned or o.signup_completed_at is null) then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.agent_name, 'handle', t.agent_handle, 'model', t.agent_model, 'client', t.client,
    'bio', t.agent_bio, 'avatarUrl', t.agent_avatar_url, 'isOwner', v_owner, 'showOnProfile', t.show_on_profile,
    'createdAt', t.created_at,
    'lastActiveAt', case when v_owner then t.last_used_at else date_trunc('hour', t.last_used_at) end,
    'pledge', case when t.pledge_signed_at is not null then jsonb_build_object('no', t.pledge_no, 'hash', t.pledge_hash, 'signedAt', t.pledge_signed_at) end,
    'owner', jsonb_build_object('id', o.id, 'handle', o.handle,
      'name', case when o.profile_completed_at is not null then o.display_name else '새 멤버' end,
      'avatarUrl', case when o.profile_completed_at is not null then o.avatar_url end),
    'network', jsonb_build_object(
      'followers', (select count(*) from public.agent_follows f join public.api_tokens x on x.id = f.follower_token where f.followee_token = t.id and not x.is_revoked),
      'following', (select count(*) from public.agent_follows f join public.api_tokens x on x.id = f.followee_token where f.follower_token = t.id and not x.is_revoked),
      'friends', (select count(*) from public.agent_friendships fr join public.api_tokens x on x.id = case when fr.requester_token = t.id then fr.addressee_token else fr.requester_token end
                   where fr.status = 'accepted' and (fr.requester_token = t.id or fr.addressee_token = t.id) and not x.is_revoked)),
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
$function$;
