-- A108: Brunch-style articles & series.
-- RPC-only tables (RLS on, no table grants). Anon defaults revoked.
-- Logged-out readers get article_public_teaser() / article_share_preview() only —
-- those SECURITY DEFINER RPCs return the truncated opening, never the full body.
-- Writer permission: members.article_writer (admins included). Kill switches:
--   site_config.article_publishing, article_public_teaser, article_share_preview (missing = on).

-- --------------------------------------------------------------------------- members + config
alter table public.members add column if not exists article_writer boolean not null default false;

insert into public.site_config (key, value) values
  ('article_publishing', 'true'),
  ('article_public_teaser', 'true'),
  ('article_share_preview', 'true')
on conflict (key) do nothing;

-- --------------------------------------------------------------------------- tables
create table if not exists public.article_series (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.members(id) on delete cascade,
  slug text not null unique check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and slug not in ('new','mine','series','edit')),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  cover_path text check (cover_path is null or char_length(cover_path) between 1 and 200),
  status text not null default 'draft' check (status in ('draft','published','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists article_series_author_idx on public.article_series (author_id, created_at desc);
create index if not exists article_series_status_idx on public.article_series (status, updated_at desc);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.members(id) on delete cascade,
  series_id uuid references public.article_series(id) on delete set null,
  episode_no integer check (episode_no is null or episode_no >= 1),
  slug text not null unique check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and slug not in ('new','mine','series','edit')),
  title text not null check (char_length(title) between 1 and 120),
  subtitle text check (subtitle is null or char_length(subtitle) <= 200),
  cover_path text check (cover_path is null or char_length(cover_path) between 1 and 200),
  body text not null default '' check (char_length(body) <= 100000),
  status text not null default 'draft' check (status in ('draft','published','hidden')),
  published_at timestamptz,
  edited_at timestamptz,
  reading_sec integer not null default 0 check (reading_sec >= 0),
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists articles_series_episode_uidx
  on public.articles (series_id, episode_no) where series_id is not null and episode_no is not null;
create index if not exists articles_published_idx on public.articles (published_at desc) where status = 'published';
create index if not exists articles_author_idx on public.articles (author_id, published_at desc);
create index if not exists articles_series_idx on public.articles (series_id, episode_no);

create table if not exists public.article_slug_redirects (
  old_slug text primary key check (char_length(old_slug) between 1 and 80),
  kind text not null check (kind in ('article','series')),
  target_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists article_slug_redirects_target_idx on public.article_slug_redirects (kind, target_id);

create table if not exists public.article_series_subs (
  member_id uuid not null references public.members(id) on delete cascade,
  series_id uuid not null references public.article_series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, series_id)
);
create index if not exists article_series_subs_series_idx on public.article_series_subs (series_id);

create table if not exists public.article_likes (
  article_id uuid not null references public.articles(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, member_id)
);
create index if not exists article_likes_member_idx on public.article_likes (member_id, created_at desc);

create table if not exists public.article_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  author_id uuid not null references public.members(id) on delete cascade,
  parent_id uuid references public.article_comments(id) on delete cascade,
  reply_to_id uuid references public.article_comments(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists article_comments_article_idx on public.article_comments (article_id, created_at);

alter table public.article_series enable row level security;
alter table public.articles enable row level security;
alter table public.article_slug_redirects enable row level security;
alter table public.article_series_subs enable row level security;
alter table public.article_likes enable row level security;
alter table public.article_comments enable row level security;

revoke all on public.article_series from public, anon, authenticated;
revoke all on public.articles from public, anon, authenticated;
revoke all on public.article_slug_redirects from public, anon, authenticated;
revoke all on public.article_series_subs from public, anon, authenticated;
revoke all on public.article_likes from public, anon, authenticated;
revoke all on public.article_comments from public, anon, authenticated;

-- archive: stash an article like a feed post or gallery item
do $c$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.archive_entries'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.archive_entries drop constraint %I', r.conname);
  end loop;
  alter table public.archive_entries add constraint archive_entries_kind_check
    check (kind in ('post','agora','tool','anon','group','moim','member','link','article'));
end
$c$;

-- notifications: new kind / category / target
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','first_post','digest','digest_hot','digest_pick','digest_nudge','question','repost','feedback',
  'article_published']));
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (category = any (array[
  'replies','likes','social','invites','agents','gallery','following','badges','meetups','newcomers','digest','admin','articles']));
alter table public.notifications drop constraint if exists notifications_target_kind_check;
alter table public.notifications add constraint notifications_target_kind_check check (target_kind = any (array[
  'post','agora','anon','member','submission','moim','feedback','article']));

alter table public.notification_prefs add column if not exists articles boolean not null default true;

-- --------------------------------------------------------------------------- helpers
create or replace function public.article__cfg_on(p_key text) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select value from public.site_config where key = p_key), 'true') <> 'false';
$$;
revoke all on function public.article__cfg_on(text) from public, anon, authenticated;

create or replace function public.article__can_draft() returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.members m
     where m.id = public.current_member_id()
       and m.signup_completed_at is not null and not m.is_banned);
$$;
revoke all on function public.article__can_draft() from public, anon, authenticated;

create or replace function public.article__can_publish_member(m public.members) returns boolean
language sql stable security definer set search_path to '' as $$
  select m.signup_completed_at is not null and not m.is_banned
     and (m.is_admin or m.article_writer)
     and public.article__cfg_on('article_publishing');
$$;
revoke all on function public.article__can_publish_member(public.members) from public, anon, authenticated;

create or replace function public.article__can_publish() returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.members m
     where m.id = public.current_member_id() and public.article__can_publish_member(m));
$$;
revoke all on function public.article__can_publish() from public, anon, authenticated;

create or replace function public.article__visible(a public.articles) returns boolean
language sql stable security definer set search_path to '' as $$
  select a.status = 'published'
     and exists (select 1 from public.members m where m.id = a.author_id and not m.is_banned
                   and m.signup_completed_at is not null);
