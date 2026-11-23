-- A19: you can like your own post (feed, agora, 익명). A self-like counts in the visible like count, but:
--  * it never notifies you (member self-likes were already skipped by notify__push; your own agent's
--    like on your post is skipped here too, since agent likes carry the token owner in member_id), and
--  * it earns no badge credit: the 'liked' badge counts likes from other people only.

drop trigger if exists post_likes_no_self on public.post_likes;
drop trigger if exists agora_likes_no_self on public.agora_likes;
drop trigger if exists anon_likes_no_self on anon_private.likes;
drop function if exists public.likes__no_self();

create or replace function public.notify__post_like() returns trigger
language plpgsql security definer set search_path to '' as $$
declare p public.posts%rowtype; v_key text;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where source_id = old.id and kind in ('like', 'agent_like');
    return null;
  end if;
  select * into p from public.posts where id = new.post_id;
  if not found or p.deleted_at is not null then return null; end if;
  if new.member_id is not null and new.member_id = p.author_id then return null; end if;
  v_key := 'like:' || new.post_id || ':' || coalesce(new.member_id::text, new.token_id::text);
  if new.liker_type = 'agent' then
    perform public.notify__push(p.author_id, 'agent_like', 'likes', 'agent', null, new.agent_name, null, 'post', p.id, new.id,
      '/posts/' || coalesce(p.root_id, p.id), coalesce(nullif(p.title, ''), p.content), v_key);
  else
    perform public.notify__push(p.author_id, 'like', 'likes', 'member', new.member_id, null, null, 'post', p.id, new.id,
      '/posts/' || coalesce(p.root_id, p.id), coalesce(nullif(p.title, ''), p.content), v_key);
  end if;
  return null;
end $$;

create or replace function public.notify__agora_like() returns trigger
language plpgsql security definer set search_path to '' as $$
declare p public.agora_posts%rowtype; v_key text;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where source_id = old.id and kind = 'like' and target_kind = 'agora';
    return null;
  end if;
  select * into p from public.agora_posts where id = new.post_id;
  if not found or p.deleted_at is not null then return null; end if;
  if new.member_id is not null and new.member_id = p.owner_member_id then return null; end if;
  v_key := 'agoralike:' || new.post_id || ':' || coalesce(new.member_id::text, new.token_id::text);
  perform public.notify__push(p.owner_member_id, 'like', 'agents',
    case when new.liker_type = 'agent' then 'agent' else 'member' end,
    case when new.liker_type = 'agent' then null else new.member_id end,
    case when new.liker_type = 'agent' then new.agent_name end, null,
    'agora', p.id, new.id, '/agora/' || coalesce(p.root_id, p.id), p.body, v_key);
  return null;
end $$;

-- 'liked' = most likes from OTHER people on one of your real posts
create or replace function public.badges__metrics(p_member uuid) returns table(badge text, value int)
language sql stable security definer set search_path to '' as $$
  with real_posts as (
    select p.like_count - (select count(*) from public.post_likes l where l.post_id = p.id and l.member_id = p_member)::int as like_count
    from public.posts p
    where p.author_id = p_member and p.posted_as = 'real' and p.author_kind = 'member' and p.as_group_id is null
      and not coalesce(p.is_agent_posted, false) and p.parent_id is null and p.deleted_at is null
  ), days as (
    select v.day, v.day - (row_number() over (order by v.day))::int as grp from public.member_visits v where v.member_id = p_member
  )
  select 'first_post', (select count(*)::int from real_posts)
  union all select 'liked', (select coalesce(max(like_count), 0)::int from real_posts)
  union all select 'gallery', (select count(*)::int from public.tool_submissions s where s.submitter_id = p_member and s.status = 'approved')
  union all select 'reviewer', (select count(*)::int from public.toolbox_reviews r where r.member_id = p_member)
  union all select 'inviter', (select count(*)::int from public.invite_codes i where i.created_by_id = p_member and i.used_by_id is not null)
  union all select 'streak', (select coalesce(max(n), 0)::int from (select count(*) n from days group by grp) x)
  union all select 'founder', (select case when m.pledge_no between 1 and 100 then m.pledge_no else 0 end from public.members m where m.id = p_member)
  union all select 'agent', (select count(*)::int from public.api_tokens t where t.member_id = p_member and t.first_used_at is not null)
$$;
revoke all on function public.badges__metrics(uuid) from public, anon, authenticated;

-- With self-likes in like_count, a tier can be reached one like *after* like_count crosses it, so the
-- posts branch re-checks on every like-count rise past the first tier until the top tier is held.
create or replace function public.badges__on_change() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_member uuid; v_tiers jsonb := public.badges__tiers();
begin
  case tg_table_name
    when 'posts' then
      if new.posted_as <> 'real' or new.author_kind <> 'member' or new.parent_id is not null then return null; end if;
      if tg_op = 'UPDATE' then
        if new.like_count <= old.like_count or new.like_count < (v_tiers -> 'liked' ->> 0)::int then return null; end if;
        if exists (select 1 from public.member_badges b where b.member_id = new.author_id and b.badge = 'liked'
                   and b.tier >= jsonb_array_length(v_tiers -> 'liked')) then return null; end if;
      end if;
      v_member := new.author_id;
    when 'tool_submissions' then
      if new.status <> 'approved' or old.status = 'approved' then return null; end if;
      v_member := new.submitter_id;
    when 'toolbox_reviews' then v_member := new.member_id;
    when 'invite_codes' then
      if new.used_by_id is null or old.used_by_id is not null then return null; end if;
      v_member := new.created_by_id;
    when 'api_tokens' then
      if new.first_used_at is null then return null; end if;
      v_member := new.member_id;
    when 'members' then
      if new.pledge_no is null and new.signup_completed_at is null then return null; end if;
      v_member := new.id;
    when 'member_visits' then v_member := new.member_id;
    else return null;
  end case;
  perform public.badges__award(v_member, true);
  return null;
exception when others then return null;
end $$;
revoke all on function public.badges__on_change() from public, anon, authenticated;
