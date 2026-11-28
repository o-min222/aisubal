-- A136: article thumbnail (optional, separate from the cover) and a per-member reusable image library.
--
--  * articles.thumbnail_path: validated like cover_path (own folder + the object exists); readable under the same
--    storage visibility rule (article_image_ok) as the cover.
--  * article_images: the member's library of uploaded covers/thumbnails. Owner-only (RLS select policy; there is
--    no insert/update/delete grant, writes go through the RPCs below). An agent's uploads land in its OWNER's library.
--  * article_image_blobs: agents have no Supabase session, so an agent upload is stored as a re-encoded JPEG/PNG row
--    (max 2 MB) under the owner's `{auth_id}/{uuid}.ext` path and served through the same /api/article-image route.
--  * Removing a library image never breaks an article: the library row goes, and the file only if nothing uses it.
--  * article_image_ok also matches the url-encoded form of a path (%2F) that the editor writes into the body.
--  * article__card / article_share_preview expose thumbnailPath and firstImagePath for card and OG fallbacks.

alter table public.articles
  add column if not exists thumbnail_path text
  check (thumbnail_path is null or char_length(thumbnail_path) between 1 and 200);

-- --------------------------------------------------------------------------- tables
create table if not exists public.article_images (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 200),
  kind text not null default 'cover' check (kind in ('cover', 'thumbnail', 'inline')),
  name text check (name is null or char_length(name) <= 80),
  agent_token_id uuid references public.api_tokens(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (member_id, path)
);
create index if not exists article_images_member_created_idx on public.article_images (member_id, created_at desc);
alter table public.article_images enable row level security;
revoke all on table public.article_images from public, anon, authenticated;
grant select on table public.article_images to authenticated;
drop policy if exists article_images_owner_select on public.article_images;
create policy article_images_owner_select on public.article_images for select to authenticated
  using (member_id = (select public.current_member_id()));

create table if not exists public.article_image_blobs (
  path text primary key check (char_length(path) between 1 and 200),
  mime text not null check (mime in ('image/jpeg', 'image/png')),
  bytes bytea not null check (octet_length(bytes) between 32 and 2097152),
  sha256 text not null,
  created_at timestamptz not null default now()
);
alter table public.article_image_blobs enable row level security;
revoke all on table public.article_image_blobs from public, anon, authenticated;

-- --------------------------------------------------------------------------- helpers
create or replace function public.article__image_exists(p_path text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'article-images' and o.name = p_path)
      or exists (select 1 from public.article_image_blobs b where b.path = p_path);
$$;
revoke all on function public.article__image_exists(text) from public, anon, authenticated;

-- own folder + the object exists (storage file or agent blob)
create or replace function public.article__cover_ok(p_path text) returns boolean
language sql stable security definer set search_path to '' as $$
  select p_path is not null
     and (storage.foldername(p_path))[1] = (select auth.uid())::text
     and public.article__image_exists(p_path);
$$;
revoke all on function public.article__cover_ok(text) from public, anon, authenticated;

-- same check for an agent acting for member p_member (no auth.uid() in an MCP call)
create or replace function public.article__member_image_ok(p_member uuid, p_path text) returns boolean
language sql stable security definer set search_path to '' as $$
  select p_path is not null
     and exists (select 1 from public.members m where m.id = p_member and m.auth_id::text = (storage.foldername(p_path))[1])
     and public.article__image_exists(p_path);
$$;
revoke all on function public.article__member_image_ok(uuid, text) from public, anon, authenticated;

-- first inline body image: the editor writes ![name](/api/article-image?p=<encoded path>)
create or replace function public.article__first_image(p_body text) returns text
language sql immutable set search_path to '' as $$
  select nullif(
    replace(replace(substring(coalesce(p_body, '') from '/api/article-image\?p=([^)\s"'']+)'), '%2F', '/'), '%2f', '/'),
    '');
$$;
revoke all on function public.article__first_image(text) from public, anon, authenticated;