$$;
revoke all on function public.article__visible(public.articles) from public, anon, authenticated;

create or replace function public.article__series_visible(s public.article_series) returns boolean
language sql stable security definer set search_path to '' as $$
  select s.status in ('published','completed')
     and exists (select 1 from public.members m where m.id = s.author_id and not m.is_banned
                   and m.signup_completed_at is not null);
$$;
revoke all on function public.article__series_visible(public.article_series) from public, anon, authenticated;

create or replace function public.article__plain_text(p_body text) returns text
language sql immutable set search_path to '' as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(coalesce(p_body, ''),
      E'```[\\s\\S]*?```', ' ', 'g'),
      E'`[^`]*`', ' ', 'g'),
      E'!\\[[^\\]]*\\]\\([^)]*\\)', ' ', 'g'),
      E'\\[([^\\]]*)\\]\\([^)]*\\)', '\1', 'g'),
      E'^#{1,6}\\s+', '', 'gn'),
      E'[*_~]+', '', 'g'),
      E'[\\u0000-\\u001f\\u007f]+', ' ', 'g'),
      E'[ \\t]{2,}', ' ', 'g'));
$$;
revoke all on function public.article__plain_text(text) from public, anon, authenticated;

create or replace function public.article__reading_sec(p_body text) returns integer
language sql immutable set search_path to '' as $$
  select case when char_length(public.article__plain_text(p_body)) <= 0 then 0
              else greatest(1, ceil(char_length(public.article__plain_text(p_body)) / 500.0)::int) * 60 end;
$$;
revoke all on function public.article__reading_sec(text) from public, anon, authenticated;

create or replace function public.article__teaser_body(p_body text, p_max integer default 800) returns text
language plpgsql immutable set search_path to '' as $$
declare
  raw text := btrim(replace(coalesce(p_body, ''), E'\r\n', E'\n'));
  slice text;
  cut int;
  i int;
  pos int;
  min_keep int;
begin
  if raw = '' then return ''; end if;
  if char_length(raw) <= p_max then return raw; end if;
  slice := left(raw, p_max);
  cut := char_length(slice);
  min_keep := floor(p_max * 0.45);
  i := strpos(reverse(slice), E'\n\n');
  if i > 0 then
    pos := char_length(slice) - i - 1;
    if pos >= min_keep then cut := pos; end if;
  end if;
  if cut = char_length(slice) then
    i := strpos(reverse(slice), E'다. ');
    if i > 0 then
      pos := char_length(slice) - i + 2; -- include '다.'
      if pos >= min_keep then cut := pos; end if;
    end if;
  end if;
  if cut = char_length(slice) then
    foreach i in array array[strpos(reverse(slice), E'。'), strpos(reverse(slice), E'. '), strpos(reverse(slice), E'? '), strpos(reverse(slice), E'! ')]
    loop
      -- handled below
    end loop;
    i := strpos(reverse(slice), '。');
    if i > 0 then pos := char_length(slice) - i + 1; if pos >= min_keep then cut := pos; end if; end if;
    if cut = char_length(slice) then
      i := strpos(reverse(slice), E'\n');
      if i > 0 then pos := char_length(slice) - i; if pos >= min_keep then cut := pos; end if; end if;
    end if;
  end if;
  return btrim(regexp_replace(left(slice, cut), E'[\\s.#*_>-]+$', '', 'g'));
end
$$;
revoke all on function public.article__teaser_body(text, integer) from public, anon, authenticated;

create or replace function public.article__sanitize_line(p text, p_max integer default 100) returns text
language plpgsql immutable set search_path to '' as $$
declare l text := btrim(coalesce(p, ''));
begin
  l := regexp_replace(l, '(https?://|www\.)\S+', '', 'gi');
  l := regexp_replace(l, '@[A-Za-z0-9_.가-힣-]+', '', 'g');
  l := btrim(regexp_replace(l, '\s+', ' ', 'g'));
  if char_length(l) > p_max then l := btrim(regexp_replace(left(l, p_max - 1), E'[\\s.…]+$', '', 'g')); end if;
  if char_length(l) < 4 then return null; end if;
  return l;
end
$$;
revoke all on function public.article__sanitize_line(text, integer) from public, anon, authenticated;

create or replace function public.article__slug_base(p_title text) returns text
language sql immutable set search_path to '' as $$
  select left(btrim(lower(regexp_replace(coalesce(p_title, ''), '[^a-zA-Z0-9]+', '-', 'g')), '-'), 60);
$$;
revoke all on function public.article__slug_base(text) from public, anon, authenticated;

create or replace function public.article__unique_slug(p_title text, p_id uuid, p_kind text) returns text
language plpgsql stable security definer set search_path to '' as $$
declare
  v_base text := public.article__slug_base(p_title);
  v_slug text;
  i int := 2;
begin
  if v_base = '' or v_base in ('new','mine','series','edit') then
    v_base := 'article-' || substr(replace(p_id::text, '-', ''), 1, 8);
  end if;
  v_slug := v_base;
  loop
    exit when not exists (
      select 1 from public.articles a where a.slug = v_slug and (p_kind <> 'article' or a.id <> p_id)
    ) and not exists (
      select 1 from public.article_series s where s.slug = v_slug and (p_kind <> 'series' or s.id <> p_id)
    ) and not exists (
      select 1 from public.article_slug_redirects r where r.old_slug = v_slug and not (r.kind = p_kind and r.target_id = p_id)
    ) and v_slug not in ('new','mine','series','edit');
    v_slug := left(v_base, 56) || '-' || i;
    i := i + 1;
  end loop;
  return v_slug;
end
$$;
revoke all on function public.article__unique_slug(text, uuid, text) from public, anon, authenticated;

create or replace function public.article__cover_ok(p_path text) returns boolean
language sql stable security definer set search_path to '' as $$
  select p_path is not null
     and (storage.foldername(p_path))[1] = (select auth.uid())::text
     and exists (select 1 from storage.objects o where o.bucket_id = 'article-images' and o.name = p_path);
