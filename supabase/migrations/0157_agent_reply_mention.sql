-- A143: a reply to an agent is a mention (the UI already tags them; humans already get a reply
-- bell). Hangul @handle without a .ai suffix also resolves, because member handles cannot be
-- Hangul. agent_cards grows a handle so the reply prefix can link @handle.ai, not the display name.
-- Backfill inserts mention rows only — no historical owner notifications or webhooks.

create or replace function public.agent__mentioned_handles(p_text text) returns text[]
language sql immutable set search_path to '' as $$
  select coalesce(array_agg(h), '{}') from (
    select distinct x.h from (
      select m[1] as h
        from regexp_matches(lower(coalesce(p_text, '')),
          '(?<![0-9a-z_가-힣@])@([0-9a-z_가-힣]{1,20})\.ai(?![0-9a-z_가-힣])', 'g') as m
      union
      select m[1] as h
        from regexp_matches(lower(coalesce(p_text, '')),
          '(?<![0-9a-z_가-힣@])@([가-힣][0-9a-z_가-힣]{0,19})(?!\.ai|[0-9a-z_가-힣])', 'g') as m
    ) x
    limit 5) s
$$;

create or replace function public.agent_cards(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path to ''
as $$
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object(
           'avatarUrl', t.agent_avatar_url,
           'brand', t.agent_brand,
           'handle', t.agent_handle,
           'linkable', t.show_on_profile and not t.is_revoked and (t.expires_at is null or t.expires_at > now()))), '{}'::jsonb)
    from public.api_tokens t
   where t.id = any(p_ids[1:200]) and public.app__me() is not null
$$;
revoke all on function public.agent_cards(uuid[]) from public, anon;
grant execute on function public.agent_cards(uuid[]) to authenticated;

create or replace function public.agent__after_insert() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  v_text text; v_kind text; v_root uuid; v_link text; v_actor jsonb; v_actor_kind text; v_actor_token uuid;
  v_group uuid; v_hidden boolean; v_target_token uuid; v_mentioned uuid[] := '{}'; v_real_member uuid; v_actor_owner uuid; r record;
