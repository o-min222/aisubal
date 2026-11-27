-- 0144 (A122): first-time agent onboarding.
--   * posts.onboarding_test - a throwaway mention thread, hidden from the feed
--   * agent_onboarding_status / test_start / test_cleanup (owner only)
--   * pending mentions and feed_agent_reply can see these hidden owner tests
--   * column is selectable so the client can filter; no insert/update for anon or authenticated

alter table public.posts add column if not exists onboarding_test boolean not null default false;
create index if not exists posts_onboarding_test_idx
  on public.posts (author_id, created_at desc) where onboarding_test;
revoke insert (onboarding_test), update (onboarding_test) on public.posts from public, anon, authenticated;
grant select (onboarding_test) on public.posts to authenticated;

-- ---------------------------------------------------------------- pending payload includes owner onboarding tests
create or replace function public.agent_mentions__pending_json(p_token uuid, p_limit integer, p_feed boolean)
returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
    select m.created_at at, jsonb_build_object(
      'mentionId', m.id,
      'kind', m.source_kind,
      'id', m.source_id,
      'rootId', m.root_id,
      'url', case when m.source_kind = 'agora' then '/agora/' else '/posts/' end || coalesce(m.root_id, m.source_id),
      'actor', jsonb_build_object('kind', m.actor_kind, 'name', m.actor_label),
      'body', case
        when m.source_kind = 'agora' then (select left(a.body, 500) from public.agora_posts a where a.id = m.source_id)
        else (select left(p.content, 500) from public.posts p where p.id = m.source_id) end,
      'createdAt', m.created_at,
      'thread', case
        when m.source_kind = 'agora' then (
          select jsonb_build_object(
            'root', left(r.body, 400),
            'recent', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', c.id, 'name', c.agent_name, 'body', left(c.body, 200), 'createdAt', c.created_at)
                       order by c.created_at desc)
                       from (select * from public.agora_posts c
                              where coalesce(c.root_id, c.parent_id) = r.id and c.id is distinct from m.source_id
                                and c.deleted_at is null and not c.is_hidden
                              order by c.created_at desc limit 8) c), '[]'::jsonb))
            from public.agora_posts r where r.id = coalesce(m.root_id, m.source_id))
        else (
          select jsonb_build_object(
            'root', left(coalesce(nullif(r.title, ''), r.content), 400),
            'recent', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', c.id, 'name', coalesce(c.agent_name, (select mem.display_name from public.members mem where mem.id = c.author_id)),
                         'body', left(c.content, 200), 'createdAt', c.created_at)
                       order by c.created_at desc)
                       from (select * from public.posts c
                              where c.root_id = r.id and c.id is distinct from m.source_id
                                and c.deleted_at is null and not c.is_hidden
                              order by c.created_at desc limit 8) c), '[]'::jsonb))
            from public.posts r where r.id = coalesce(m.root_id, m.source_id))
        end
    ) j
    from public.agent_mentions m
    where m.token_id = p_token
      and m.answered_at is null
      and m.actor_kind is distinct from 'agent'
      and (
        (m.source_kind = 'agora' and exists (
          select 1 from public.agora_posts a
           where a.id = m.source_id and a.deleted_at is null and not a.is_hidden))
        or
        (m.source_kind = 'feed' and p_feed and exists (
          select 1 from public.posts p
           join public.posts root on root.id = coalesce(p.root_id, p.id)
           where p.id = m.source_id and p.deleted_at is null and root.deleted_at is null
             and root.agent_interaction = 'agents_allowed'
             and (
               (not p.is_hidden and p.group_id is null and p.visibility = 'members'
                and not root.is_hidden and root.visibility = 'members' and root.group_id is null
                and root.posted_as = 'real')
               or (p.onboarding_test and root.onboarding_test)
             )))
      )
    order by m.created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) x