$$;
revoke all on function public.article__cover_ok(text) from public, anon, authenticated;

create or replace function public.article__author_json(p_id uuid) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', m.id, 'name', m.display_name, 'handle', m.handle, 'avatarUrl', m.avatar_url)
    from public.members m where m.id = p_id;
$$;
revoke all on function public.article__author_json(uuid) from public, anon, authenticated;

create or replace function public.article__series_brief(s public.article_series) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'title', s.title, 'description', s.description,
    'coverPath', s.cover_path, 'status', s.status,
    'episodeCount', (select count(*)::int from public.articles a where a.series_id = s.id and a.status = 'published'),
    'authorId', s.author_id);
$$;
revoke all on function public.article__series_brief(public.article_series) from public, anon, authenticated;

create or replace function public.article__card(a public.articles, p_body text default null) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'title', a.title, 'subtitle', a.subtitle,
    'coverPath', a.cover_path, 'status', a.status,
    'publishedAt', a.published_at, 'editedAt', a.edited_at, 'createdAt', a.created_at, 'updatedAt', a.updated_at,
    'readingSec', a.reading_sec, 'likeCount', a.like_count, 'commentCount', a.comment_count,
    'episodeNo', a.episode_no, 'seriesId', a.series_id,
    'author', public.article__author_json(a.author_id),
    'series', (select public.article__series_brief(s) from public.article_series s where s.id = a.series_id),
    'body', p_body
  );
$$;
revoke all on function public.article__card(public.articles, text) from public, anon, authenticated;

-- resolve a slug (or old slug) to an article row
create or replace function public.article__by_slug(p_slug text) returns public.articles
language plpgsql stable security definer set search_path to '' as $$
declare a public.articles; v text := btrim(coalesce(p_slug, ''));
begin
  select * into a from public.articles where slug = v;
  if found then return a; end if;
  select art.* into a from public.article_slug_redirects r
    join public.articles art on art.id = r.target_id
   where r.kind = 'article' and r.old_slug = v;
  return a;
end
$$;
revoke all on function public.article__by_slug(text) from public, anon, authenticated;

create or replace function public.article_series__by_slug(p_slug text) returns public.article_series
language plpgsql stable security definer set search_path to '' as $$
declare s public.article_series; v text := btrim(coalesce(p_slug, ''));
begin
  select * into s from public.article_series where slug = v;
  if found then return s; end if;
  select ser.* into s from public.article_slug_redirects r
    join public.article_series ser on ser.id = r.target_id
   where r.kind = 'series' and r.old_slug = v;
  return s;
end
$$;
revoke all on function public.article_series__by_slug(text) from public, anon, authenticated;

-- --------------------------------------------------------------------------- writer / get_my_member / admin
create or replace function public.get_my_member() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
DECLARE uid UUID := (SELECT auth.uid()); r public.members%ROWTYPE; p public.member_private%ROWTYPE; np public.nickname_profiles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.members WHERE auth_id = uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.member_private WHERE member_id = r.id;
  SELECT * INTO np FROM public.nickname_profiles WHERE member_id = r.id;
  RETURN to_jsonb(r) || jsonb_build_object('email', COALESCE(p.email, ''), 'private_real_name', p.real_name,
    'private_google_avatar_url', p.google_avatar_url,
    'nickname', np.nickname, 'nickname_bio', np.bio, 'nickname_avatar_url', np.avatar_url,
    'nickname_created_at', np.created_at, 'nickname_id', np.id,
    'feedback_allowed', public.feedback__allowed(),
    'article_writer', r.article_writer,
    'article_can_publish', public.article__can_publish_member(r));
END;
$$;

create or replace function public.admin_set_article_writer(p_member uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v boolean;
begin
  if not public.app__is_admin() then raise exception 'not authorized'; end if;
  update public.members set article_writer = coalesce(p_on, false) where id = p_member returning article_writer into v;
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', p_member, 'articleWriter', v);
end $$;
revoke all on function public.admin_set_article_writer(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_article_writer(uuid, boolean) to authenticated;

create or replace function public.admin_list_users() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
BEGIN
  IF NOT public.app__is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at), '[]'::jsonb) FROM (
    SELECT m.id, m.display_name AS name, m.handle, pv.real_name AS "realName", pv.email,
      (SELECT COUNT(*)::int FROM public.posts p WHERE p.author_id = m.id) AS posts,
      m.is_admin AS "isAdmin", m.is_banned AS "isBanned", m.feedback_enabled AS "feedbackEnabled",
      m.article_writer AS "articleWriter", m.created_at
    FROM public.members m LEFT JOIN public.member_private pv ON pv.member_id = m.id
    WHERE m.signup_completed_at IS NOT NULL) x);
END;
$$;

-- prefs + articles category
create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('replies', p.replies, 'likes', p.likes, 'social', p.social, 'invites', p.invites,
      'agents', p.agents, 'gallery', p.gallery, 'following', p.following, 'badges', p.badges, 'meetups', p.meetups,
      'newcomers', p.newcomers, 'digest', p.digest, 'digest_weekly', p.digest_weekly, 'articles', p.articles)
    from public.notification_prefs p where p.member_id = public.current_member_id()),
    jsonb_build_object('replies', true, 'likes', true, 'social', true, 'invites', true, 'agents', true, 'gallery', true,
      'following', true, 'badges', true, 'meetups', true, 'newcomers', true, 'digest', true, 'digest_weekly', false, 'articles', true))
$$;

create or replace function public.notification_prefs_set(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_key not in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following', 'badges', 'meetups', 'newcomers',
                   'digest', 'digest_weekly', 'articles') then raise exception 'bad_pref' using errcode = 'P0001'; end if;
  insert into public.notification_prefs(member_id) values (v_me) on conflict (member_id) do nothing;
  execute format('update public.notification_prefs set %I = $1, updated_at = now() where member_id = $2', p_key)
    using coalesce(p_on, p_key <> 'digest_weekly'), v_me;
  return public.notification_prefs_get();
end $$;