-- how many of this member's articles (any status) or series still use the image
create or replace function public.article__image_uses(p_member uuid, p_path text) returns integer
language sql stable security definer set search_path to '' as $$
  select (
    (select count(*) from public.articles a
      where a.author_id = p_member
        and (a.cover_path = p_path or a.thumbnail_path = p_path
             or a.body like '%' || p_path || '%'
             or a.body like '%' || replace(p_path, '/', '%2F') || '%'))
    + (select count(*) from public.article_series s where s.author_id = p_member and s.cover_path = p_path)
  )::int;
$$;
revoke all on function public.article__image_uses(uuid, text) from public, anon, authenticated;

create or replace function public.article__image_json(i public.article_images) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', i.id, 'path', i.path, 'kind', i.kind, 'name', i.name, 'createdAt', i.created_at,
    'byAgent', i.agent_token_id is not null,
    'usedBy', public.article__image_uses(i.member_id, i.path));
$$;
revoke all on function public.article__image_json(public.article_images) from public, anon, authenticated;

-- --------------------------------------------------------------------------- card + share preview
create or replace function public.article__card(a public.articles, p_body text default null) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'title', a.title, 'subtitle', a.subtitle,
    'coverPath', a.cover_path, 'thumbnailPath', a.thumbnail_path,
    'firstImagePath', public.article__first_image(a.body), 'status', a.status,
    'publishedAt', a.published_at, 'editedAt', a.edited_at, 'createdAt', a.created_at, 'updatedAt', a.updated_at,
    'readingSec', a.reading_sec, 'likeCount', a.like_count, 'commentCount', a.comment_count,
    'episodeNo', a.episode_no, 'seriesId', a.series_id,
    'author', public.article__author_json(a.author_id),
    'agent', case when a.agent_token_id is null then null else public.article__agent_json(a.agent_token_id) end,
    'series', (select public.article__series_brief(s) from public.article_series s where s.id = a.series_id),
    'body', p_body
  );
$$;
revoke all on function public.article__card(public.articles, text) from public, anon, authenticated;

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
  return jsonb_build_object('title', title, 'body', body, 'coverPath', a.cover_path,
    'thumbnailPath', a.thumbnail_path, 'firstImagePath', public.article__first_image(a.body), 'slug', a.slug);
end
$$;
revoke all on function public.article_share_preview(text) from public, anon, authenticated;
grant execute on function public.article_share_preview(text) to anon, authenticated;

-- --------------------------------------------------------------------------- visibility (storage select policy uses this)
create or replace function public.article_image_ok(p_path text) returns boolean
language plpgsql stable security definer set search_path to '' as $$
declare path text := btrim(coalesce(p_path, '')); me uuid := public.current_member_id(); enc text;
begin
  if path = '' or path like '%..%' then return false; end if;
  enc := replace(path, '/', '%2F');
  -- owner can always read their own uploads (drafts, library)
  if me is not null and exists (
    select 1 from public.members m where m.id = me and m.auth_id::text = (storage.foldername(path))[1]
  ) then return true; end if;
  if me is not null and public.app__is_admin() then
    if public.article__image_exists(path) then return true; end if;
  end if;
  -- published cover or thumbnail
  if exists (select 1 from public.articles a where (a.cover_path = path or a.thumbnail_path = path) and public.article__visible(a)) then return true; end if;
  if exists (select 1 from public.article_series s where s.cover_path = path and public.article__series_visible(s)) then return true; end if;
  -- members may read images referenced in a visible article body
  if me is not null and exists (
    select 1 from public.articles a
     where public.article__visible(a) and (a.body like '%' || path || '%' or a.body like '%' || enc || '%')
  ) then return true; end if;
  -- anon may only read images referenced in the teaser prefix of a visible article
  if me is null and exists (
    select 1 from public.articles a
     where public.article__visible(a)
       and (public.article__teaser_body(a.body, 800) like '%' || path || '%'
            or public.article__teaser_body(a.body, 800) like '%' || enc || '%')
  ) then return true; end if;
  return false;
