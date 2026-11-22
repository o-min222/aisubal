-- 부캐(별명) identity split, step 1 of 2 (additive; the app switches over, then 0053 locks down).
-- Before: members.nickname* was readable by every member next to id/display_name, posts.author_id
-- was readable on nickname posts, and posts.nickname_profile_id was 'nick_' + the first 16 hex of
-- the member uuid — three ways to unmask a 부캐.
-- After:
-- * public.nickname_profiles: random id, nickname, bio, photo. Members read those columns —
--   never member_id. Only the owner (nickname_profile_mine) and SECURITY DEFINER code see the link.
-- * posts.nickname_id → nickname_profiles (set by a trigger from the author; clients can't pick one).
-- * posts.public_author_id = author_id except on 부캐 posts (null). The app embeds authors through
--   it; 0053 revokes client SELECT on posts.author_id and drops members.nickname*.

create table if not exists public.nickname_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  nickname text not null check (nickname ~ '^[a-zA-Z0-9가-힣_]{2,24}$'),
  bio text check (bio is null or char_length(bio) <= 160),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists nickname_profiles_nickname_uniq on public.nickname_profiles (nickname);
alter table public.nickname_profiles enable row level security;
revoke all on public.nickname_profiles from anon, authenticated;
grant select (id, nickname, bio, avatar_url, created_at) on public.nickname_profiles to authenticated;
drop policy if exists nickname_profiles_read on public.nickname_profiles;
create policy nickname_profiles_read on public.nickname_profiles for select to authenticated using (public.is_completed_member());

insert into public.nickname_profiles (member_id, nickname, bio, avatar_url, created_at)
select m.id, m.nickname, m.nickname_bio, m.nickname_avatar_url, coalesce(m.nickname_created_at, now())
  from public.members m where m.nickname is not null
on conflict (member_id) do nothing;

-- posts: the 부캐 link + a public author column
alter table public.posts add column if not exists nickname_id uuid references public.nickname_profiles(id) on delete set null;
create index if not exists posts_nickname_idx on public.posts (nickname_id, created_at desc) where nickname_id is not null;
update public.posts p set nickname_id = np.id from public.nickname_profiles np
 where p.posted_as = 'nickname' and p.author_kind = 'member' and np.member_id = p.author_id and p.nickname_id is null;
update public.posts set nickname_profile_id = null where nickname_profile_id is not null;

alter table public.posts add column if not exists public_author_id uuid
  generated always as (case when author_kind = 'member' and posted_as = 'nickname' then null else author_id end) stored;
alter table public.posts drop constraint if exists posts_public_author_id_fkey;
alter table public.posts add constraint posts_public_author_id_fkey foreign key (public_author_id) references public.members(id);
create index if not exists posts_public_author_idx on public.posts (public_author_id, created_at desc);
grant select (public_author_id, nickname_id) on public.posts to authenticated;

create or replace function public.posts__nickname_id() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  new.nickname_profile_id := null;
  if new.author_kind = 'member' and new.posted_as = 'nickname' then
    select np.id into new.nickname_id from public.nickname_profiles np where np.member_id = new.author_id;
    if new.nickname_id is null then raise exception 'api_nickname_missing' using errcode = 'P0001'; end if;
  else
    new.nickname_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists posts_nickname_id on public.posts;
create trigger posts_nickname_id before insert or update of posted_as, author_id, nickname_id, nickname_profile_id on public.posts
  for each row execute function public.posts__nickname_id();

-- the owner's own 부캐 (server-side only for everyone else)
create or replace function public.nickname_profile_mine() returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object('id', np.id, 'nickname', np.nickname, 'bio', np.bio, 'avatarUrl', np.avatar_url, 'createdAt', np.created_at)
    from public.nickname_profiles np where np.member_id = public.current_member_id()
$$;
revoke all on function public.nickname_profile_mine() from public, anon;
grant execute on function public.nickname_profile_mine() to authenticated;

create or replace function public.profile_save_nickname(p_nickname text, p_bio text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare uid uuid := (select auth.uid()); me public.members%rowtype; v text := btrim(coalesce(p_nickname, ''));
  v_bio text := nullif(left(btrim(coalesce(p_bio, '')), 160), '');
begin
  select * into me from public.members where auth_id = uid for update;
  if not found or me.signup_completed_at is null or me.is_banned then raise exception 'forbidden' using errcode = '42501'; end if;
  if v !~ '^[a-zA-Z0-9가-힣_]{2,24}$' then raise exception 'profile_name_invalid' using errcode = 'P0001'; end if;
  if exists (select 1 from public.nickname_profiles np where np.nickname = v and np.member_id <> me.id) then raise exception 'profile_nickname_taken' using errcode = 'P0001'; end if;
  insert into public.nickname_profiles (member_id, nickname, bio) values (me.id, v, v_bio)
  on conflict (member_id) do update set nickname = excluded.nickname, bio = excluded.bio, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.api__author_json(p_member_id uuid, p_posted_as text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when p_posted_as = 'nickname' and np.id is not null then
      jsonb_build_object('kind', 'nickname', 'id', np.id, 'name', np.nickname, 'avatar_url', np.avatar_url)
    else jsonb_build_object('kind', 'real', 'id', m.id, 'name', m.display_name, 'handle', m.handle, 'avatar_url', m.avatar_url)
  end
  from public.members m left join public.nickname_profiles np on np.member_id = m.id
  where m.id = p_member_id;
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

-- notifications: 부캐 actors from nickname_profiles
create or replace function public.notify__post_reply() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare
  parent public.posts%rowtype; root public.posts%rowtype;
  v_actor_kind text; v_actor uuid; v_label text; v_avatar text; v_owner uuid;
  v_link text := '/posts/' || coalesce(new.root_id, new.id);
begin
  if new.parent_id is null or new.is_hidden or new.deleted_at is not null then return null; end if;
  select * into parent from public.posts where id = new.parent_id;
  if not found then return null; end if;
  select * into root from public.posts where id = coalesce(new.root_id, parent.id);
  if new.author_kind = 'agent' then
    v_actor_kind := 'agent'; v_actor := null; v_label := new.agent_name; v_owner := new.author_id;
  elsif new.posted_as = 'nickname' then
    v_actor_kind := 'member'; v_actor := null;
    select np.nickname, np.avatar_url into v_label, v_avatar from public.nickname_profiles np where np.member_id = new.author_id;
    v_owner := new.author_id;
  else
    v_actor_kind := 'member'; v_actor := new.author_id; v_owner := new.author_id;
  end if;
  -- the comment/reply being answered (members' own rows; skip the writer and the agent's owner)
  if parent.author_kind = 'member' and parent.author_id is distinct from v_owner then
    perform public.notify__push(parent.author_id,
      case when new.author_kind = 'agent' then 'agent_reply' when parent.parent_id is null then 'comment' else 'reply' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', parent.id, new.id, v_link, new.content);
  end if;
  -- the thread's author too, when they aren't the one answered
  if root.id is not null and root.id <> parent.id and root.author_kind = 'member'
     and root.author_id is distinct from v_owner and root.author_id is distinct from parent.author_id then
    perform public.notify__push(root.author_id, case when new.author_kind = 'agent' then 'agent_reply' else 'comment' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', root.id, new.id, v_link, new.content);
  end if;
  return null;
end;
$$;
