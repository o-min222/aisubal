-- A138: per-cover and per-thumbnail focal point + fit (crop | contain).
-- Used by list/feed cards and the share/OG card so the author can choose what stays in a fixed frame.
-- The reading-page header always shows the full cover (no crop); these columns do not affect it.
-- Writes go only through article_upsert / mcp_article_*; the articles table has no client DML grants.

create or replace function public.article__focus_ok(j jsonb) returns boolean
language sql immutable set search_path to '' as $$
  select j is null
    or (
      jsonb_typeof(j) = 'object'
      and (j ? 'x') and (j ? 'y')
      and jsonb_typeof(j->'x') in ('number', 'string')
      and jsonb_typeof(j->'y') in ('number', 'string')
      and (j->>'x') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (j->>'y') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (j->>'x')::numeric between 0 and 100
      and (j->>'y')::numeric between 0 and 100
      and coalesce(j->>'fit', 'crop') in ('crop', 'contain')
      and (select bool_and(k in ('x', 'y', 'fit')) from jsonb_object_keys(j) k)
    );
$$;
revoke all on function public.article__focus_ok(jsonb) from public, anon, authenticated;

alter table public.articles
  add column if not exists cover_focus jsonb,
  add column if not exists thumbnail_focus jsonb;

alter table public.articles drop constraint if exists articles_cover_focus_chk;
alter table public.articles add constraint articles_cover_focus_chk
  check (public.article__focus_ok(cover_focus));
alter table public.articles drop constraint if exists articles_thumbnail_focus_chk;
alter table public.articles add constraint articles_thumbnail_focus_chk
  check (public.article__focus_ok(thumbnail_focus));

comment on column public.articles.cover_focus is
  'A138: {x,y,fit} for the cover on cards and the share card. x/y 0-100 (object-position); fit is crop or contain. Null = 50,50,crop.';
comment on column public.articles.thumbnail_focus is
  'A138: {x,y,fit} for the optional separate thumbnail. Same shape as cover_focus.';

-- table has no client grants (0135 revoked all); keep the new columns that way
revoke insert (cover_focus, thumbnail_focus) on public.articles from public, anon, authenticated;
revoke update (cover_focus, thumbnail_focus) on public.articles from public, anon, authenticated;

create or replace function public.article__card(a public.articles, p_body text default null) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'title', a.title, 'subtitle', a.subtitle,
    'coverPath', a.cover_path, 'thumbnailPath', a.thumbnail_path,
    'coverFocus', a.cover_focus, 'thumbnailFocus', a.thumbnail_focus,
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
    'thumbnailPath', a.thumbnail_path, 'firstImagePath', public.article__first_image(a.body),
    'coverFocus', a.cover_focus, 'thumbnailFocus', a.thumbnail_focus, 'slug', a.slug);
end
$$;
revoke all on function public.article_share_preview(text) from public, anon, authenticated;
grant execute on function public.article_share_preview(text) to anon, authenticated;

