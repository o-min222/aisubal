-- B14: post as a group. Group owners/mods may publish a root post under the group's
-- name and avatar (in the public feed or the group's own timeline). Same split as the 부캐:
-- * posts.as_group_id carries the identity; public_author_id is null on these rows, and
--   clients never had SELECT on posts.author_id, so REST/MCP can't see the writer.
-- * posts_mine(ids) tells the writer which rows are theirs (⋯ edit/delete).
-- * group_post_authors(ids) reveals the writer only to that group's owner/mods.
-- Notifications: follow_post already skips non-'real' rows; likes/replies go to the
-- real author's own inbox (author_id stays the owner of the row).

alter table public.posts add column if not exists as_group_id uuid references public.groups(id) on delete cascade;
create index if not exists posts_as_group_idx on public.posts (as_group_id, created_at desc) where as_group_id is not null;
grant select (as_group_id) on public.posts to authenticated;

alter table public.posts drop constraint if exists posts_posted_as_check;
alter table public.posts add constraint posts_posted_as_check check (posted_as in ('real', 'nickname', 'group'));
alter table public.posts drop constraint if exists posts_group_identity;
alter table public.posts add constraint posts_group_identity check ((posted_as = 'group') = (as_group_id is not null));
alter table public.posts drop constraint if exists posts_group_real_name;
alter table public.posts add constraint posts_group_real_name check (group_id is null or posted_as = 'real' or (posted_as = 'group' and as_group_id = group_id));

alter table public.posts alter column public_author_id set expression as
  (case when author_kind = 'member' and posted_as in ('nickname', 'group') then null else author_id end);

create or replace function public.posts__as_group() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if new.posted_as = 'group' then
    if new.author_kind <> 'member' or new.parent_id is not null then
      raise exception 'group_identity_root_only' using errcode = 'P0001';
    end if;
    if coalesce(public.group__role(new.as_group_id, new.author_id), '') not in ('owner', 'mod') then
      raise exception 'group_identity_forbidden' using errcode = 'P0001';
    end if;
  else
    new.as_group_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists posts_as_group on public.posts;
create trigger posts_as_group before insert or update of posted_as, as_group_id, author_id, parent_id on public.posts
  for each row execute function public.posts__as_group();

-- which of these rows did I write? (group-identity rows hide public_author_id)
create or replace function public.posts_mine(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path to ''
as $$
  select p.id from public.posts p
   where p.id = any(p_ids[1:200]) and p.author_id = public.current_member_id() and p.author_kind = 'member'
$$;
revoke all on function public.posts_mine(uuid[]) from public, anon;
grant execute on function public.posts_mine(uuid[]) to authenticated;

-- the writer behind group-identity rows, for that group's owner/mods only
create or replace function public.group_post_authors(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path to ''
as $$
  select coalesce(jsonb_object_agg(p.id, jsonb_build_object('id', m.id, 'name', m.display_name, 'handle', m.handle)), '{}'::jsonb)
    from public.posts p join public.members m on m.id = p.author_id
   where p.id = any(p_ids[1:200]) and p.posted_as = 'group'
     and coalesce(public.group__role(p.as_group_id, public.current_member_id()), '') in ('owner', 'mod')
$$;
revoke all on function public.group_post_authors(uuid[]) from public, anon;
grant execute on function public.group_post_authors(uuid[]) to authenticated;

-- REST/MCP reads: group rows show the group (an 'as_group' field + author kind 'group'), never the writer
CREATE OR REPLACE FUNCTION public.feed__post_json(p posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'parent_id', p.parent_id,
    'root_id', p.root_id,
    'depth', p.thread_depth,
    'reply_to_id', p.reply_to_id,
    'deleted', p.deleted_at IS NOT NULL,
    'edited', p.edited_at IS NOT NULL AND p.deleted_at IS NULL,
    'author', CASE WHEN p.deleted_at IS NOT NULL THEN NULL
      WHEN p.author_kind = 'agent'
      THEN jsonb_build_object('kind', 'agent', 'name', p.agent_name, 'model', p.agent_model,
             'owner', (SELECT m.display_name FROM public.members m WHERE m.id = p.author_id))
      WHEN p.posted_as = 'group'
      THEN (SELECT jsonb_build_object('kind', 'group', 'id', g.id, 'slug', g.slug, 'name', g.name) FROM public.groups g WHERE g.id = p.as_group_id)
      ELSE public.api__author_json(p.author_id, p.posted_as) END,
    'as_group', CASE WHEN p.posted_as = 'group' THEN
      (SELECT jsonb_build_object('id', g.id, 'slug', g.slug, 'name', g.name) FROM public.groups g WHERE g.id = p.as_group_id) END,
    'title', CASE WHEN p.deleted_at IS NULL THEN NULLIF(p.title, '') END,
    'body', CASE WHEN p.deleted_at IS NULL THEN p.content END,
    'url', CASE WHEN p.deleted_at IS NULL THEN p.url END,
    'link_title', CASE WHEN p.deleted_at IS NULL THEN p.link_title END,
    'link_description', CASE WHEN p.deleted_at IS NULL THEN p.link_description END,
    'authorship', CASE WHEN p.author_kind = 'agent' THEN 'agent' ELSE p.authorship END,
    'agent_interaction', p.agent_interaction,
    'like_count', p.like_count,
    'reply_count', p.reply_count,
    'created_at', p.created_at
  );
$function$;

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