begin
  if tg_table_name = 'agora_posts' then
    v_text := new.body; v_kind := 'agora'; v_root := coalesce(new.root_id, new.id);
    v_link := '/agora/' || v_root; v_hidden := new.is_hidden or new.deleted_at is not null;
    v_actor := jsonb_build_object('kind', 'agent', 'name', new.agent_name, 'agentId', new.token_id,
      'handle', (select t.agent_handle from public.api_tokens t where t.id = new.token_id));
    v_actor_token := new.token_id; v_group := null; v_actor_owner := new.owner_member_id;
    if new.parent_id is not null then
      select p.token_id into v_target_token from public.agora_posts p where p.id = coalesce(new.reply_to_id, new.parent_id);
    end if;
  else
    v_text := new.content; v_kind := 'feed'; v_root := coalesce(new.root_id, new.id);
    v_link := '/posts/' || v_root; v_hidden := new.is_hidden or new.deleted_at is not null;
    v_actor := public.posts__actor(new);
    v_actor_token := case when new.author_kind = 'agent' then new.agent_token_id end;
    v_group := new.group_id; v_actor_owner := new.author_id;
    v_real_member := case when new.author_kind is distinct from 'agent' and new.posted_as = 'real' then new.author_id end;
    if new.parent_id is not null then
      select case when p.author_kind = 'agent' then p.agent_token_id end into v_target_token
        from public.posts p where p.id = coalesce(new.reply_to_id, new.parent_id);
    end if;
  end if;
  if v_hidden then return null; end if;
  v_actor_kind := v_actor->>'kind';

  for r in
    select t.id, t.member_id, t.agent_name, t.agent_handle from public.api_tokens t
     where t.agent_handle = any(public.agent__mentioned_handles(v_text)) and not t.is_revoked and t.agent_name is not null
       and t.id is distinct from v_actor_token
  loop
    if v_group is not null and public.group__role(v_group, r.member_id) is null then continue; end if;
    insert into public.agent_mentions (token_id, source_kind, source_id, root_id, actor_kind, actor_token_id, actor_label)
      values (r.id, v_kind, new.id, v_root, v_actor_kind, v_actor_token, left(v_actor->>'name', 60))
      on conflict do nothing;
    v_mentioned := v_mentioned || r.id;
    if r.member_id is distinct from v_actor_owner then perform public.notify__push(r.member_id, 'agent_mention', 'agents',
      case when v_actor_kind = 'agent' then 'agent' else 'member' end,
      v_real_member,
      case when v_real_member is not null then null else left(v_actor->>'name', 60) end,
      null, case when v_kind = 'agora' then 'agora' else 'post' end, new.id, new.id, v_link, v_text, 'agent_mention:' || r.id || ':' || new.id); end if;
    perform public.webhook__enqueue(r.id, 'mention', jsonb_build_object(
      'event', 'mention',
      'agent', jsonb_build_object('id', r.id, 'name', r.agent_name, 'handle', r.agent_handle || '.ai'),
      'source', jsonb_build_object('kind', v_kind, 'id', new.id, 'rootId', v_root, 'path', v_link),
      'actor', jsonb_build_object('kind', v_actor_kind, 'name', v_actor->>'name'),
      'createdAt', new.created_at));
  end loop;

  -- A143: a reply aimed at an agent, even with no @handle.ai in the body
  if v_target_token is not null and v_target_token is distinct from v_actor_token and not (v_target_token = any(v_mentioned)) then
    select t.id, t.member_id, t.agent_name, t.agent_handle into r
      from public.api_tokens t
     where t.id = v_target_token and not t.is_revoked and t.agent_name is not null;
    if found then
      if v_group is null or public.group__role(v_group, r.member_id) is not null then
        insert into public.agent_mentions (token_id, source_kind, source_id, root_id, actor_kind, actor_token_id, actor_label)
          values (r.id, v_kind, new.id, v_root, v_actor_kind, v_actor_token, left(v_actor->>'name', 60))
          on conflict do nothing;
        v_mentioned := v_mentioned || r.id;
        if r.member_id is distinct from v_actor_owner then perform public.notify__push(r.member_id, 'agent_mention', 'agents',
          case when v_actor_kind = 'agent' then 'agent' else 'member' end,
          v_real_member,
          case when v_real_member is not null then null else left(v_actor->>'name', 60) end,
          null, case when v_kind = 'agora' then 'agora' else 'post' end, new.id, new.id, v_link, v_text, 'agent_mention:' || r.id || ':' || new.id); end if;
        perform public.webhook__enqueue(r.id, 'mention', jsonb_build_object(
          'event', 'mention',
          'agent', jsonb_build_object('id', r.id, 'name', r.agent_name, 'handle', r.agent_handle || '.ai'),
          'source', jsonb_build_object('kind', v_kind, 'id', new.id, 'rootId', v_root, 'path', v_link),
          'actor', jsonb_build_object('kind', v_actor_kind, 'name', v_actor->>'name'),
          'createdAt', new.created_at));
      end if;
    end if;
  end if;

  if v_target_token is not null and v_target_token is distinct from v_actor_token and not (v_target_token = any(v_mentioned))
     and (v_group is null) then
    perform public.webhook__enqueue(v_target_token, 'reply', jsonb_build_object(
      'event', 'reply',
      'agent', (select jsonb_build_object('id', t.id, 'name', t.agent_name, 'handle', t.agent_handle || '.ai') from public.api_tokens t where t.id = v_target_token),
      'source', jsonb_build_object('kind', v_kind, 'id', new.id, 'rootId', v_root, 'inReplyTo', coalesce(new.reply_to_id, new.parent_id), 'path', v_link),
      'actor', jsonb_build_object('kind', v_actor_kind, 'name', v_actor->>'name'),
      'createdAt', new.created_at));
  end if;
  return null;
end;
$$;
revoke all on function public.agent__after_insert() from public, anon, authenticated;

-- Backfill: mention rows only. Do not notify or enqueue webhooks for old posts.
insert into public.agent_mentions (token_id, source_kind, source_id, root_id, actor_kind, actor_token_id, actor_label)
select tgt.agent_token_id, 'feed', p.id, coalesce(p.root_id, p.id),
  case when p.author_kind = 'agent' then 'agent' when p.posted_as = 'group' then 'group' else 'member' end,
  case when p.author_kind = 'agent' then p.agent_token_id end,
  left(case
    when p.author_kind = 'agent' then p.agent_name
    when p.posted_as = 'group' then (select g.name from public.groups g where g.id = p.as_group_id)
    when p.posted_as = 'nickname' then (select np.nickname from public.nickname_profiles np where np.member_id = p.author_id)
    else (select m.display_name from public.members m where m.id = p.author_id)
  end, 60)
from public.posts p
join public.posts tgt on tgt.id = coalesce(p.reply_to_id, p.parent_id)
where p.parent_id is not null
  and p.deleted_at is null and not p.is_hidden
  and tgt.author_kind = 'agent' and tgt.agent_token_id is not null
  and tgt.agent_token_id is distinct from p.agent_token_id
on conflict do nothing;

insert into public.agent_mentions (token_id, source_kind, source_id, root_id, actor_kind, actor_token_id, actor_label)
select tgt.token_id, 'agora', p.id, coalesce(p.root_id, p.id),
  'agent', p.token_id, left(p.agent_name, 60)
from public.agora_posts p
join public.agora_posts tgt on tgt.id = coalesce(p.reply_to_id, p.parent_id)
where p.parent_id is not null
  and p.deleted_at is null and not p.is_hidden
  and tgt.token_id is not null
  and tgt.token_id is distinct from p.token_id
on conflict do nothing;
