-- A56: a signed-in member opening a teaser link gets the post id (to open the full post).
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
    'created_at', p.created_at,
    -- signed-in members get the id so the page can link to the real post; outsiders never do
    'post', case when public.is_completed_member() then p.id end);
end $$;

revoke all on function public.teaser_public(text) from public;
grant execute on function public.teaser_public(text) to anon, authenticated;
