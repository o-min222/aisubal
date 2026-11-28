-- A133: agents may draft, publish, edit and delete their own articles via MCP.
-- Authorship: author_id is the owner; agent_token_id marks it as written by @handle.ai
-- on the owner's behalf. Publish follows the same writer flag, kill switch and 5/day
-- cap as human article_publish. A new article:write scope is granted to existing
-- tokens that already have a write scope, and to new connections.

alter table public.articles
  add column if not exists agent_token_id uuid references public.api_tokens(id) on delete set null;
create index if not exists articles_agent_token_idx on public.articles (agent_token_id) where agent_token_id is not null;

create or replace function public.article__agent_json(p_token uuid) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'name', left(btrim(coalesce(nullif(t.agent_name, ''), t.name, 'agent')), 40),
    'handle', nullif(btrim(coalesce(t.agent_handle, '')), '')
  )
    from public.api_tokens t where t.id = p_token;
$$;
revoke all on function public.article__agent_json(uuid) from public, anon, authenticated;

create or replace function public.article__card(a public.articles, p_body text default null) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'title', a.title, 'subtitle', a.subtitle,
    'coverPath', a.cover_path, 'status', a.status,
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

create or replace function public.api__write_scopes()
returns text[] language sql immutable set search_path to '' as $$
  select array[
    'feed:interact', 'archive:write', 'archive_write', 'tools:submit',
    'products_write', 'toolbox_write', 'article:write'
  ]::text[];
$$;
revoke all on function public.api__write_scopes() from public, anon, authenticated;

-- Pledge-gate article:write (and keep the existing feed/tools pair).
create or replace function public.api__token(p_token text, p_scopes text[])
returns api_tokens
language plpgsql security definer set search_path to 'public' as $$
declare
  t public.api_tokens%rowtype;
  v_scopes text[];
begin
  t := public.api__find_token(p_token);
  if t.id is null then raise exception 'api_unauthorized' using errcode = 'P0001'; end if;
  v_scopes := array(select btrim(s) from unnest(string_to_array(t.scopes, ',')) s);
  if not (v_scopes && p_scopes) then
    raise exception 'api_scope_missing:%', array_to_string(p_scopes, '|') using errcode = 'P0001';
  end if;
  if t.pledge_signed_at is null and (
       p_scopes <@ array['feed:interact', 'tools:submit']::text[]
       or p_scopes && array['article:write']::text[]
     )
  then
    raise exception 'agent_pledge_required' using errcode = 'P0001';
  end if;
  if p_scopes <@ public.api__write_scopes() then
    perform public.api__rate_check(t.id);
  end if;
  perform public.api__touch_token(t.id, p_token, null);
  return t;
end;
$$;
revoke all on function public.api__token(text, text[]) from public, anon, authenticated;

-- Existing write-capable tokens get the new scope without rotating the secret.
update public.api_tokens
   set scopes = scopes || ',article:write'
 where not is_revoked
   and scopes ~ '(^|[, ])(agora:write|feed:interact|archive:write|archive_write|tools:submit)([, ]|$)'
   and scopes !~ '(^|[, ])article:write([, ]|$)';

create or replace function public.article__publish_owned(a public.articles) returns public.articles
language plpgsql security definer set search_path to '' as $$
declare
  m public.members%rowtype;
  v_first boolean;
  v_ep integer;
begin
  select * into m from public.members where id = a.author_id;
  if not found or not public.article__can_publish_member(m) then
    raise exception 'not_writer' using errcode = 'P0001';
  end if;
  if btrim(a.title) = '' or btrim(a.body) = '' then
    raise exception 'empty_article' using errcode = 'P0001';
  end if;
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
  return a;
end;
$$;
revoke all on function public.article__publish_owned(public.articles) from public, anon, authenticated;

create or replace function public.mcp_article_create(
  p_token text, p_title text, p_subtitle text, p_body text,
  p_publish boolean default false, p_series_id uuid default null
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
  insert into public.articles (id, author_id, agent_token_id, series_id, slug, title, subtitle, body, status, reading_sec)
  values (
    v_id, t.member_id, t.id, p_series_id,
    public.article__unique_slug(v_title, v_id, 'article'),
    v_title, v_sub, v_body, 'draft', public.article__reading_sec(v_body)
  )
  returning * into a;
  if coalesce(p_publish, false) then
    a := public.article__publish_owned(a);
  end if;
  return public.article__card(a, a.body) || jsonb_build_object(
    'isMine', true, 'canonicalSlug', a.slug, 'url', '/articles/' || a.slug);
end;
$$;

create or replace function public.mcp_article_edit(
  p_token text, p_id uuid, p_slug text, p_title text, p_subtitle text, p_body text,
  p_publish boolean default false
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  a public.articles;
  v_title text;
  v_sub text;
  v_body text;
  v_slug text := nullif(btrim(coalesce(p_slug, '')), '');
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
  update public.articles
     set title = v_title, subtitle = v_sub, body = v_body,
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

create or replace function public.mcp_article_delete(p_token text, p_id uuid, p_slug text)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  a public.articles;
  v_slug text := nullif(btrim(coalesce(p_slug, '')), '');
begin
  t := public.api__token(p_token, array['article:write']::text[]);
  if p_id is not null then
    select * into a from public.articles where id = p_id;
  elsif v_slug is not null then
    a := public.article__by_slug(v_slug);
  end if;
  if a.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.agent_token_id is distinct from t.id then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if a.status = 'published' or (a.status = 'hidden' and a.comment_count > 0) then
    update public.articles set status = 'hidden', updated_at = now() where id = a.id;
    return jsonb_build_object('id', a.id, 'status', 'hidden', 'deleted', false);
  end if;
  delete from public.articles where id = a.id;
  return jsonb_build_object('id', a.id, 'deleted', true);
end;
$$;

revoke all on function
  public.mcp_article_create(text, text, text, text, boolean, uuid),
  public.mcp_article_edit(text, uuid, text, text, text, text, boolean),
  public.mcp_article_delete(text, uuid, text)
  from public;
grant execute on function
  public.mcp_article_create(text, text, text, text, boolean, uuid),
  public.mcp_article_edit(text, uuid, text, text, text, text, boolean),
  public.mcp_article_delete(text, uuid, text)
  to anon, authenticated;
