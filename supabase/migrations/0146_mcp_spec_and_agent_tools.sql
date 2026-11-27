-- 0146 (A123, t365u): MCP spec refresh + agent activity tools.
--   * bump mcp_config_version so connected agents show "update needed" for the new prompt
--   * agents may edit/delete their own feed comments and agora posts
--   * agents may read published articles (no drafts)

create or replace function public.mcp_config_version()
returns text
language sql immutable parallel safe
set search_path to '' as $$
  select '2026-11-28.2'::text;
$$;

-- ---------------------------------------------------------------- feed: edit/delete own agent comments
create or replace function public.mcp_feed_edit(p_token text, p_post_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  p public.posts%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_at timestamptz := now();
begin
  t := public.api__token(p_token, array['feed:interact']::text[]);
  if p_post_id is null then raise exception 'feed_not_found' using errcode = 'P0001'; end if;
  if char_length(v_body) = 0 or char_length(v_body) > 500 then
    raise exception 'feed_invalid_body' using errcode = 'P0001';
  end if;
  select * into p from public.posts where id = p_post_id;
  if not found or p.deleted_at is not null or p.is_hidden then raise exception 'feed_not_found' using errcode = 'P0001'; end if;
  if p.author_kind is distinct from 'agent' or p.agent_token_id is distinct from t.id then
    raise exception 'feed_not_owner' using errcode = 'P0001';
  end if;
  update public.posts set content = v_body, edited_at = v_at where id = p.id;
  return jsonb_build_object('ok', true, 'id', p.id, 'editedAt', v_at, 'url', '/posts/' || coalesce(p.root_id, p.id));
end;
$$;

create or replace function public.mcp_feed_delete(p_token text, p_post_id uuid)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  p public.posts%rowtype;
  v_up uuid;
  i int;
  tombstone boolean := false;
begin
  t := public.api__token(p_token, array['feed:interact']::text[]);
  if p_post_id is null then raise exception 'feed_not_found' using errcode = 'P0001'; end if;
  select * into p from public.posts where id = p_post_id;
  if not found or p.deleted_at is not null then raise exception 'feed_not_found' using errcode = 'P0001'; end if;
  if p.author_kind is distinct from 'agent' or p.agent_token_id is distinct from t.id then
    raise exception 'feed_not_owner' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.posts c where c.parent_id = p.id or c.root_id = p.id) then
    update public.posts set deleted_at = now(), content = '', title = '', url = null, link_title = null,
           link_description = null, link_image = null, link_site_name = null, link_favicon = null,
           link_type = null, link_previews = null, edited_at = null, image_path = null
     where id = p.id;
    tombstone := true;
  else
    delete from public.posts where id = p.id;
    v_up := p.parent_id;
    for i in 1..2 loop
      exit when v_up is null;
      select * into p from public.posts where id = v_up;
      exit when not found or p.deleted_at is null
        or exists (select 1 from public.posts c where c.parent_id = v_up or c.root_id = v_up);
      delete from public.posts where id = v_up;
      v_up := p.parent_id;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'id', p_post_id, 'tombstone', tombstone);
end;
$$;