drop function if exists public.article_upsert(uuid, text, text, text, text, uuid, integer, text);
create function public.article_upsert(
  p_id uuid, p_title text, p_subtitle text, p_body text, p_cover_path text,
  p_series_id uuid, p_episode_no integer, p_thumbnail_path text default null,
  p_cover_focus jsonb default null, p_thumbnail_focus jsonb default null
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
  v_cover_focus jsonb := p_cover_focus;
  v_thumb_focus jsonb := p_thumbnail_focus;
begin
  if v_me is null or not public.article__can_draft() then raise exception 'not_member' using errcode = 'P0001'; end if;
  if char_length(v_title) not between 1 and 120 then raise exception 'bad_title' using errcode = 'P0001'; end if;
  if char_length(v_body) > 100000 then raise exception 'body_too_long' using errcode = 'P0001'; end if;
  if v_cover is not null and not public.article__cover_ok(v_cover) then raise exception 'bad_cover' using errcode = 'P0001'; end if;
  if v_thumb is not null and not public.article__cover_ok(v_thumb) then raise exception 'bad_thumbnail' using errcode = 'P0001'; end if;
  if v_cover is null then v_cover_focus := null; end if;
  if v_thumb is null then v_thumb_focus := null; end if;
  if not public.article__focus_ok(v_cover_focus) then raise exception 'bad_focus' using errcode = 'P0001'; end if;
  if not public.article__focus_ok(v_thumb_focus) then raise exception 'bad_focus' using errcode = 'P0001'; end if;
  if p_series_id is not null then
    select * into s from public.article_series where id = p_series_id;
    if not found or s.author_id <> v_me then raise exception 'bad_series' using errcode = 'P0001'; end if;
  end if;

  select * into a from public.articles where id = v_id;
  if found then
    if a.author_id <> v_me and not public.app__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
    update public.articles
       set title = v_title, subtitle = v_sub, body = v_body, cover_path = v_cover, thumbnail_path = v_thumb,
           cover_focus = v_cover_focus, thumbnail_focus = v_thumb_focus,
           series_id = p_series_id, episode_no = p_episode_no,
           slug = case when a.title is distinct from v_title then public.article__unique_slug(v_title, a.id, 'article') else a.slug end,
           reading_sec = public.article__reading_sec(v_body),
           edited_at = case when a.status = 'published' then now() else a.edited_at end,
           updated_at = now()
     where id = a.id
     returning * into a;
  else
    insert into public.articles (id, author_id, series_id, episode_no, slug, title, subtitle, cover_path, thumbnail_path, cover_focus, thumbnail_focus, body, status, reading_sec)
    values (v_id, v_me, p_series_id, p_episode_no, public.article__unique_slug(v_title, v_id, 'article'),
            v_title, v_sub, v_cover, v_thumb, v_cover_focus, v_thumb_focus, v_body, 'draft', public.article__reading_sec(v_body))
    returning * into a;
  end if;
  return public.article__card(a, a.body) || jsonb_build_object('isMine', true, 'canonicalSlug', a.slug);
end
$$;
revoke all on function public.article_upsert(uuid, text, text, text, text, uuid, integer, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.article_upsert(uuid, text, text, text, text, uuid, integer, text, jsonb, jsonb) to authenticated;

drop function if exists public.mcp_article_create(text, text, text, text, boolean, uuid, uuid, uuid);
create function public.mcp_article_create(
  p_token text, p_title text, p_subtitle text, p_body text,
  p_publish boolean default false, p_series_id uuid default null,
  p_cover_id uuid default null, p_thumbnail_id uuid default null,
  p_cover_focus jsonb default null, p_thumbnail_focus jsonb default null
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
  v_cover_focus jsonb := p_cover_focus;
  v_thumb_focus jsonb := p_thumbnail_focus;
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
  else
    v_cover_focus := null;
  end if;
  if p_thumbnail_id is not null then
    select path into v_thumb from public.article_images where id = p_thumbnail_id and member_id = t.member_id;
    if v_thumb is null or not public.article__member_image_ok(t.member_id, v_thumb) then raise exception 'bad_thumbnail' using errcode = 'P0001'; end if;
  else
    v_thumb_focus := null;
  end if;
  if not public.article__focus_ok(v_cover_focus) then raise exception 'bad_focus' using errcode = 'P0001'; end if;
  if not public.article__focus_ok(v_thumb_focus) then raise exception 'bad_focus' using errcode = 'P0001'; end if;
  insert into public.articles (id, author_id, agent_token_id, series_id, slug, title, subtitle, cover_path, thumbnail_path, cover_focus, thumbnail_focus, body, status, reading_sec)
  values (
    v_id, t.member_id, t.id, p_series_id,
    public.article__unique_slug(v_title, v_id, 'article'),
    v_title, v_sub, v_cover, v_thumb, v_cover_focus, v_thumb_focus, v_body, 'draft', public.article__reading_sec(v_body)
  )
  returning * into a;
  if coalesce(p_publish, false) then
    a := public.article__publish_owned(a);
  end if;
  return public.article__card(a, a.body) || jsonb_build_object(
    'isMine', true, 'canonicalSlug', a.slug, 'url', '/articles/' || a.slug);
end
$$;

drop function if exists public.mcp_article_edit(text, uuid, text, text, text, text, boolean, uuid, boolean, uuid, boolean);
create function public.mcp_article_edit(
  p_token text, p_id uuid, p_slug text, p_title text, p_subtitle text, p_body text,
  p_publish boolean default false,
  p_cover_id uuid default null, p_cover_clear boolean default false,
  p_thumbnail_id uuid default null, p_thumbnail_clear boolean default false,
  p_cover_focus jsonb default null, p_cover_focus_set boolean default false,
  p_thumbnail_focus jsonb default null, p_thumbnail_focus_set boolean default false
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
  v_cover_focus jsonb;
  v_thumb_focus jsonb;
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
  v_cover_focus := a.cover_focus;
  v_thumb_focus := a.thumbnail_focus;
  if coalesce(p_cover_clear, false) then
    v_cover := null;
    v_cover_focus := null;
  elsif p_cover_id is not null then
    select path into v_cover from public.article_images where id = p_cover_id and member_id = t.member_id;
    if v_cover is null or not public.article__member_image_ok(t.member_id, v_cover) then raise exception 'bad_cover' using errcode = 'P0001'; end if;
    v_cover_focus := case when coalesce(p_cover_focus_set, false) then p_cover_focus else null end;
  elsif coalesce(p_cover_focus_set, false) then
    v_cover_focus := p_cover_focus;
  end if;
  if coalesce(p_thumbnail_clear, false) then
    v_thumb := null;
    v_thumb_focus := null;
  elsif p_thumbnail_id is not null then
    select path into v_thumb from public.article_images where id = p_thumbnail_id and member_id = t.member_id;
    if v_thumb is null or not public.article__member_image_ok(t.member_id, v_thumb) then raise exception 'bad_thumbnail' using errcode = 'P0001'; end if;
    v_thumb_focus := case when coalesce(p_thumbnail_focus_set, false) then p_thumbnail_focus else null end;
  elsif coalesce(p_thumbnail_focus_set, false) then
    v_thumb_focus := p_thumbnail_focus;
  end if;
  if v_cover is null then v_cover_focus := null; end if;
  if v_thumb is null then v_thumb_focus := null; end if;
  if not public.article__focus_ok(v_cover_focus) then raise exception 'bad_focus' using errcode = 'P0001'; end if;
  if not public.article__focus_ok(v_thumb_focus) then raise exception 'bad_focus' using errcode = 'P0001'; end if;
  update public.articles
     set title = v_title, subtitle = v_sub, body = v_body, cover_path = v_cover, thumbnail_path = v_thumb,
         cover_focus = v_cover_focus, thumbnail_focus = v_thumb_focus,
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
end
$$;

revoke all on function
  public.mcp_article_create(text, text, text, text, boolean, uuid, uuid, uuid, jsonb, jsonb),
  public.mcp_article_edit(text, uuid, text, text, text, text, boolean, uuid, boolean, uuid, boolean, jsonb, boolean, jsonb, boolean)
  from public;
grant execute on function
  public.mcp_article_create(text, text, text, text, boolean, uuid, uuid, uuid, jsonb, jsonb),
  public.mcp_article_edit(text, uuid, text, text, text, text, boolean, uuid, boolean, uuid, boolean, jsonb, boolean, jsonb, boolean)
  to anon, authenticated;