-- --------------------------------------------------------------------------- public teaser (anon + authenticated) — NEVER returns full body
create or replace function public.article_public_teaser(p_slug text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare a public.articles; teaser text;
begin
  if not public.article__cfg_on('article_public_teaser') then return null; end if;
  a := public.article__by_slug(p_slug);
  if a.id is null or not public.article__visible(a) then return null; end if;
  teaser := public.article__teaser_body(a.body, 800);
  return public.article__card(a, teaser) || jsonb_build_object(
    'truncated', char_length(a.body) > char_length(teaser),
    'canonicalSlug', a.slug);
end
$$;
revoke all on function public.article_public_teaser(text) from public, anon, authenticated;
grant execute on function public.article_public_teaser(text) to anon, authenticated;

create or replace function public.article_share_preview(p_slug text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare a public.articles; title text; body text; src text;
begin
  if not public.article__cfg_on('article_share_preview') then return null; end if;
  a := public.article__by_slug(p_slug);
  if a.id is null or not public.article__visible(a) then return null; end if;
  if public.peek__has_pii(coalesce(a.title, '') || E'\n' || coalesce(a.subtitle, '') || E'\n' || coalesce(a.body, '')) then
    return null;
  end if;
  title := public.article__sanitize_line(a.title, 120);
  src := public.article__plain_text(a.body);
  if src = '' then src := coalesce(a.subtitle, a.title, ''); end if;
  body := public.article__sanitize_line(src, 100);
  if title is null and body is null then return null; end if;
  return jsonb_build_object('title', title, 'body', body, 'coverPath', a.cover_path, 'slug', a.slug);
end
$$;
revoke all on function public.article_share_preview(text) from public, anon, authenticated;
grant execute on function public.article_share_preview(text) to anon, authenticated;

-- true when an unauthenticated (or signed-in) viewer may fetch this private image
create or replace function public.article_image_ok(p_path text) returns boolean
language plpgsql stable security definer set search_path to '' as $$
declare path text := btrim(coalesce(p_path, '')); me uuid := public.current_member_id();
begin
  if path = '' or path like '%..%' then return false; end if;
  -- owner can always read their own uploads (drafts)
  if me is not null and exists (
    select 1 from public.members m where m.id = me and m.auth_id::text = (storage.foldername(path))[1]
  ) then return true; end if;
  if me is not null and public.app__is_admin() then
    if exists (select 1 from storage.objects o where o.bucket_id = 'article-images' and o.name = path) then return true; end if;
  end if;
  -- published cover
  if exists (select 1 from public.articles a where a.cover_path = path and public.article__visible(a)) then return true; end if;
  if exists (select 1 from public.article_series s where s.cover_path = path and public.article__series_visible(s)) then return true; end if;
  -- members may read images referenced in a visible article body
  if me is not null and exists (
    select 1 from public.articles a where public.article__visible(a) and a.body like '%' || path || '%'
  ) then return true; end if;
  -- anon may only read images referenced in the teaser prefix of a visible article
  if me is null and exists (
    select 1 from public.articles a
     where public.article__visible(a)
       and public.article__teaser_body(a.body, 800) like '%' || path || '%'
  ) then return true; end if;
  return false;
end
$$;
revoke all on function public.article_image_ok(text) from public, anon, authenticated;
grant execute on function public.article_image_ok(text) to anon, authenticated;

-- --------------------------------------------------------------------------- series CRUD
create or replace function public.article_series_upsert(
  p_id uuid, p_title text, p_description text, p_cover_path text, p_status text
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  s public.article_series;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := left(btrim(coalesce(p_description, '')), 2000);
  v_status text := coalesce(nullif(btrim(coalesce(p_status, '')), ''), 'draft');
  v_cover text := nullif(btrim(coalesce(p_cover_path, '')), '');
begin
  if v_me is null or not public.article__can_draft() then raise exception 'not_member' using errcode = 'P0001'; end if;
  if char_length(v_title) not between 1 and 120 then raise exception 'bad_title' using errcode = 'P0001'; end if;
  if v_status not in ('draft','published','completed') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  if v_status in ('published','completed') and not public.article__can_publish() then
    raise exception 'not_writer' using errcode = 'P0001';
  end if;
  if v_cover is not null and not public.article__cover_ok(v_cover) then raise exception 'bad_cover' using errcode = 'P0001'; end if;

  select * into s from public.article_series where id = v_id;
  if found then
    if s.author_id <> v_me and not public.app__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
    update public.article_series
       set title = v_title, description = v_desc,
           cover_path = v_cover,
           status = v_status,
           slug = case when s.title is distinct from v_title then public.article__unique_slug(v_title, s.id, 'series') else s.slug end,
           updated_at = now()
     where id = s.id
     returning * into s;
  else
    insert into public.article_series (id, author_id, slug, title, description, cover_path, status)
    values (v_id, v_me, public.article__unique_slug(v_title, v_id, 'series'), v_title, v_desc, v_cover, v_status)
    returning * into s;
  end if;
  return public.article__series_brief(s) || jsonb_build_object('isMine', true);
end
$$;
revoke all on function public.article_series_upsert(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.article_series_upsert(uuid, text, text, text, text) to authenticated;

create or replace function public.article_series_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s public.article_series; v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  s := public.article_series__by_slug(p_slug);
  if s.id is null then return null; end if;
  if not public.article__series_visible(s) and s.author_id <> v_me and not public.app__is_admin() then return null; end if;
  return public.article__series_brief(s) || jsonb_build_object(
    'author', public.article__author_json(s.author_id),
    'canonicalSlug', s.slug,
    'isMine', s.author_id = v_me,
    'subscribed', exists (select 1 from public.article_series_subs x where x.series_id = s.id and x.member_id = v_me),
    'subscriberCount', (select count(*)::int from public.article_series_subs x where x.series_id = s.id),
    'episodes', coalesce((
      select jsonb_agg(public.article__card(a, null) - 'body' order by a.episode_no nulls last, a.published_at)
        from public.articles a
       where a.series_id = s.id and (a.status = 'published' or a.author_id = v_me or public.app__is_admin())
    ), '[]'::jsonb)
  );
end
$$;
revoke all on function public.article_series_get(text) from public, anon, authenticated;
grant execute on function public.article_series_get(text) to authenticated;

create or replace function public.article_series_subscribe(p_series uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s public.article_series; v_me uuid := public.current_member_id(); v_on boolean;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into s from public.article_series where id = p_series;
  if not found or not public.article__series_visible(s) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.author_id = v_me then raise exception 'self_subscribe' using errcode = 'P0001'; end if;
  if coalesce(p_on, true) then
    insert into public.article_series_subs (member_id, series_id) values (v_me, s.id) on conflict do nothing;
    v_on := true;
  else
    delete from public.article_series_subs where member_id = v_me and series_id = s.id;
    v_on := false;
  end if;
  return jsonb_build_object('seriesId', s.id, 'subscribed', v_on,
    'subscriberCount', (select count(*)::int from public.article_series_subs x where x.series_id = s.id));
end
$$;
revoke all on function public.article_series_subscribe(uuid, boolean) from public, anon, authenticated;
grant execute on function public.article_series_subscribe(uuid, boolean) to authenticated;

-- --------------------------------------------------------------------------- article CRUD
create or replace function public.article_upsert(
  p_id uuid, p_title text, p_subtitle text, p_body text, p_cover_path text,
  p_series_id uuid, p_episode_no integer
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  a public.articles;
  s public.article_series;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_title text := btrim(coalesce(p_title, ''));
  v_sub text := nullif(left(btrim(coalesce(p_subtitle, '')), 200), '');
  v_body text := coalesce(p_body, '');
  v_cover text := nullif(btrim(coalesce(p_cover_path, '')), '');
begin
  if v_me is null or not public.article__can_draft() then raise exception 'not_member' using errcode = 'P0001'; end if;
  if char_length(v_title) not between 1 and 120 then raise exception 'bad_title' using errcode = 'P0001'; end if;
  if char_length(v_body) > 100000 then raise exception 'body_too_long' using errcode = 'P0001'; end if;
  if v_cover is not null and not public.article__cover_ok(v_cover) then raise exception 'bad_cover' using errcode = 'P0001'; end if;
  if p_series_id is not null then
    select * into s from public.article_series where id = p_series_id;
    if not found or s.author_id <> v_me then raise exception 'bad_series' using errcode = 'P0001'; end if;
  end if;

  select * into a from public.articles where id = v_id;
  if found then
    if a.author_id <> v_me and not public.app__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
    update public.articles
       set title = v_title, subtitle = v_sub, body = v_body, cover_path = v_cover,
           series_id = p_series_id, episode_no = p_episode_no,
           slug = case when a.title is distinct from v_title then public.article__unique_slug(v_title, a.id, 'article') else a.slug end,
           reading_sec = public.article__reading_sec(v_body),
           edited_at = case when a.status = 'published' then now() else a.edited_at end,
           updated_at = now()
     where id = a.id
     returning * into a;
  else
    insert into public.articles (id, author_id, series_id, episode_no, slug, title, subtitle, cover_path, body, status, reading_sec)
    values (v_id, v_me, p_series_id, p_episode_no, public.article__unique_slug(v_title, v_id, 'article'),
            v_title, v_sub, v_cover, v_body, 'draft', public.article__reading_sec(v_body))
    returning * into a;
  end if;
  return public.article__card(a, a.body) || jsonb_build_object('isMine', true, 'canonicalSlug', a.slug);
end
$$;
revoke all on function public.article_upsert(uuid, text, text, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.article_upsert(uuid, text, text, text, text, uuid, integer) to authenticated;

create or replace function public.article_publish(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  a public.articles;
  s public.article_series;
  v_first boolean;
  v_ep int;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if not public.article__can_publish() then raise exception 'not_writer' using errcode = 'P0001'; end if;
  select * into a from public.articles where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.author_id <> v_me and not public.app__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if btrim(a.title) = '' or btrim(a.body) = '' then raise exception 'empty_article' using errcode = 'P0001'; end if;
  v_first := a.published_at is null;
  if v_first then
    if (select count(*) from public.articles x where x.author_id = a.author_id and x.published_at > now() - interval '24 hours') >= 5 then
      raise exception 'publish_rate_limited' using errcode = 'P0001';
    end if;
  end if;
  v_ep := a.episode_no;
  if a.series_id is not null and v_ep is null then
    select coalesce(max(episode_no), 0) + 1 into v_ep from public.articles where series_id = a.series_id;
  end if;
  update public.articles
     set status = 'published',
         published_at = coalesce(published_at, now()),
         episode_no = v_ep,
         reading_sec = public.article__reading_sec(body),
         updated_at = now()
   where id = a.id
   returning * into a;
  if a.series_id is not null then
    update public.article_series
       set status = case when status = 'draft' then 'published' else status end, updated_at = now()
     where id = a.series_id;
  end if;
  return public.article__card(a, a.body) || jsonb_build_object('isMine', true, 'canonicalSlug', a.slug, 'firstPublish', v_first);
end
$$;
revoke all on function public.article_publish(uuid) from public, anon, authenticated;
grant execute on function public.article_publish(uuid) to authenticated;

create or replace function public.article_hide(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); a public.articles;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into a from public.articles where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.author_id <> v_me and not public.app__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.articles set status = 'hidden', updated_at = now() where id = a.id returning * into a;
  return public.article__card(a, a.body) || jsonb_build_object('isMine', a.author_id = v_me);
end
$$;
revoke all on function public.article_hide(uuid) from public, anon, authenticated;
grant execute on function public.article_hide(uuid) to authenticated;

create or replace function public.article_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); a public.articles;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into a from public.articles where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.author_id <> v_me and not public.app__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if a.status = 'published' or (a.status = 'hidden' and a.comment_count > 0) then
    update public.articles set status = 'hidden', updated_at = now() where id = a.id;
    return jsonb_build_object('id', a.id, 'status', 'hidden', 'deleted', false);
  end if;
  delete from public.articles where id = a.id;
  return jsonb_build_object('id', a.id, 'deleted', true);
end
$$;
revoke all on function public.article_delete(uuid) from public, anon, authenticated;
grant execute on function public.article_delete(uuid) to authenticated;

-- member full-body read (drafts only for author/admin)
create or replace function public.article_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare a public.articles; v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  a := public.article__by_slug(p_slug);
  if a.id is null then return null; end if;
  if not public.article__visible(a) and a.author_id <> v_me and not public.app__is_admin() then return null; end if;
  return public.article__card(a, a.body) || jsonb_build_object(
    'canonicalSlug', a.slug,
    'isMine', a.author_id = v_me,
    'likedByMe', exists (select 1 from public.article_likes l where l.article_id = a.id and l.member_id = v_me),
    'subscribed', a.series_id is not null and exists (
      select 1 from public.article_series_subs x where x.series_id = a.series_id and x.member_id = v_me),
    'truncated', false
  );
end
$$;
revoke all on function public.article_get(text) from public, anon, authenticated;
grant execute on function public.article_get(text) to authenticated;

create or replace function public.article_get_id(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare a public.articles; v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into a from public.articles where id = p_id;
  if not found then return null; end if;
  if a.author_id <> v_me and not public.app__is_admin() and not public.article__visible(a) then return null; end if;
  if a.author_id <> v_me and not public.app__is_admin() then
    -- editors need the id path only for their own drafts
    return public.article_get(a.slug);
  end if;
  return public.article__card(a, a.body) || jsonb_build_object('canonicalSlug', a.slug, 'isMine', a.author_id = v_me, 'truncated', false);
end
$$;
revoke all on function public.article_get_id(uuid) from public, anon, authenticated;
grant execute on function public.article_get_id(uuid) to authenticated;

-- --------------------------------------------------------------------------- lists / search / feed cards
create or replace function public.article_list(p_tab text, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  v_tab text := coalesce(nullif(btrim(p_tab), ''), 'latest');
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total int := 0;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if v_tab = 'series' then
    select count(*)::int into v_total from public.article_series s where public.article__series_visible(s);
    select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_items from (
      select public.article__series_brief(s) || jsonb_build_object(
        'author', public.article__author_json(s.author_id),
        'subscribed', exists (select 1 from public.article_series_subs x where x.series_id = s.id and x.member_id = v_me)
      ) as j
        from public.article_series s
       where public.article__series_visible(s)
       order by s.updated_at desc
       limit v_limit offset v_offset
    ) x;
    return jsonb_build_object('tab', 'series', 'items', v_items, 'total', v_total);
  end if;
  if v_tab = 'subscribed' then
    select count(*)::int into v_total
      from public.articles a
      join public.article_series_subs sub on sub.series_id = a.series_id and sub.member_id = v_me
     where public.article__visible(a);
    select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_items from (
      select public.article__card(a, null) - 'body' as j
        from public.articles a
        join public.article_series_subs sub on sub.series_id = a.series_id and sub.member_id = v_me
       where public.article__visible(a)
       order by a.published_at desc
       limit v_limit offset v_offset
    ) x;
    return jsonb_build_object('tab', 'subscribed', 'items', v_items, 'total', v_total);
  end if;
  -- latest
  select count(*)::int into v_total from public.articles a where public.article__visible(a);
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_items from (
    select public.article__card(a, null) - 'body' as j
      from public.articles a
     where public.article__visible(a)
     order by a.published_at desc
     limit v_limit offset v_offset
  ) x;
  return jsonb_build_object('tab', 'latest', 'items', v_items, 'total', v_total);
end
$$;
revoke all on function public.article_list(text, integer, integer) from public, anon, authenticated;
grant execute on function public.article_list(text, integer, integer) to authenticated;

create or replace function public.article_list_mine(p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_items jsonb; v_series jsonb;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(x.j order by x.sort desc), '[]'::jsonb) into v_items from (
    select public.article__card(a, null) - 'body' as j, coalesce(a.updated_at, a.created_at) as sort
      from public.articles a
     where a.author_id = v_me
     order by coalesce(a.updated_at, a.created_at) desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  select coalesce(jsonb_agg(public.article__series_brief(s) order by s.updated_at desc), '[]'::jsonb) into v_series
    from public.article_series s where s.author_id = v_me;
  return jsonb_build_object('articles', v_items, 'series', v_series);
end
$$;
revoke all on function public.article_list_mine(integer, integer) from public, anon, authenticated;
grant execute on function public.article_list_mine(integer, integer) to authenticated;

create or replace function public.article_list_by_author(p_author uuid, p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_items jsonb; v_series jsonb;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_items from (
    select public.article__card(a, null) - 'body' as j
      from public.articles a
     where a.author_id = p_author and public.article__visible(a)
     order by a.published_at desc
     limit least(greatest(coalesce(p_limit, 10), 1), 50)
  ) x;
  select coalesce(jsonb_agg(public.article__series_brief(s) order by s.updated_at desc), '[]'::jsonb) into v_series
    from public.article_series s where s.author_id = p_author and public.article__series_visible(s);
  return jsonb_build_object('articles', coalesce(v_items, '[]'::jsonb), 'series', coalesce(v_series, '[]'::jsonb));
end
$$;
revoke all on function public.article_list_by_author(uuid, integer) from public, anon, authenticated;
grant execute on function public.article_list_by_author(uuid, integer) to authenticated;

create or replace function public.article_search(p_q text, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); q text := btrim(coalesce(p_q, '')); v_items jsonb;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_items from (
    select public.article__card(a, null) - 'body' as j
      from public.articles a
     where public.article__visible(a)
       and (a.title ilike '%' || q || '%' or a.subtitle ilike '%' || q || '%'
            or public.article__plain_text(a.body) ilike '%' || q || '%')
     order by a.published_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) x;
  return coalesce(v_items, '[]'::jsonb);
end
$$;
revoke all on function public.article_search(text, integer) from public, anon, authenticated;
grant execute on function public.article_search(text, integer) to authenticated;

-- compact cards for the home feed, in a published_at window (and optional author filter)
create or replace function public.article_feed_cards(
  p_scope text, p_after timestamptz, p_before timestamptz, p_limit integer default 20
) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  v_scope text := coalesce(nullif(btrim(p_scope), ''), 'all');
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 40);
  v_items jsonb;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_items from (
    select public.article__card(a, null) - 'body' as j
      from public.articles a
     where public.article__visible(a)
       and (p_after is null or a.published_at >= p_after)
       and (p_before is null or a.published_at <= p_before)
       and (
         v_scope in ('all', 'recommended', 'popular', 'for_you')
         or (v_scope = 'following' and exists (
              select 1 from public.follows f where f.follower_id = v_me and f.followee_id = a.author_id))
         or (v_scope = 'friends' and exists (
              select 1 from public.friendships fr
               where fr.status = 'accepted'
                 and ((fr.requester_id = v_me and fr.addressee_id = a.author_id)
                   or (fr.addressee_id = v_me and fr.requester_id = a.author_id))))
       )
     order by case when v_scope = 'popular' then a.like_count + a.comment_count else 0 end desc,
              a.published_at desc
     limit v_limit
  ) x;
  return coalesce(v_items, '[]'::jsonb);
end
$$;
revoke all on function public.article_feed_cards(text, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.article_feed_cards(text, timestamptz, timestamptz, integer) to authenticated;

-- --------------------------------------------------------------------------- likes + comments
create or replace function public.article_like_toggle(p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); a public.articles; v_on boolean; v_count int;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into a from public.articles where id = p_id;
  if not found or not public.article__visible(a) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.author_id = v_me then raise exception 'self_like' using errcode = 'P0001'; end if;
  if coalesce(p_on, true) then
    insert into public.article_likes (article_id, member_id) values (a.id, v_me) on conflict do nothing;
  else
    delete from public.article_likes where article_id = a.id and member_id = v_me;
  end if;
  select exists(select 1 from public.article_likes where article_id = a.id and member_id = v_me),
         (select count(*)::int from public.article_likes where article_id = a.id)
    into v_on, v_count;
  update public.articles set like_count = v_count where id = a.id;
  return jsonb_build_object('id', a.id, 'likedByMe', v_on, 'likeCount', v_count);
end
$$;
revoke all on function public.article_like_toggle(uuid, boolean) from public, anon, authenticated;
grant execute on function public.article_like_toggle(uuid, boolean) to authenticated;

create or replace function public.article__comment_json(c public.article_comments) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', c.id, 'articleId', c.article_id, 'parentId', c.parent_id, 'replyToId', c.reply_to_id,
    'body', case when c.deleted_at is not null then null else c.body end,
    'deleted', c.deleted_at is not null,
    'editedAt', c.edited_at, 'createdAt', c.created_at,
    'author', public.article__author_json(c.author_id),
    'isMine', c.author_id = public.current_member_id()
  );
$$;
revoke all on function public.article__comment_json(public.article_comments) from public, anon, authenticated;

create or replace function public.article_comments_list(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); a public.articles; v_items jsonb;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into a from public.articles where id = p_id;
  if not found or (not public.article__visible(a) and a.author_id <> v_me and not public.app__is_admin()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(public.article__comment_json(c) order by c.created_at), '[]'::jsonb) into v_items
    from public.article_comments c where c.article_id = a.id;
  return coalesce(v_items, '[]'::jsonb);
end
$$;
revoke all on function public.article_comments_list(uuid) from public, anon, authenticated;
grant execute on function public.article_comments_list(uuid) to authenticated;

create or replace function public.article_comment_add(p_id uuid, p_body text, p_parent uuid, p_reply_to uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  a public.articles;
  parent public.article_comments;
  reply_to public.article_comments;
  v_body text := btrim(coalesce(p_body, ''));
  c public.article_comments;
  v_parent uuid;
  v_reply uuid;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into a from public.articles where id = p_id;
  if not found or not public.article__visible(a) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'bad_body' using errcode = 'P0001'; end if;
  if (select count(*) from public.article_comments x where x.author_id = v_me and x.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'comment_rate_limited' using errcode = 'P0001';
  end if;
  if p_parent is not null then
    select * into parent from public.article_comments where id = p_parent and article_id = a.id;
    if not found or parent.deleted_at is not null then raise exception 'bad_parent' using errcode = 'P0001'; end if;
    -- two-level only: parent must be a top-level comment
    v_parent := coalesce(parent.parent_id, parent.id);
  end if;
  if p_reply_to is not null then
    select * into reply_to from public.article_comments where id = p_reply_to and article_id = a.id;
    if not found then raise exception 'bad_reply_to' using errcode = 'P0001'; end if;
    v_reply := reply_to.id;
    v_parent := coalesce(v_parent, coalesce(reply_to.parent_id, reply_to.id));
  end if;
  insert into public.article_comments (article_id, author_id, parent_id, reply_to_id, body)
  values (a.id, v_me, v_parent, v_reply, v_body)
  returning * into c;
  update public.articles set comment_count = (select count(*) from public.article_comments x where x.article_id = a.id and x.deleted_at is null)
   where id = a.id;
  return public.article__comment_json(c);
end
$$;
revoke all on function public.article_comment_add(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.article_comment_add(uuid, text, uuid, uuid) to authenticated;

create or replace function public.article_comment_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); c public.article_comments;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into c from public.article_comments where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if c.author_id <> v_me and not public.app__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.article_comments set deleted_at = coalesce(deleted_at, now()), body = case when deleted_at is null then '' else body end
   where id = c.id returning * into c;
  update public.articles set comment_count = (select count(*) from public.article_comments x where x.article_id = c.article_id and x.deleted_at is null)
   where id = c.article_id;
  return public.article__comment_json(c);
end
$$;
revoke all on function public.article_comment_delete(uuid) from public, anon, authenticated;
grant execute on function public.article_comment_delete(uuid) to authenticated;

-- --------------------------------------------------------------------------- triggers
create or replace function public.articles__slug_redirect() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.slug is distinct from old.slug then
    insert into public.article_slug_redirects (old_slug, kind, target_id)
    values (old.slug, 'article', new.id)
    on conflict (old_slug) do update set kind = 'article', target_id = excluded.target_id, created_at = now();
    delete from public.article_slug_redirects where old_slug = new.slug;
  end if;
  return new;
end
$$;
revoke all on function public.articles__slug_redirect() from public, anon, authenticated;
drop trigger if exists articles_slug_redirect on public.articles;
create trigger articles_slug_redirect after update of slug on public.articles
  for each row execute function public.articles__slug_redirect();

create or replace function public.article_series__slug_redirect() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.slug is distinct from old.slug then
    insert into public.article_slug_redirects (old_slug, kind, target_id)
    values (old.slug, 'series', new.id)
    on conflict (old_slug) do update set kind = 'series', target_id = excluded.target_id, created_at = now();
    delete from public.article_slug_redirects where old_slug = new.slug;
  end if;
  return new;
end
$$;
revoke all on function public.article_series__slug_redirect() from public, anon, authenticated;
drop trigger if exists article_series_slug_redirect on public.article_series;
create trigger article_series_slug_redirect after update of slug on public.article_series
  for each row execute function public.article_series__slug_redirect();

create or replace function public.articles__notify_publish() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_excerpt text; v_link text; v_series_title text;
begin
  if new.published_at is null or old.published_at is not null then return null; end if;
  v_link := '/articles/' || new.slug;
  v_excerpt := left(new.title, 140);
  if new.series_id is not null then
    select title into v_series_title from public.article_series where id = new.series_id;
    v_excerpt := left(coalesce(v_series_title, '') || case when new.episode_no is not null then ' ' || new.episode_no::text || '화 — ' else ' — ' end || new.title, 140);
    insert into public.notifications (recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, link, excerpt, dedupe_key)
    select sub.member_id, 'article_published', 'articles', 'member', new.author_id, 'article', new.id, v_link, v_excerpt, 'article_pub:' || new.id::text
      from public.article_series_subs sub
      left join public.notification_prefs p on p.member_id = sub.member_id
     where sub.series_id = new.series_id and sub.member_id <> new.author_id and coalesce(p.articles, true)
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  else
    insert into public.notifications (recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, link, excerpt, dedupe_key)
    select f.follower_id, 'article_published', 'articles', 'member', new.author_id, 'article', new.id, v_link, v_excerpt, 'article_pub:' || new.id::text
      from public.follows f
      left join public.notification_prefs p on p.member_id = f.follower_id
     where f.followee_id = new.author_id and f.follower_id <> new.author_id and coalesce(p.articles, true)
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return null;
exception when others then return null;
end
$$;
revoke all on function public.articles__notify_publish() from public, anon, authenticated;
drop trigger if exists articles_notify_publish on public.articles;
create trigger articles_notify_publish after update of published_at on public.articles
  for each row execute function public.articles__notify_publish();

create or replace function public.article_likes__notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare a public.articles;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
     where kind = 'like' and target_kind = 'article' and target_id = old.article_id and actor_member_id = old.member_id;
    return null;
  end if;
  select * into a from public.articles where id = new.article_id;
  if a.id is null or a.author_id = new.member_id then return null; end if;
  insert into public.notifications (recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, link, excerpt, dedupe_key)
  select a.author_id, 'like', 'likes', 'member', new.member_id, 'article', a.id, '/articles/' || a.slug, left(a.title, 140),
         'article_like:' || a.id::text || ':' || new.member_id::text
   where coalesce((select likes from public.notification_prefs p where p.member_id = a.author_id), true)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
exception when others then return null;
end
$$;
revoke all on function public.article_likes__notify() from public, anon, authenticated;
drop trigger if exists article_likes_notify on public.article_likes;
create trigger article_likes_notify after insert or delete on public.article_likes
  for each row execute function public.article_likes__notify();

create or replace function public.article_comments__notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare a public.articles; v_recipient uuid; v_kind text; v_parent public.article_comments;
begin
  select * into a from public.articles where id = new.article_id;
  if a.id is null then return null; end if;
  if new.parent_id is not null then
    select * into v_parent from public.article_comments where id = coalesce(new.reply_to_id, new.parent_id);
    v_recipient := coalesce(v_parent.author_id, a.author_id);
    v_kind := 'reply';
  else
    v_recipient := a.author_id;
    v_kind := 'comment';
  end if;
  if v_recipient is null or v_recipient = new.author_id then return null; end if;
  if not coalesce((select replies from public.notification_prefs p where p.member_id = v_recipient), true) then return null; end if;
  insert into public.notifications (recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, source_id, link, excerpt, dedupe_key)
  values (v_recipient, v_kind, 'replies', 'member', new.author_id, 'article', a.id, new.id,
          '/articles/' || a.slug, left(new.body, 140), 'article_comment:' || new.id::text)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
exception when others then return null;
end
$$;
revoke all on function public.article_comments__notify() from public, anon, authenticated;
drop trigger if exists article_comments_notify on public.article_comments;
create trigger article_comments_notify after insert on public.article_comments
  for each row execute function public.article_comments__notify();

-- --------------------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-images', 'article-images', false, 4194304, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists article_images_insert_own on storage.objects;
create policy article_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'article-images' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.article__can_draft()));

drop policy if exists article_images_update_own on storage.objects;
create policy article_images_update_own on storage.objects for update to authenticated
  using (bucket_id = 'article-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'article-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists article_images_delete_own on storage.objects;
create policy article_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'article-images' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.app__is_admin())));

drop policy if exists article_images_select on storage.objects;
create policy article_images_select on storage.objects for select to authenticated
  using (bucket_id = 'article-images' and public.article_image_ok(name));
