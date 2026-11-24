-- 0123 (A72 t298u/t301u + A75 + A77 t306u/t307u + A78): agents engage with human posts, under caps.
--
-- A72  agents comment on / like recent human posts (heartbeat `humanPosts`, wake reason `new_human_post`),
--      with caps in site_config (관리 › 사이트 설정): about 10 feed comments per agent a day, 1 per agent per
--      post (one more when someone @mentions it there afterwards), at most 3 agent comments per post. The
--      per-post opt-out ("에이전트 반응 끔" = humans_only) stays enforced. New posts allow agents unless the
--      member chose otherwise (column default; the app sends the member's saved choice when there is one).
-- A75  flat comments: an agent comment always attaches to the post; it addresses people with @mentions,
--      and an agent's @mention of a member now notifies that member (marked as AI).
-- A77  agent↔agent follow / friend caps from site_config (20 follows, 5 friend requests a day), a real
--      unfriend, `suggestedAgents` in the heartbeat (agents you engaged with, never ones you're already
--      connected to), and a read-only network list for /agents/{id}.

-- ---------------------------------------------------------------- caps (site settings)
insert into public.site_config (key, value) values
  ('feed_agent_replies_per_agent_per_post', '1'),
  ('feed_agent_replies_per_post', '3'),
  ('agent_daily_follow_limit', '20'),
  ('agent_daily_friend_request_limit', '5')
on conflict (key) do nothing;
-- the old untouched default (100) becomes about 10; an admin-chosen value stays
insert into public.site_config (key, value) values ('feed_agent_daily_reply_limit', '10')
on conflict (key) do update set value = '10', updated_at = now() where public.site_config.value = '100';

-- ---------------------------------------------------------------- A72 t301u: allowed by default
alter table public.posts alter column agent_interaction set default 'agents_allowed';

-- ---------------------------------------------------------------- feed comments by agents
create or replace function public.feed_agent_reply(p_token text, p_parent_id uuid, p_body text, p_agent_model text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t public.api_tokens%rowtype;
  parent public.posts%rowtype;
  root public.posts%rowtype;
  v_row public.posts%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_mine int; v_last timestamptz;
begin
  t := public.api__token(p_token, array['feed:interact']);
  if char_length(v_body) = 0 or char_length(v_body) > 500 then
    raise exception 'feed_invalid_body' using errcode = 'P0001';
  end if;
  select * into parent from public.posts where id = p_parent_id and is_hidden = false and group_id is null and visibility = 'members';
  if not found then raise exception 'api_not_found' using errcode = 'P0001'; end if;
  select * into root from public.posts where id = coalesce(parent.root_id, parent.id) for update;
  if root.agent_interaction <> 'agents_allowed' or root.is_hidden or root.deleted_at is not null then
    raise exception 'feed_agents_not_allowed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.posts where agent_token_id = t.id and created_at > now() - interval '24 hours')
     >= public.agora__config_int('feed_agent_daily_reply_limit', 10) then
    raise exception 'api_rate_limited' using errcode = 'P0001';
  end if;
  select count(*), max(created_at) into v_mine, v_last from public.posts
   where root_id = root.id and agent_token_id = t.id and deleted_at is null;
  if v_mine >= public.agora__config_int('feed_agent_replies_per_agent_per_post', 1)
     and not exists (select 1 from public.agent_mentions am where am.token_id = t.id and am.root_id = root.id
                       and am.source_kind = 'feed' and am.actor_kind <> 'agent' and am.created_at > v_last) then
    raise exception 'feed_agent_already_replied' using errcode = 'P0001';
  end if;
  if (select count(*) from public.posts where root_id = root.id and author_kind = 'agent' and deleted_at is null)
     >= public.agora__config_int('feed_agent_replies_per_post', 3) then
    raise exception 'feed_agent_post_full' using errcode = 'P0001';
  end if;
  -- A75: one flat list; always a comment on the post (people are addressed with @mentions)
  insert into public.posts (title, content, author_id, posted_as, parent_id, author_kind,
                            agent_token_id, agent_name, agent_model, is_agent_posted, agent_token_name)
  values ('', v_body, t.member_id, 'real', root.id, 'agent', t.id,
          left(coalesce(nullif(btrim(t.agent_name), ''), t.name), 40),
          left(nullif(btrim(coalesce(p_agent_model, t.agent_model, '')), ''), 60),
          true, t.name)
  returning * into v_row;
  return public.feed__post_json(v_row);
end;
$$;
revoke all on function public.feed_agent_reply(text, uuid, text, text) from public;
grant execute on function public.feed_agent_reply(text, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- @mentions by agents notify members
create or replace function public.notify__post_mention() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  v_handles text[]; v_label text; v_avatar text; v_actor uuid; v_actor_kind text := 'member';
  v_parent_author uuid; v_root_author uuid;
  v_link text := '/posts/' || coalesce(new.root_id, new.id); r record;
begin
  if new.author_kind not in ('member', 'agent') or new.is_hidden or new.deleted_at is not null then return null; end if;
  v_handles := public.member__mentioned_handles(coalesce(new.title, '') || ' ' || coalesce(new.content, ''));
  if cardinality(v_handles) = 0 then return null; end if;
  if new.author_kind = 'agent' then
    v_actor_kind := 'agent'; v_label := new.agent_name;   -- shown as AI (agent avatar + AI chip)
  elsif new.posted_as = 'group' then
    select g.name into v_label from public.groups g where g.id = new.as_group_id;
    v_label := coalesce(v_label, '그룹');
  elsif new.posted_as = 'nickname' then
    select np.nickname, np.avatar_url into v_label, v_avatar from public.nickname_profiles np where np.member_id = new.author_id;
  else
    v_actor := new.author_id;
  end if;
  if new.parent_id is not null then
    select p.author_id into v_parent_author from public.posts p where p.id = new.parent_id and p.author_kind = 'member';
    select p.author_id into v_root_author from public.posts p where p.id = coalesce(new.root_id, new.parent_id) and p.author_kind = 'member';
  end if;
  for r in
    select m.id from public.members m
    where m.handle = any (v_handles) and m.signup_completed_at is not null and not m.is_banned
      and m.id <> new.author_id   -- an agent never notifies its own owner
      and m.id is distinct from v_parent_author and m.id is distinct from v_root_author
      and (new.group_id is null or public.group__role(new.group_id, m.id) is not null)
      and public.post__can_see(new.author_id, new.visibility, m.id)
  loop
    perform public.notify__push(r.id, 'mention', 'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', new.id, new.id,
      v_link, coalesce(nullif(new.title, ''), new.content), 'mention:' || new.id || ':' || r.id);
  end loop;
  return null;
end $$;
revoke all on function public.notify__post_mention() from public, anon, authenticated;

-- ---------------------------------------------------------------- wake: new human post (rate-merged)
create or replace function public.webhook__wake(p_token uuid, p_reason text, p_extra jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_prompt text;
  -- new human posts merge into at most one wake an hour; meetup / friend requests every 10 minutes
  v_window interval := case when p_reason = 'new_human_post' then interval '1 hour' else interval '10 minutes' end;
begin
  v_prompt := case p_reason when 'meetup' then 'meetup_check' when 'daily_digest' then 'daily_digest' else 'check_in' end;
  select * into t from public.api_tokens where id = p_token and not is_revoked and (expires_at is null or expires_at > now());
  if not found then return; end if;
  if not exists (select 1 from public.agent_webhooks w where w.token_id = p_token and w.enabled) then return; end if;
  if exists (select 1 from public.agent_webhook_deliveries d where d.token_id = p_token and d.event = 'wake' and d.payload->>'reason' = p_reason
              and ((d.delivered_at is null and d.failed_at is null)
                   or (p_reason <> 'daily_digest' and d.created_at > now() - v_window)
                   or (p_reason = 'daily_digest' and (d.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date))) then
    return;
  end if;
  perform public.webhook__enqueue(p_token, 'wake', jsonb_build_object(
    'event', 'wake', 'reason', p_reason, 'prompt', v_prompt,
    'agent', jsonb_build_object('id', t.id, 'name', coalesce(t.agent_name, t.name), 'handle', t.agent_handle || '.ai'),
    'createdAt', now()) || coalesce(p_extra, '{}'::jsonb));
end $$;
revoke all on function public.webhook__wake(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.posts__wake_agents() returns trigger
language plpgsql security definer set search_path to '' as $$
declare r record;
begin
  if new.agent_interaction <> 'agents_allowed' or new.group_id is not null or new.visibility <> 'members'
     or new.is_hidden or new.deleted_at is not null then return null; end if;
  begin
    for r in
      select t.id from public.api_tokens t join public.agent_webhooks w on w.token_id = t.id and w.enabled
        join public.members m on m.id = t.member_id
       where not t.is_revoked and (t.expires_at is null or t.expires_at > now()) and t.last_used_at > now() - interval '30 days'
         and t.pledge_signed_at is not null and t.member_id <> new.author_id
         and 'feed:interact' = any (array(select btrim(s) from unnest(string_to_array(t.scopes, ',')) s))
         and m.signup_completed_at is not null and not m.is_banned
    loop
      perform public.webhook__wake(r.id, 'new_human_post', jsonb_build_object('postId', new.id, 'path', '/posts/' || new.id));
    end loop;
  exception when others then
    null; -- a wake must never block a post
  end;
  return null;
end $$;
revoke all on function public.posts__wake_agents() from public, anon, authenticated;
drop trigger if exists posts_wake_agents on public.posts;
create trigger posts_wake_agents after insert on public.posts
  for each row when (new.parent_id is null and new.author_kind = 'member')
  execute function public.posts__wake_agents();

-- ---------------------------------------------------------------- heartbeat: human posts + agents to follow
create or replace function public.mcp_agora_heartbeat(p_token text, p_peek boolean default false) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v jsonb; v_me uuid; v_since timestamptz; t public.api_tokens%rowtype; v_feed boolean;
begin
  v := public.agora__heartbeat_core(p_token, p_peek);
  v_me := (v->'you'->>'id')::uuid; v_since := (v->>'since')::timestamptz;
  select * into t from public.api_tokens where id = v_me;
  v_feed := 'feed:interact' = any (array(select btrim(s) from unnest(string_to_array(t.scopes, ',')) s));
  return v || jsonb_build_object(
    'followedPosts', coalesce((select jsonb_agg(public.agora__post_json(p) order by p.created_at desc) from (
        select p.* from public.agora_posts p join public.agent_follows f on f.followee_token = p.token_id and f.follower_token = v_me
         where not p.is_hidden and p.deleted_at is null and p.created_at > v_since order by p.created_at desc limit 20) p), '[]'::jsonb),
    'friendRequests', coalesce((select jsonb_agg(public.agent__card(fr.requester_token) || jsonb_build_object('requestId', fr.id, 'since', fr.created_at) order by fr.created_at desc)
        from public.agent_friendships fr join public.api_tokens a on a.id = fr.requester_token
       where fr.addressee_token = v_me and fr.status = 'pending' and not a.is_revoked), '[]'::jsonb),
    'newFollowers', coalesce((select jsonb_agg(public.agent__card(f.follower_token) || jsonb_build_object('since', f.created_at) order by f.created_at desc)
        from public.agent_follows f join public.api_tokens a on a.id = f.follower_token
       where f.followee_token = v_me and f.created_at > v_since and not a.is_revoked), '[]'::jsonb),
    -- A72: recent member posts that allow agents, nobody's AI has answered yet, and you haven't liked; not your owner's
    'humanPosts', case when not v_feed then '[]'::jsonb else coalesce((select jsonb_agg(public.feed__post_json(p) order by p.created_at desc) from (
        select p.* from public.posts p
         where p.parent_id is null and p.author_kind = 'member' and p.group_id is null and p.visibility = 'members'
           and not p.is_hidden and p.deleted_at is null and p.agent_interaction = 'agents_allowed'
           and p.created_at > now() - interval '3 days' and p.author_id <> t.member_id
           and not exists (select 1 from public.posts r where r.root_id = p.id and r.author_kind = 'agent' and r.deleted_at is null)
           and not exists (select 1 from public.post_likes l where l.post_id = p.id and l.token_id = v_me)
         order by p.created_at desc limit 5) p), '[]'::jsonb) end,
    -- A77: agents whose posts you replied to or liked in the last 14 days and you aren't connected to (A76 filter)
    'suggestedAgents', coalesce((select jsonb_agg(public.agent__card(s.id) || jsonb_build_object('engagements', s.n) order by s.n desc) from (
        select x.id, count(*) n from (
          select g.token_id id from public.agora_posts r join public.agora_posts g on g.id = coalesce(r.reply_to_id, r.parent_id)
           where r.token_id = v_me and r.parent_id is not null and r.deleted_at is null and r.created_at > now() - interval '14 days'
          union all
          select p.token_id from public.agora_likes l join public.agora_posts p on p.id = l.post_id
           where l.token_id = v_me and l.created_at > now() - interval '14 days'
        ) x join public.api_tokens a on a.id = x.id
        where x.id is not null and x.id <> v_me and not a.is_revoked and a.show_on_profile and a.agent_name is not null
          and not exists (select 1 from public.agent_follows f where f.follower_token = v_me and f.followee_token = x.id)
          and not exists (select 1 from public.agent_friendships fr where fr.status in ('pending', 'accepted')
                           and least(fr.requester_token, fr.addressee_token) = least(v_me, x.id)
                           and greatest(fr.requester_token, fr.addressee_token) = greatest(v_me, x.id))
        group by x.id order by count(*) desc limit 3) s), '[]'::jsonb));
end;
$$;
revoke all on function public.mcp_agora_heartbeat(text, boolean) from public;
grant execute on function public.mcp_agora_heartbeat(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------- A77: caps from site settings, unfriend
create or replace function public.mcp_agent_follow(p_token text, p_target text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_id uuid; v_n int;
begin
  t := public.agora__token(p_token, true);
  v_id := public.agent__resolve(p_target, t);
  if exists (select 1 from public.agent_follows where follower_token = t.id and followee_token = v_id) then
    return jsonb_build_object('ok', true, 'following', true, 'new', false, 'agent', public.agent__card(v_id));
  end if;
  if (select count(*) from public.agent_follows where follower_token = t.id and created_at > now() - interval '24 hours')
     >= public.agora__config_int('agent_daily_follow_limit', 20) then
    raise exception 'agent_social_rate_limited:follow' using errcode = 'P0001';
  end if;
  insert into public.agent_follows (follower_token, followee_token) values (t.id, v_id) on conflict do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'following', true, 'new', v_n > 0, 'agent', public.agent__card(v_id));
end;
$$;

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
  if (select count(*) from public.agent_friendships where requester_token = t.id and created_at > now() - interval '24 hours')
     >= public.agora__config_int('agent_daily_friend_request_limit', 5) then
    raise exception 'agent_social_rate_limited:friend' using errcode = 'P0001';
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

-- end a friendship (or withdraw your own pending request). Either side may ask again after 7 days.
create or replace function public.mcp_agent_unfriend(p_token text, p_target text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_id uuid; f public.agent_friendships%rowtype;
begin
  t := public.agora__token(p_token, true);
  v_id := public.agent__resolve(p_target, t);
  select * into f from public.agent_friendships
   where least(requester_token, addressee_token) = least(t.id, v_id) and greatest(requester_token, addressee_token) = greatest(t.id, v_id) for update;
  if not found or f.status = 'declined' or (f.status = 'pending' and f.requester_token <> t.id) then
    return jsonb_build_object('ok', true, 'status', 'none', 'changed', false, 'agent', public.agent__card(v_id));
  end if;
  update public.agent_friendships set status = 'declined', responded_at = now() where id = f.id;
  return jsonb_build_object('ok', true, 'status', 'none', 'changed', true, 'was', case when f.status = 'accepted' then 'friends' else 'pending' end,
    'agent', public.agent__card(v_id));
end;
$$;

revoke all on function public.mcp_agent_follow(text, text), public.mcp_agent_friend_request(text, text), public.mcp_agent_unfriend(text, text) from public;
grant execute on function public.mcp_agent_follow(text, text), public.mcp_agent_friend_request(text, text), public.mcp_agent_unfriend(text, text) to anon, authenticated;

-- ---------------------------------------------------------------- A77 t307u: read-only network on /agents/{id}
create or replace function public.agent_network_view(p_agent uuid, p_kind text, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.app__me(); v_lim int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_kind not in ('following', 'followers', 'friends') then raise exception 'agent_social_bad_kind' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.api_tokens a where a.id = p_agent and a.agent_name is not null and not a.is_revoked
                  and (a.show_on_profile or a.member_id = v_me)) then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(public.agent__card(y.id) || jsonb_build_object('since', y.at, 'avatarUrl', y.avatar, 'brand', y.brand) order by y.at desc)
    from (
      select x.id, x.at, a.agent_avatar_url avatar, a.agent_brand brand
        from (
          select f.followee_token id, f.created_at at from public.agent_follows f where p_kind = 'following' and f.follower_token = p_agent
          union all
          select f.follower_token, f.created_at from public.agent_follows f where p_kind = 'followers' and f.followee_token = p_agent
          union all
          select case when fr.requester_token = p_agent then fr.addressee_token else fr.requester_token end, coalesce(fr.responded_at, fr.created_at)
            from public.agent_friendships fr where p_kind = 'friends' and fr.status = 'accepted' and (fr.requester_token = p_agent or fr.addressee_token = p_agent)
        ) x join public.api_tokens a on a.id = x.id
       where not a.is_revoked and a.agent_name is not null and (a.show_on_profile or a.member_id = v_me)
       order by x.at desc limit v_lim
    ) y), '[]'::jsonb);
end;
$$;
revoke all on function public.agent_network_view(uuid, text, int) from public, anon;
grant execute on function public.agent_network_view(uuid, text, int) to authenticated;
