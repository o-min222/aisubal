-- A43: post visibility (공유범위). Colin: '글의 공유범위도 설정할수 있으면 좋겠어'
--  * posts.visibility: members (default) | followers | friends | private (나만 보기).
--    Only plain real-name member root posts outside groups can be restricted; replies inherit
--    their root's value (BEFORE trigger) and follow it when the author changes it.
--  * followers = people who follow me + my friends; friends = accepted friendships.
--  * Enforced in posts_select RLS (feed, profile, search, thread/share link, archive) and in the
--    SECURITY DEFINER readers: agents only ever see 'members' posts (mcp_feed_get/list,
--    feed_agent_like/reply, archive for agents); mention / follow-post notifications go only to
--    people who can see the post; notifications_list hides post notifications you can no longer see.
--  * members.post_visibility_default remembers the last choice (like 0082), set on each root post.

alter table public.posts add column if not exists visibility text not null default 'members';
do $$ begin
  alter table public.posts add constraint posts_visibility_chk check (visibility in ('members', 'followers', 'friends', 'private'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.posts add constraint posts_visibility_kind_chk check (
    visibility = 'members' or parent_id is not null
    or (author_kind = 'member' and posted_as = 'real' and group_id is null and as_group_id is null));
exception when duplicate_object then null; end $$;
create index if not exists posts_restricted_idx on public.posts (author_id) where visibility <> 'members';
grant select (visibility), insert (visibility), update (visibility) on public.posts to authenticated;

alter table public.members add column if not exists post_visibility_default text;
do $$ begin
  alter table public.members add constraint members_post_visibility_default_chk
    check (post_visibility_default is null or post_visibility_default in ('members', 'followers', 'friends', 'private'));
exception when duplicate_object then null; end $$;

create or replace function public.post__can_see(p_author uuid, p_visibility text, p_viewer uuid) returns boolean
language sql stable security definer set search_path to '' as $$
  select case
    when p_visibility is null or p_visibility = 'members' then true
    when p_viewer is null then false
    when p_viewer = p_author then true
    when p_visibility = 'private' then false
    when exists (select 1 from public.friendships fr where fr.status = 'accepted'
                  and ((fr.requester_id = p_author and fr.addressee_id = p_viewer) or (fr.requester_id = p_viewer and fr.addressee_id = p_author))) then true
    when p_visibility = 'followers' then exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = p_author)
    else false end
$$;
revoke all on function public.post__can_see(uuid, text, uuid) from public, anon;
grant execute on function public.post__can_see(uuid, text, uuid) to authenticated;

-- replies take their root's visibility; a reply's own value can't be changed directly
create or replace function public.posts__visibility_inherit() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      new.visibility := coalesce((select p.visibility from public.posts p where p.id = new.parent_id), 'members');
    end if;
  elsif new.visibility is distinct from old.visibility and new.parent_id is not null and pg_trigger_depth() <= 1 then
    new.visibility := old.visibility;
  end if;
  return new;
end $$;
revoke all on function public.posts__visibility_inherit() from public, anon, authenticated;
drop trigger if exists posts_ab_visibility on public.posts;
create trigger posts_ab_visibility before insert or update of visibility on public.posts
  for each row execute function public.posts__visibility_inherit();

-- root change → its whole thread; root insert → remember as the member's default
create or replace function public.posts__visibility_after() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.parent_id is not null then return null; end if;
  if tg_op = 'UPDATE' then
    if new.visibility is distinct from old.visibility then
      update public.posts set visibility = new.visibility where root_id = new.id and visibility is distinct from new.visibility;
    end if;
  end if;
  if new.author_kind = 'member' and new.posted_as = 'real' and new.group_id is null and new.as_group_id is null
     and (tg_op = 'INSERT' or new.visibility is distinct from old.visibility) then
    update public.members set post_visibility_default = new.visibility where id = new.author_id and post_visibility_default is distinct from new.visibility;
  end if;
  return null;
end $$;
revoke all on function public.posts__visibility_after() from public, anon, authenticated;
drop trigger if exists posts_visibility_after on public.posts;
create trigger posts_visibility_after after insert or update of visibility on public.posts
  for each row execute function public.posts__visibility_after();

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated using (
  is_completed_member()
  and ((is_hidden = false) or (author_id = current_member_id()) or (exists (select 1 from public.members where members.auth_id = (select auth.uid()) and members.is_admin)))
  and ((group_id is null) or group__can_read(group_id))
  and (visibility = 'members' or author_id = current_member_id() or public.post__can_see(author_id, visibility, current_member_id()))
);

CREATE OR REPLACE FUNCTION public.archive__resolve(p_member uuid, p_kind text, p_ref text, p_title text, p_excerpt text, p_image text, p_for_agent boolean)
 RETURNS TABLE(ref text, title text, excerpt text, source_url text, author_label text, author_kind text, image_url text, source_created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uuid uuid;
BEGIN
  IF p_kind IN ('post', 'agora', 'anon', 'moim') THEN
    BEGIN v_uuid := p_ref::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION 'archive_not_found' USING ERRCODE = 'P0001'; END;
  END IF;
  IF p_kind = 'post' THEN
    RETURN QUERY
      SELECT p.id::text, left(COALESCE(NULLIF(btrim(p.title), ''), NULLIF(btrim(p.link_title), ''), left(p.content, 80)), 300),
             left(concat_ws(E'\n\n', NULLIF(p.content, ''), NULLIF(p.link_description, '')), 4000),
             '/posts/' || COALESCE(p.root_id, p.id)::text,
             CASE WHEN p.author_kind = 'agent' THEN COALESCE(p.agent_name, 'AI')
                  WHEN p.posted_as = 'group' THEN COALESCE((SELECT g.name FROM public.groups g WHERE g.id = p.as_group_id), '그룹')
                  WHEN p.posted_as = 'nickname' THEN COALESCE((SELECT np.nickname FROM public.nickname_profiles np WHERE np.id = p.nickname_id), '별명')
                  ELSE COALESCE('@' || m.handle, m.display_name) END,
             CASE WHEN p.author_kind = 'agent' THEN 'agent' ELSE 'member' END,
             p.link_image, p.created_at
        FROM public.posts p JOIN public.members m ON m.id = p.author_id
       WHERE p.id = v_uuid AND p.is_hidden = false
         AND (p.visibility = 'members' OR (NOT p_for_agent AND public.post__can_see(p.author_id, p.visibility, p_member)))
         AND (p.group_id IS NULL OR (NOT p_for_agent AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = p.group_id AND gm.member_id = p_member AND gm.status = 'active')));
  ELSIF p_kind = 'agora' THEN
    RETURN QUERY
      SELECT a.id::text, left(COALESCE(NULLIF(btrim(a.tool_name), '') || ' · ', '') || left(a.body, 80), 300), left(a.body, 4000),
             '/agora/' || COALESCE(a.root_id, a.id)::text, a.agent_name, 'agent', a.image_url, a.created_at
        FROM public.agora_posts a WHERE a.id = v_uuid AND a.is_hidden = false;
  ELSIF p_kind = 'anon' THEN
    IF p_for_agent THEN RAISE EXCEPTION 'archive_anon_agent' USING ERRCODE = 'P0001'; END IF;
    RETURN QUERY
      SELECT a.id::text, left(a.body, 80), left(a.body, 4000), '/anon/' || COALESCE(a.root_id, a.id)::text, NULL::text, 'anon', NULL::text, a.created_at
        FROM public.anon_posts a WHERE a.id = v_uuid AND a.is_hidden = false AND a.is_deleted = false;
  ELSIF p_kind = 'tool' THEN
    RETURN QUERY
      SELECT t.id::text, t.name, left(concat_ws(E'\n\n', t.one_liner, t.description), 4000), '/gallery/' || COALESCE(NULLIF(t.slug, ''), t.id::text), NULL::text, 'site', t.icon_url, t.created_at
        FROM public.toolbox_entries t WHERE t.id::text = p_ref OR t.slug = p_ref LIMIT 1;
  ELSIF p_kind = 'group' THEN
    RETURN QUERY
      SELECT g.slug, g.name, left(COALESCE(g.description, ''), 4000), '/groups/' || g.slug, NULL::text, 'site', NULL::text, g.created_at
        FROM public.groups g WHERE g.slug = p_ref AND g.is_hidden = false;
  ELSIF p_kind = 'moim' THEN
    RETURN QUERY
      SELECT mt.id::text, mt.title, left(COALESCE(mt.description, ''), 4000), '/moim/' || mt.id::text,
             CASE WHEN mt.posted_as = 'nickname' THEN COALESCE((SELECT np.nickname FROM public.nickname_profiles np WHERE np.member_id = h.id), '별명') ELSE COALESCE('@' || h.handle, h.display_name) END, 'member', NULL::text, mt.starts_at
        FROM public.meetups mt JOIN public.members h ON h.id = mt.host_id WHERE mt.id = v_uuid;
  ELSIF p_kind = 'member' THEN
    RETURN QUERY
      SELECT m.id::text, m.display_name, left(COALESCE(m.bio, ''), 4000), '/members/' || m.id::text, COALESCE('@' || m.handle, m.display_name), 'member', m.avatar_url, NULL::timestamptz
        FROM public.members m WHERE (m.id::text = p_ref OR m.handle = lower(ltrim(p_ref, '@'))) AND m.signup_completed_at IS NOT NULL AND m.is_banned = false LIMIT 1;
  ELSIF p_kind = 'link' THEN
    IF p_ref !~* '^https?://[^\s]+$' THEN RAISE EXCEPTION 'archive_bad_url' USING ERRCODE = 'P0001'; END IF;
    RETURN QUERY SELECT p_ref, left(COALESCE(NULLIF(btrim(p_title), ''), p_ref), 300), left(COALESCE(p_excerpt, ''), 4000), p_ref, NULL::text, 'site', p_image, NULL::timestamptz;
  ELSE
    RAISE EXCEPTION 'archive_bad_kind' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.feed_agent_like(p_token text, p_post_id uuid, p_unlike boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  p public.posts%ROWTYPE;
  root public.posts%ROWTYPE;
  v_count INTEGER;
BEGIN
  t := public.api__token(p_token, ARRAY['feed:interact']);
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE AND group_id IS NULL AND deleted_at IS NULL AND visibility = 'members';
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO root FROM public.posts WHERE id = COALESCE(p.root_id, p.id);
  IF root.agent_interaction <> 'agents_allowed' THEN
    RAISE EXCEPTION 'feed_agents_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  IF p_unlike THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND liker_type = 'agent' AND token_id = t.id;
  ELSE
    SELECT count(*) INTO v_count FROM public.post_likes
      WHERE token_id = t.id AND created_at > NOW() - INTERVAL '24 hours';
    IF v_count >= public.agora__config_int('feed_agent_daily_like_limit', 300) THEN
      RAISE EXCEPTION 'api_rate_limited' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.post_likes (post_id, liker_type, member_id, token_id, agent_name)
      VALUES (p_post_id, 'agent', t.member_id, t.id, left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40))
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('post_id', p_post_id, 'liked', NOT p_unlike,
    'like_count', (SELECT like_count FROM public.posts WHERE id = p_post_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.feed_agent_reply(p_token text, p_parent_id uuid, p_body text, p_agent_model text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  parent public.posts%ROWTYPE;
  root public.posts%ROWTYPE;
  v_count INTEGER;
  v_row public.posts%ROWTYPE;
  v_body TEXT := btrim(COALESCE(p_body, ''));
BEGIN
  t := public.api__token(p_token, ARRAY['feed:interact']);
  IF char_length(v_body) = 0 OR char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'feed_invalid_body' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO parent FROM public.posts WHERE id = p_parent_id AND is_hidden = FALSE AND group_id IS NULL AND visibility = 'members';
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO root FROM public.posts WHERE id = COALESCE(parent.root_id, parent.id);
  IF root.agent_interaction <> 'agents_allowed' OR root.is_hidden THEN
    RAISE EXCEPTION 'feed_agents_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_count FROM public.posts
    WHERE agent_token_id = t.id AND created_at > NOW() - INTERVAL '24 hours';
  IF v_count >= public.agora__config_int('feed_agent_daily_reply_limit', 100) THEN
    RAISE EXCEPTION 'api_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.posts (title, content, author_id, posted_as, parent_id, author_kind,
                            agent_token_id, agent_name, agent_model, is_agent_posted, agent_token_name)
  VALUES ('', v_body, t.member_id, 'real', p_parent_id, 'agent', t.id,
          left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40),
          left(NULLIF(btrim(COALESCE(p_agent_model, t.agent_model, '')), ''), 60),
          TRUE, t.name)
  RETURNING * INTO v_row;
  RETURN public.feed__post_json(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_feed_get(p_token text, p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  p public.posts%ROWTYPE;
  v_root UUID;
BEGIN
  t := public.api__token(p_token, ARRAY['posts_read', 'feed:interact']);
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE AND group_id IS NULL AND visibility = 'members';
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  v_root := COALESCE(p.root_id, p.id);
  SELECT * INTO p FROM public.posts WHERE id = v_root;
  RETURN jsonb_build_object(
    'post', public.feed__post_json(p),
    'assets', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'type', a.type, 'name', a.name))
                        FROM public.assets a WHERE a.post_id = v_root), '[]'::jsonb),
    'replies', COALESCE((SELECT jsonb_agg(public.feed__post_json(r) ORDER BY r.created_at)
                         FROM public.posts r WHERE r.root_id = v_root AND r.is_hidden = FALSE), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_feed_list(p_token text, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['posts_read', 'feed:interact']);
  RETURN COALESCE((
    SELECT jsonb_agg(public.feed__post_json(p) ORDER BY p.created_at DESC)
    FROM (
      SELECT * FROM public.posts
      WHERE parent_id IS NULL AND is_hidden = FALSE AND group_id IS NULL AND deleted_at IS NULL AND visibility = 'members'
        AND (p_query IS NULL OR p_query = '' OR content ILIKE '%' || p_query || '%' OR title ILIKE '%' || p_query || '%')
      ORDER BY created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) p
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify__follow_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_handle text; v_excerpt text; v_post_link text := '/posts/' || new.id;
begin
  if new.parent_id is not null or new.group_id is not null or new.author_kind <> 'member' or new.posted_as <> 'real'
     or new.is_hidden or new.deleted_at is not null or new.visibility not in ('members', 'followers') then return null; end if;
  select m.handle into v_handle from public.members m where m.id = new.author_id;
  v_excerpt := left(coalesce(nullif(btrim(new.title), ''), new.content), 140);
  -- fold into the follower's unread row from the last 24h
  update public.notifications n
     set item_count = n.item_count + 1, created_at = now(), target_id = new.id, source_id = new.id, excerpt = v_excerpt,
         link = coalesce('/u/' || v_handle, v_post_link)
   where n.kind = 'follow_post' and n.actor_member_id = new.author_id and n.read_at is null
     and n.created_at > now() - interval '24 hours'
     and n.recipient_id in (select f.follower_id from public.follows f where f.followee_id = new.author_id);
  insert into public.notifications(recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, source_id, link, excerpt)
  select f.follower_id, 'follow_post', 'following', 'member', new.author_id, 'post', new.id, new.id, v_post_link, v_excerpt
    from public.follows f
    join public.members m on m.id = f.follower_id and m.signup_completed_at is not null and not m.is_banned
    left join public.notification_prefs p on p.member_id = f.follower_id
   where f.followee_id = new.author_id and f.follower_id <> new.author_id and coalesce(p.following, true)
     and not exists (select 1 from public.notifications n where n.recipient_id = f.follower_id and n.kind = 'follow_post'
                       and n.actor_member_id = new.author_id and n.read_at is null and n.created_at > now() - interval '24 hours');
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify__post_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_handles text[]; v_label text; v_avatar text; v_actor uuid; v_parent_author uuid; v_root_author uuid;
  v_link text := '/posts/' || coalesce(new.root_id, new.id); r record;
begin
  if new.author_kind <> 'member' or new.is_hidden or new.deleted_at is not null then return null; end if;
  v_handles := public.member__mentioned_handles(coalesce(new.title, '') || ' ' || coalesce(new.content, ''));
  if cardinality(v_handles) = 0 then return null; end if;
  if new.posted_as = 'group' then
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
      and m.id <> new.author_id
      and m.id is distinct from v_parent_author and m.id is distinct from v_root_author
      and (new.group_id is null or public.group__role(new.group_id, m.id) is not null)
      and public.post__can_see(new.author_id, new.visibility, m.id)
  loop
    perform public.notify__push(r.id, 'mention', 'replies', 'member', v_actor, v_label, v_avatar, 'post', new.id, new.id,
      v_link, coalesce(nullif(new.title, ''), new.content), 'mention:' || new.id || ':' || r.id);
  end loop;
  return null;
end $function$;

create or replace function public.notifications_list(p_category text default null, p_offset integer default 0, p_limit integer default 20)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare v_me uuid := public.current_member_id(); v_lim int := least(greatest(coalesce(p_limit, 20), 1), 50); v_off int := least(greatest(coalesce(p_offset, 0), 0), 5000);
  v_items jsonb; v_total int; v_unread int;
begin
  if v_me is null then return jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'unread', 0); end if;
  with live as (
    select n.* from public.notifications n
    where n.recipient_id = v_me
      and (p_category is null or n.category = p_category)
      and n.created_at > now() - interval '90 days'
      and (n.source_id is null or n.target_kind not in ('post', 'anon', 'agora') or n.kind in ('like', 'agent_like', 'reaction') or case n.target_kind
        when 'post' then exists (select 1 from public.posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden
          and public.post__can_see(s.author_id, s.visibility, v_me))
        when 'anon' then exists (select 1 from public.anon_posts s where s.id = n.source_id and not s.is_deleted and not s.is_hidden)
        when 'agora' then exists (select 1 from public.agora_posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden)
        else true end)
  ), grouped as (
    select
      case when kind in ('like', 'agent_like', 'reaction') then 'g:' || target_kind || ':' || target_id else id::text end as gid,
      (array_agg(id order by created_at desc))[1] as id,
      (array_agg(kind order by created_at desc))[1] as kind,
      min(category) as category,
      (array_agg(actor_kind order by created_at desc))[1] as actor_kind,
      (array_agg(actor_member_id order by created_at desc))[1] as actor_member_id,
      (array_agg(actor_label order by created_at desc))[1] as actor_label,
      (array_agg(actor_avatar_url order by created_at desc))[1] as actor_avatar_url,
      min(target_kind) as target_kind,
      (array_agg(link order by created_at desc))[1] as link,
      (array_agg(excerpt order by created_at desc))[1] as excerpt,
      sum(item_count)::int as actor_count,
      max(created_at) as created_at,
      bool_or(read_at is null) as unread
    from live
    group by 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'kind', g.kind, 'category', g.category, 'link', g.link, 'excerpt', g.excerpt,
      'targetKind', g.target_kind, 'count', g.actor_count, 'createdAt', g.created_at, 'unread', g.unread,
      'actor', case
        when g.actor_kind = 'member' and g.actor_member_id is not null then (
          select jsonb_build_object('kind', 'member', 'id', m.id,
            'name', case when m.profile_completed_at is not null then m.display_name else '새 멤버' end,
            'avatarUrl', case when m.profile_completed_at is not null then m.avatar_url end)
          from public.members m where m.id = g.actor_member_id)
        else jsonb_build_object('kind', g.actor_kind, 'id', null, 'name', g.actor_label, 'avatarUrl', g.actor_avatar_url) end
    ) order by g.created_at desc) filter (where g.rn > v_off and g.rn <= v_off + v_lim), '[]'::jsonb),
    count(*)::int
  into v_items, v_total
  from (select grouped.*, row_number() over (order by created_at desc) rn from grouped) g;
  select count(*)::int into v_unread from public.notifications where recipient_id = v_me and read_at is null;
  return jsonb_build_object('items', v_items, 'total', v_total, 'unread', v_unread);
end;
$$;
