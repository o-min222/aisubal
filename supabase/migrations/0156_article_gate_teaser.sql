-- A140: a shared article link shows non-members only the first part of the article, then a join gate.
-- Before: bodies up to 800 characters were returned in full, so a short article had nothing left to gate.
-- Now: the public teaser is at most 800 characters AND at most 60% of the body, cut at a paragraph or
-- sentence. The full body still never leaves the database for anon/unverified callers.
-- Mirror: articleGateTeaser() in src/lib/article-rules.ts (mock mode and the tests).

create or replace function public.article__gate_teaser(p_body text) returns text
language sql immutable set search_path to '' as $$
  select public.article__teaser_body(
    p_body,
    least(800, floor(char_length(btrim(coalesce(p_body, ''))) * 0.6)::integer)
  );
$$;
revoke all on function public.article__gate_teaser(text) from public, anon, authenticated;

create or replace function public.article_public_teaser(p_slug text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare a public.articles; teaser text;
begin
  if not public.article__cfg_on('article_public_teaser') then return null; end if;
  a := public.article__by_slug(p_slug);
  if a.id is null or not public.article__visible(a) then return null; end if;
  teaser := public.article__gate_teaser(a.body);
  return public.article__card(a, teaser) || jsonb_build_object(
    'truncated', char_length(btrim(coalesce(a.body, ''))) > char_length(teaser),
    'canonicalSlug', a.slug);
end
$$;
revoke all on function public.article_public_teaser(text) from public, anon, authenticated;
grant execute on function public.article_public_teaser(text) to anon, authenticated;