end
$$;
revoke all on function public.article_image_ok(text) from public, anon, authenticated;
grant execute on function public.article_image_ok(text) to anon, authenticated;

-- bytes of an agent-uploaded image, only when the viewer may see it
create or replace function public.article_image_blob(p_path text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare b public.article_image_blobs;
begin
  if not public.article_image_ok(p_path) then return null; end if;
  select * into b from public.article_image_blobs where path = btrim(p_path);
  if not found then return null; end if;
  return jsonb_build_object('mime', b.mime, 'b64', encode(b.bytes, 'base64'));
end
$$;
revoke all on function public.article_image_blob(text) from public, anon, authenticated;
grant execute on function public.article_image_blob(text) to anon, authenticated;

-- --------------------------------------------------------------------------- article_upsert gets thumbnail_path
drop function if exists public.article_upsert(uuid, text, text, text, text, uuid, integer);
create or replace function public.article_upsert(
  p_id uuid, p_title text, p_subtitle text, p_body text, p_cover_path text,
  p_series_id uuid, p_episode_no integer, p_thumbnail_path text default null
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
  v_thumb text := nullif(btrim(coalesce(p_thumbnail_path, '')), '');
begin
  if v_me is null or not public.article__can_draft() then raise exception 'not_member' using errcode = 'P0001'; end if;
  if char_length(v_title) not between 1 and 120 then raise exception 'bad_title' using errcode = 'P0001'; end if;
  if char_length(v_body) > 100000 then raise exception 'body_too_long' using errcode = 'P0001'; end if;
  if v_cover is not null and not public.article__cover_ok(v_cover) then raise exception 'bad_cover' using errcode = 'P0001'; end if;
  if v_thumb is not null and not public.article__cover_ok(v_thumb) then raise exception 'bad_thumbnail' using errcode = 'P0001'; end if;
  if p_series_id is not null then
    select * into s from public.article_series where id = p_series_id;
    if not found or s.author_id <> v_me then raise exception 'bad_series' using errcode = 'P0001'; end if;
  end if;

  select * into a from public.articles where id = v_id;
  if found then
    if a.author_id <> v_me and not public.app__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
    update public.articles
       set title = v_title, subtitle = v_sub, body = v_body, cover_path = v_cover, thumbnail_path = v_thumb,
           series_id = p_series_id, episode_no = p_episode_no,
           slug = case when a.title is distinct from v_title then public.article__unique_slug(v_title, a.id, 'article') else a.slug end,
           reading_sec = public.article__reading_sec(v_body),
           edited_at = case when a.status = 'published' then now() else a.edited_at end,
           updated_at = now()
     where id = a.id
     returning * into a;
  else
    insert into public.articles (id, author_id, series_id, episode_no, slug, title, subtitle, cover_path, thumbnail_path, body, status, reading_sec)
    values (v_id, v_me, p_series_id, p_episode_no, public.article__unique_slug(v_title, v_id, 'article'),
            v_title, v_sub, v_cover, v_thumb, v_body, 'draft', public.article__reading_sec(v_body))
    returning * into a;
  end if;
  return public.article__card(a, a.body) || jsonb_build_object('isMine', true, 'canonicalSlug', a.slug);
end
$$;
revoke all on function public.article_upsert(uuid, text, text, text, text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.article_upsert(uuid, text, text, text, text, uuid, integer, text) to authenticated;

-- --------------------------------------------------------------------------- library: members (session)
create or replace function public.article__library_cap() returns integer
language sql immutable set search_path to '' as $$ select 100 $$;
revoke all on function public.article__library_cap() from public, anon, authenticated;

create or replace function public.article_image_register(p_path text, p_kind text default 'cover', p_name text default null)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  v_path text := btrim(coalesce(p_path, ''));
  v_kind text := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), 'cover');
  v_name text := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  i public.article_images;
begin
  if v_me is null or not public.article__can_draft() then raise exception 'not_member' using errcode = 'P0001'; end if;
  if v_kind not in ('cover', 'thumbnail', 'inline') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if v_path = '' or v_path like '%..%' or not public.article__cover_ok(v_path) then raise exception 'bad_image' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.article_images where member_id = v_me and path = v_path)
     and (select count(*) from public.article_images where member_id = v_me) >= public.article__library_cap() then
    raise exception 'library_full' using errcode = 'P0001';
  end if;
  insert into public.article_images (member_id, path, kind, name)
  values (v_me, v_path, v_kind, v_name)
  on conflict (member_id, path) do update set created_at = now()
  returning * into i;
  return public.article__image_json(i);