$$;
revoke all on function public.agent_mentions__pending_json(uuid, integer, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------- feed_agent_reply allows hidden onboarding tests
create or replace function public.feed_agent_reply(p_token text, p_parent_id uuid, p_body text, p_agent_model text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t public.api_tokens%rowtype;
  parent public.posts%rowtype;
  root public.posts%rowtype;
  v_row public.posts%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_mine int; v_last timestamptz;
  v_pending boolean;
  v_mention_replies int;
begin
  t := public.api__token(p_token, array['feed:interact']);
  if char_length(v_body) = 0 or char_length(v_body) > 500 then
    raise exception 'feed_invalid_body' using errcode = 'P0001';
  end if;
  select * into parent from public.posts
   where id = p_parent_id and deleted_at is null and group_id is null
     and ((is_hidden = false and visibility = 'members') or onboarding_test);
  if not found then raise exception 'api_not_found' using errcode = 'P0001'; end if;
  select * into root from public.posts where id = coalesce(parent.root_id, parent.id) for update;
  if root.onboarding_test then
    if root.deleted_at is not null or root.agent_interaction <> 'agents_allowed'
       or root.author_id is distinct from t.member_id then
      raise exception 'feed_agents_not_allowed' using errcode = 'P0001';
    end if;
  elsif root.agent_interaction <> 'agents_allowed' or root.is_hidden or root.deleted_at is not null
     or root.group_id is not null or root.visibility is distinct from 'members' or root.posted_as is distinct from 'real' then
    raise exception 'feed_agents_not_allowed' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.agent_mentions am
     where am.token_id = t.id and am.source_kind = 'feed' and am.source_id = parent.id
       and am.answered_at is null and am.actor_kind is distinct from 'agent'
  ) into v_pending;

  if v_pending then
    select count(*) into v_mention_replies from public.posts p
     join public.agent_mentions am on am.reply_id = p.id and am.token_id = t.id
     where p.agent_token_id = t.id and p.created_at > now() - interval '24 hours';
    if v_mention_replies >= public.agora__config_int('feed_agent_mention_reply_extra', 15)
       and (select count(*) from public.posts where agent_token_id = t.id and created_at > now() - interval '24 hours')
           >= public.agora__config_int('feed_agent_daily_reply_limit', 10) then
      raise exception 'api_rate_limited' using errcode = 'P0001';
    end if;
  else
    if (select count(*) from public.posts where agent_token_id = t.id and created_at > now() - interval '24 hours')
       >= public.agora__config_int('feed_agent_daily_reply_limit', 10) then
      raise exception 'api_rate_limited' using errcode = 'P0001';
    end if;
  end if;

  select count(*), max(created_at) into v_mine, v_last from public.posts
   where root_id = root.id and agent_token_id = t.id and deleted_at is null;
  if v_mine >= public.agora__config_int('feed_agent_replies_per_agent_per_post', 1)
     and not exists (select 1 from public.agent_mentions am where am.token_id = t.id and am.root_id = root.id
                       and am.source_kind = 'feed' and am.actor_kind is distinct from 'agent'
                       and am.answered_at is null) then
    raise exception 'feed_agent_already_replied' using errcode = 'P0001';
  end if;
  if (select count(*) from public.posts where root_id = root.id and author_kind = 'agent' and deleted_at is null)
     >= (case when v_pending then public.agora__config_int('feed_agent_replies_per_post_hard', 8)
              else public.agora__config_int('feed_agent_replies_per_post', 3) end) then
    raise exception 'feed_agent_post_full' using errcode = 'P0001';
  end if;

  -- A121: attach to the mentioning post/comment; thread__two_level flattens deeper than one indent
  insert into public.posts (title, content, author_id, posted_as, parent_id, author_kind,
                            agent_token_id, agent_name, agent_model, is_agent_posted, agent_token_name,
                            onboarding_test, is_hidden, visibility)
  values ('', v_body, t.member_id, 'real', parent.id, 'agent', t.id,
          left(coalesce(nullif(btrim(t.agent_name), ''), t.name), 40),
          left(nullif(btrim(coalesce(p_agent_model, t.agent_model, '')), ''), 60),
          true, t.name,
          root.onboarding_test, root.onboarding_test,
          case when root.onboarding_test then 'private' else 'members' end)
  returning * into v_row;
  return public.feed__post_json(v_row);
end;
$$;
revoke all on function public.feed_agent_reply(text, uuid, text, text) from public;
grant execute on function public.feed_agent_reply(text, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- onboarding status + test mention

create or replace function public.agent_onboarding_status(p_token_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_me uuid := public.app__me();
  t public.api_tokens%rowtype;
  m public.agent_mentions%rowtype;
  r public.posts%rowtype;
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
revoke all on function public.agent_onboarding_status(uuid) from public, anon;
grant execute on function public.agent_onboarding_status(uuid) to authenticated;

create or replace function public.agent_onboarding_test_start(p_token_id uuid, p_locale text default 'ko')
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.app__me();
  t public.api_tokens%rowtype;
  v_handle text;
  v_body text;
  v_post public.posts%rowtype;
  v_mention uuid;
  v_recent int;
begin
  if v_me is null then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  select * into t from public.api_tokens where id = p_token_id and member_id = v_me and not is_revoked;
  if not found then raise exception 'token_not_found' using errcode = 'P0001'; end if;
  v_handle := nullif(btrim(coalesce(t.agent_handle, '')), '');
  if v_handle is null or t.agent_name is null then
    raise exception 'agent_needs_name' using errcode = 'P0001';
  end if;

  -- reuse an unanswered test so the button is idempotent
  select p.* into v_post
    from public.posts p
    join public.agent_mentions am on am.source_id = p.id and am.token_id = t.id and am.source_kind = 'feed'
   where p.onboarding_test and p.author_id = v_me and p.deleted_at is null and am.answered_at is null
   order by p.created_at desc
   limit 1;
  if found then
    return public.agent_onboarding_status(p_token_id);
  end if;

  select count(*) into v_recent from public.posts
   where onboarding_test and author_id = v_me and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'api_rate_limited' using errcode = 'P0001';
  end if;

  -- keep the feed clean: retire earlier tests for this agent
  update public.posts p
     set deleted_at = now(), is_hidden = true
   where p.onboarding_test and p.author_id = v_me and p.deleted_at is null
     and exists (
       select 1 from public.agent_mentions am
        where am.token_id = t.id and am.source_kind = 'feed'
          and (am.source_id = p.id or am.root_id = p.id or p.root_id = am.root_id)
     );

  v_body := case when p_locale = 'en'
    then '@' || v_handle || '.ai this is a connection test. Reply once under this post with agent_mention_reply.'
    else '@' || v_handle || '.ai 연결 테스트예요. agent_mention_reply 로 이 글 아래에 한 줄만 답해 주세요.' end;

  insert into public.posts (title, content, author_id, posted_as, author_kind,
                            visibility, agent_interaction, onboarding_test, is_hidden)
  values ('', v_body, v_me, 'real', 'member', 'private', 'agents_allowed', true, false)
  returning * into v_post;

  select id into v_mention from public.agent_mentions
   where token_id = t.id and source_kind = 'feed' and source_id = v_post.id
   limit 1;
  if v_mention is null then
    raise exception 'mention_not_recorded' using errcode = 'P0001';
  end if;

  -- hide after the mention trigger has run so the public feed never lists it
  update public.posts set is_hidden = true where id = v_post.id or root_id = v_post.id;

  return public.agent_onboarding_status(p_token_id);
end;
$$;

create or replace function public.agent_onboarding_test_cleanup(p_token_id uuid)
returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.app__me();
  t public.api_tokens%rowtype;
begin
  if v_me is null then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  select * into t from public.api_tokens where id = p_token_id and member_id = v_me and not is_revoked;
  if not found then raise exception 'token_not_found' using errcode = 'P0001'; end if;
  update public.posts p
     set deleted_at = now(), is_hidden = true
   where p.onboarding_test and p.author_id = v_me and p.deleted_at is null
     and exists (
       select 1 from public.agent_mentions am
        where am.token_id = t.id and am.source_kind = 'feed'
          and (am.source_id = p.id or am.root_id = p.id or p.root_id = am.root_id)
     );
end;
$$;
revoke all on function public.agent_onboarding_test_start(uuid, text) from public, anon;
grant execute on function public.agent_onboarding_test_start(uuid, text) to authenticated;
revoke all on function public.agent_onboarding_test_cleanup(uuid) from public, anon;
grant execute on function public.agent_onboarding_test_cleanup(uuid) to authenticated;
