-- A56: blur teaser /t/<slug>. The author opts in per post; outsiders see the title, the first
-- lines (truncated here, server side: the rest never leaves the database) and counts.
-- Only 전체 회원 root posts under the real name; never 부캐 (anon lounge), groups, agents, replies.

create table if not exists public.post_teasers (
  slug text primary key,
  post_id uuid not null unique references public.posts(id) on delete cascade,
  created_by uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.post_teasers enable row level security;
revoke all on public.post_teasers from public, anon, authenticated;

-- a post may be teased only while it still qualifies
create or replace function public.teaser__eligible(p public.posts) returns boolean
language sql immutable set search_path to '' as $$
  select p.parent_id is null and p.deleted_at is null and not coalesce(p.is_hidden, false)
     and p.visibility = 'members' and p.group_id is null and p.as_group_id is null
     and p.posted_as = 'real' and p.author_kind = 'member' and p.agent_token_id is null
$$;
revoke all on function public.teaser__eligible(public.posts) from public, anon, authenticated;

-- author consent = only the author can turn a teaser on (idempotent: returns the existing slug)
create or replace function public.teaser_enable(p_post uuid) returns text
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); p public.posts%rowtype; v_slug text;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into p from public.posts where id = p_post;
  if not found or p.author_id is distinct from v_me then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not public.teaser__eligible(p) then raise exception 'teaser_ineligible' using errcode = 'P0001'; end if;
  select slug into v_slug from public.post_teasers where post_id = p_post;
  if v_slug is not null then return v_slug; end if;
  v_slug := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into public.post_teasers (slug, post_id, created_by) values (v_slug, p_post, v_me);
  return v_slug;
end $$;

create or replace function public.teaser_disable(p_post uuid) returns boolean
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  delete from public.post_teasers t using public.posts p
    where t.post_id = p_post and p.id = t.post_id and (p.author_id = v_me or public.onboarding__is_admin());
  return found;
end $$;

-- the author's own state for the share menu: {eligible, slug}
create or replace function public.teaser_mine(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); p public.posts%rowtype;
begin
  select * into p from public.posts where id = p_post;
  if v_me is null or not found or p.author_id is distinct from v_me then return null; end if;
  return jsonb_build_object('eligible', public.teaser__eligible(p),
    'slug', (select slug from public.post_teasers where post_id = p_post));
end $$;

-- the public card. Excerpt: first 3 non-empty lines, at most 160 characters.
create or replace function public.teaser_public(p_slug text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare p public.posts%rowtype; a public.members%rowtype; v_lines text[]; v_ex text; v_body text;
begin
  if p_slug is null or p_slug !~ '^[0-9a-f]{12}$' then return null; end if;
  select po.* into p from public.post_teasers t join public.posts po on po.id = t.post_id where t.slug = p_slug;
  if not found or not public.teaser__eligible(p) then return null; end if;
  select * into a from public.members where id = p.author_id;
  if not found or a.is_banned then return null; end if;
  v_body := regexp_replace(coalesce(p.content, ''), '^\s+|\s+$', '', 'g');
  select array_agg(l) into v_lines from (
    select l from unnest(regexp_split_to_array(v_body, '\r?\n')) with ordinality as x(l, n)
    where btrim(l) <> '' order by n limit 3) s;
  v_ex := array_to_string(coalesce(v_lines, '{}'), E'\n');
  if char_length(v_ex) > 160 then v_ex := left(v_ex, 159) || '…'; end if;
  return jsonb_build_object(
    'title', nullif(left(coalesce(p.title, ''), 120), ''),
    'excerpt', v_ex,
    'more', char_length(v_body) > char_length(v_ex) or v_ex like '%…',
    'author', jsonb_build_object('name', a.display_name, 'avatar', a.avatar_url),
    'likes', coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0),
    'replies', coalesce(p.reply_count, 0),
    'created_at', p.created_at);
end $$;

revoke all on function public.teaser_enable(uuid), public.teaser_disable(uuid), public.teaser_mine(uuid), public.teaser_public(text) from public, anon;
grant execute on function public.teaser_enable(uuid), public.teaser_disable(uuid), public.teaser_mine(uuid) to authenticated;
grant execute on function public.teaser_public(text) to anon, authenticated;