end
$$;
revoke all on function public.article_image_register(text, text, text) from public, anon, authenticated;
grant execute on function public.article_image_register(text, text, text) to authenticated;

create or replace function public.article_image_list(p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id();
  v_limit int := least(greatest(coalesce(p_limit, 60), 1), 100);
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'images', coalesce((select jsonb_agg(public.article__image_json(i) order by i.created_at desc)
                          from (select * from public.article_images where member_id = v_me order by created_at desc limit v_limit) i), '[]'::jsonb),
    'total', (select count(*)::int from public.article_images where member_id = v_me),
    'cap', public.article__library_cap());
end
$$;
revoke all on function public.article_image_list(integer) from public, anon, authenticated;
grant execute on function public.article_image_list(integer) to authenticated;

-- unregister an image; the file/blob is dropped only when no article or series still uses it
create or replace function public.article__library_remove(p_member uuid, p_id uuid, p_only_token uuid default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  i public.article_images;
  v_uses int;
  v_blob boolean;
begin
  select * into i from public.article_images where id = p_id and member_id = p_member;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_only_token is not null and i.agent_token_id is distinct from p_only_token then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  delete from public.article_images where id = i.id;
  v_uses := public.article__image_uses(p_member, i.path);
  v_blob := exists (select 1 from public.article_image_blobs b where b.path = i.path);
  if v_uses = 0 and v_blob then
    delete from public.article_image_blobs where path = i.path;
  end if;
  return jsonb_build_object('id', i.id, 'removed', true, 'path', i.path, 'orphan', v_uses = 0, 'blob', v_blob, 'stillUsedBy', v_uses);
end
$$;
revoke all on function public.article__library_remove(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.article_image_remove(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  return public.article__library_remove(v_me, p_id, null);
end
$$;
revoke all on function public.article_image_remove(uuid) from public, anon, authenticated;
grant execute on function public.article_image_remove(uuid) to authenticated;

-- --------------------------------------------------------------------------- library: agents (token → owner)
create or replace function public.mcp_article_image_put(
  p_token text, p_mime text, p_b64 text, p_kind text default 'inline', p_name text default null
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  m public.members%rowtype;
  v_bytes bytea;
  v_kind text := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), 'inline');
  v_name text := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  v_path text;
  i public.article_images;
begin
  t := public.api__token(p_token, array['article:write']::text[]);
  select * into m from public.members where id = t.member_id;
  if not found or m.signup_completed_at is null or m.is_banned then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if v_kind not in ('cover', 'thumbnail', 'inline') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if p_mime not in ('image/jpeg', 'image/png') then raise exception 'image_type' using errcode = 'P0001'; end if;
  v_bytes := decode(coalesce(p_b64, ''), 'base64');
  if octet_length(v_bytes) not between 32 and 2097152 then raise exception 'image_size' using errcode = 'P0001'; end if;
  if (select count(*) from public.article_images where member_id = t.member_id) >= public.article__library_cap() then
    raise exception 'library_full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.article_images x where x.agent_token_id = t.id and x.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'image_rate_limited' using errcode = 'P0001';
  end if;
  v_path := m.auth_id::text || '/' || gen_random_uuid()::text || case p_mime when 'image/png' then '.png' else '.jpg' end;
  insert into public.article_image_blobs (path, mime, bytes, sha256)
  values (v_path, p_mime, v_bytes, encode(extensions.digest(v_bytes, 'sha256'), 'hex'));
  insert into public.article_images (member_id, path, kind, name, agent_token_id)
  values (t.member_id, v_path, v_kind, v_name, t.id)
  returning * into i;
  return public.article__image_json(i);
end
$$;

create or replace function public.mcp_article_image_list(p_token text, p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  t := public.api__token(p_token, array['article:write']::text[]);
  return jsonb_build_object(
    'images', coalesce((select jsonb_agg(public.article__image_json(i) order by i.created_at desc)
                          from (select * from public.article_images where member_id = t.member_id order by created_at desc limit v_limit) i), '[]'::jsonb),
    'total', (select count(*)::int from public.article_images where member_id = t.member_id),
    'cap', public.article__library_cap());
end
$$;

-- an agent may remove only the images it uploaded itself
create or replace function public.mcp_article_image_remove(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype;
begin
  t := public.api__token(p_token, array['article:write']::text[]);
  return public.article__library_remove(t.member_id, p_id, t.id);
end
$$;

revoke all on function
  public.mcp_article_image_put(text, text, text, text, text),
  public.mcp_article_image_list(text, integer),
  public.mcp_article_image_remove(text, uuid)
  from public;
grant execute on function
  public.mcp_article_image_put(text, text, text, text, text),
  public.mcp_article_image_list(text, integer),
  public.mcp_article_image_remove(text, uuid)
  to anon, authenticated;

-- --------------------------------------------------------------------------- mcp_article_create / edit gain cover + thumbnail
drop function if exists public.mcp_article_create(text, text, text, text, boolean, uuid);
create or replace function public.mcp_article_create(
  p_token text, p_title text, p_subtitle text, p_body text,
  p_publish boolean default false, p_series_id uuid default null,
  p_cover_id uuid default null, p_thumbnail_id uuid default null
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  m public.members%rowtype;
  a public.articles;
  s public.article_series;
  v_id uuid := gen_random_uuid();
  v_title text := btrim(coalesce(p_title, ''));
  v_sub text := nullif(left(btrim(coalesce(p_subtitle, '')), 200), '');
  v_body text := coalesce(p_body, '');
  v_cover text;
  v_thumb text;
begin
  t := public.api__token(p_token, array['article:write']::text[]);
  select * into m from public.members where id = t.member_id;
  if not found or m.signup_completed_at is null or m.is_banned then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if char_length(v_title) not between 1 and 120 then raise exception 'bad_title' using errcode = 'P0001'; end if;
  if char_length(v_body) > 100000 then raise exception 'body_too_long' using errcode = 'P0001'; end if;
  if p_series_id is not null then
    select * into s from public.article_series where id = p_series_id;
    if not found or s.author_id <> t.member_id then raise exception 'bad_series' using errcode = 'P0001'; end if;
  end if;
  if p_cover_id is not null then
    select path into v_cover from public.article_images where id = p_cover_id and member_id = t.member_id;
    if v_cover is null or not public.article__member_image_ok(t.member_id, v_cover) then raise exception 'bad_cover' using errcode = 'P0001'; end if;
  end if;
  if p_thumbnail_id is not null then
    select path into v_thumb from public.article_images where id = p_thumbnail_id and member_id = t.member_id;
    if v_thumb is null or not public.article__member_image_ok(t.member_id, v_thumb) then raise exception 'bad_thumbnail' using errcode = 'P0001'; end if;
  end if;
  insert into public.articles (id, author_id, agent_token_id, series_id, slug, title, subtitle, cover_path, thumbnail_path, body, status, reading_sec)
  values (
    v_id, t.member_id, t.id, p_series_id,
    public.article__unique_slug(v_title, v_id, 'article'),
    v_title, v_sub, v_cover, v_thumb, v_body, 'draft', public.article__reading_sec(v_body)
  )
  returning * into a;
  if coalesce(p_publish, false) then
    a := public.article__publish_owned(a);
  end if;
  return public.article__card(a, a.body) || jsonb_build_object(
    'isMine', true, 'canonicalSlug', a.slug, 'url', '/articles/' || a.slug);
end;
$$;

drop function if exists public.mcp_article_edit(text, uuid, text, text, text, text, boolean);
create or replace function public.mcp_article_edit(
  p_token text, p_id uuid, p_slug text, p_title text, p_subtitle text, p_body text,
  p_publish boolean default false,
  p_cover_id uuid default null, p_cover_clear boolean default false,
  p_thumbnail_id uuid default null, p_thumbnail_clear boolean default false
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  a public.articles;
  v_title text;
  v_sub text;
  v_body text;
  v_slug text := nullif(btrim(coalesce(p_slug, '')), '');
  v_cover text;
  v_thumb text;
begin
  t := public.api__token(p_token, array['article:write']::text[]);
  if p_id is not null then
    select * into a from public.articles where id = p_id;
  elsif v_slug is not null then
    a := public.article__by_slug(v_slug);
  end if;
  if a.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.agent_token_id is distinct from t.id then raise exception 'forbidden' using errcode = 'P0001'; end if;
  v_title := btrim(coalesce(p_title, a.title));
  v_body := coalesce(p_body, a.body);
  v_sub := case when p_subtitle is null then a.subtitle else nullif(left(btrim(p_subtitle), 200), '') end;
  if char_length(v_title) not between 1 and 120 then raise exception 'bad_title' using errcode = 'P0001'; end if;
  if char_length(v_body) > 100000 then raise exception 'body_too_long' using errcode = 'P0001'; end if;
  v_cover := a.cover_path;
  v_thumb := a.thumbnail_path;
  if coalesce(p_cover_clear, false) then v_cover := null;
  elsif p_cover_id is not null then
    select path into v_cover from public.article_images where id = p_cover_id and member_id = t.member_id;
    if v_cover is null or not public.article__member_image_ok(t.member_id, v_cover) then raise exception 'bad_cover' using errcode = 'P0001'; end if;
  end if;
  if coalesce(p_thumbnail_clear, false) then v_thumb := null;
  elsif p_thumbnail_id is not null then
    select path into v_thumb from public.article_images where id = p_thumbnail_id and member_id = t.member_id;
    if v_thumb is null or not public.article__member_image_ok(t.member_id, v_thumb) then raise exception 'bad_thumbnail' using errcode = 'P0001'; end if;
  end if;
  update public.articles
     set title = v_title, subtitle = v_sub, body = v_body, cover_path = v_cover, thumbnail_path = v_thumb,
         slug = case when a.title is distinct from v_title then public.article__unique_slug(v_title, a.id, 'article') else a.slug end,
         reading_sec = public.article__reading_sec(v_body),
         edited_at = case when a.status = 'published' then now() else a.edited_at end,
         updated_at = now()
   where id = a.id
   returning * into a;
  if coalesce(p_publish, false) and a.status is distinct from 'published' then
    a := public.article__publish_owned(a);
  end if;
  return public.article__card(a, a.body) || jsonb_build_object(
    'isMine', true, 'canonicalSlug', a.slug, 'url', '/articles/' || a.slug);
end;
$$;

revoke all on function
  public.mcp_article_create(text, text, text, text, boolean, uuid, uuid, uuid),
  public.mcp_article_edit(text, uuid, text, text, text, text, boolean, uuid, boolean, uuid, boolean)
  from public;
grant execute on function
  public.mcp_article_create(text, text, text, text, boolean, uuid, uuid, uuid),
  public.mcp_article_edit(text, uuid, text, text, text, text, boolean, uuid, boolean, uuid, boolean)
  to anon, authenticated;