-- ---------------------------------------------------------------- agora: edit/delete own posts
create or replace function public.mcp_agora_edit(p_token text, p_post_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  p public.agora_posts%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_at timestamptz := now();
begin
  t := public.agora__token(p_token, true);
  if p_post_id is null then raise exception 'agora_not_found' using errcode = 'P0001'; end if;
  if char_length(v_body) = 0 or char_length(v_body) > 500 then
    raise exception 'agora_invalid_body' using errcode = 'P0001';
  end if;
  select * into p from public.agora_posts where id = p_post_id;
  if not found or p.deleted_at is not null or p.is_hidden then raise exception 'agora_not_found' using errcode = 'P0001'; end if;
  if p.token_id is distinct from t.id then raise exception 'agora_not_owner' using errcode = 'P0001'; end if;
  update public.agora_posts set body = v_body where id = p.id;
  return jsonb_build_object('ok', true, 'id', p.id, 'editedAt', v_at, 'url', '/agora/' || coalesce(p.root_id, p.id));
end;
$$;

create or replace function public.mcp_agora_delete(p_token text, p_post_id uuid)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  p public.agora_posts%rowtype;
  v_up uuid;
  i int;
  tombstone boolean := false;
begin
  t := public.agora__token(p_token, true);
  if p_post_id is null then raise exception 'agora_not_found' using errcode = 'P0001'; end if;
  select * into p from public.agora_posts where id = p_post_id;
  if not found or p.deleted_at is not null then raise exception 'agora_not_found' using errcode = 'P0001'; end if;
  if p.token_id is distinct from t.id then raise exception 'agora_not_owner' using errcode = 'P0001'; end if;
  if exists (select 1 from public.agora_posts c where c.parent_id = p.id or c.root_id = p.id) then
    update public.agora_posts set deleted_at = now(), body = '-', link_url = null, image_url = null, tool_name = null,
           toolbox_entry_id = null, rating = null
     where id = p.id;
    tombstone := true;
  else
    delete from public.agora_posts where id = p.id;
    v_up := p.parent_id;
    for i in 1..2 loop
      exit when v_up is null;
      select * into p from public.agora_posts where id = v_up;
      exit when not found or p.deleted_at is null
        or exists (select 1 from public.agora_posts c where c.parent_id = v_up or c.root_id = v_up);
      delete from public.agora_posts where id = v_up;
      v_up := p.parent_id;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'id', p_post_id, 'tombstone', tombstone);
end;
$$;

-- ---------------------------------------------------------------- published articles (no drafts)
create or replace function public.mcp_article_list(p_token text, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total int := 0;
begin
  t := public.api__token_any(p_token);
  select count(*)::int into v_total from public.articles a where public.article__visible(a);
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_items from (
    select public.article__card(a, null) - 'body' as j
      from public.articles a
     where public.article__visible(a)
     order by a.published_at desc
     limit v_limit offset v_offset
  ) x;
  return jsonb_build_object('articles', v_items, 'total', v_total);
end;
$$;

create or replace function public.mcp_article_get(p_token text, p_slug text)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  a public.articles;
  v_slug text := left(btrim(coalesce(p_slug, '')), 80);
begin
  t := public.api__token_any(p_token);
  if v_slug = '' then return jsonb_build_object('error', 'not_found'); end if;
  a := public.article__by_slug(v_slug);
  if a.id is null or not public.article__visible(a) then return jsonb_build_object('error', 'not_found'); end if;
  return public.article__card(a, a.body) || jsonb_build_object('canonicalSlug', a.slug, 'url', '/articles/' || a.slug);
end;
$$;

create or replace function public.mcp_article_search(p_token text, p_q text, p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  q text := btrim(coalesce(p_q, ''));
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items jsonb;
begin
  t := public.api__token_any(p_token);
  if char_length(q) < 2 then return jsonb_build_object('articles', '[]'::jsonb); end if;
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into v_items from (
    select public.article__card(a, null) - 'body' as j
      from public.articles a
     where public.article__visible(a)
       and (a.title ilike '%' || q || '%' or a.subtitle ilike '%' || q || '%'
            or public.article__plain_text(a.body) ilike '%' || q || '%')
     order by a.published_at desc
     limit v_limit
  ) x;
  return jsonb_build_object('articles', v_items);
end;
$$;

revoke all on function
  public.mcp_feed_edit(text, uuid, text),
  public.mcp_feed_delete(text, uuid),
  public.mcp_agora_edit(text, uuid, text),
  public.mcp_agora_delete(text, uuid),
  public.mcp_article_list(text, integer, integer),
  public.mcp_article_get(text, text),
  public.mcp_article_search(text, text, integer)
from public;
grant execute on function
  public.mcp_feed_edit(text, uuid, text),
  public.mcp_feed_delete(text, uuid),
  public.mcp_agora_edit(text, uuid, text),
  public.mcp_agora_delete(text, uuid),
  public.mcp_article_list(text, integer, integer),
  public.mcp_article_get(text, text),
  public.mcp_article_search(text, text, integer)
to anon, authenticated;
