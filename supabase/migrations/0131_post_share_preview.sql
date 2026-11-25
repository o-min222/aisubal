-- A100 (Colin, t338u): richer share preview for link unfurls (KakaoTalk, Slack, iMessage, …).
-- Same safety as 0121 / A64 landing peek, with two deliberate differences:
--   * posts that have an image are eligible — the preview never uses the photo; the app draws a
--     generated card from the text teaser and the author's display name
--   * returns {title, body, name}: title/body are sanitized lines (links and @mentions stripped,
--     ≤ 100 chars); name is the author's display_name (real-name posts only, ≤ 24 chars)
-- Ineligible posts (friends/followers/private, group, 부캐, hidden/deleted, PII, public_peek off,
-- landing_peek kill switch) still return null — the caller keeps the generic site card, no leak.
-- peek__line (landing peek, ≤ 60) is unchanged. post_share_teaser (0121) is left in place.

create or replace function public.peek__share_line(p public.posts, p_max int) returns text
language plpgsql immutable set search_path to '' as $$
declare v text; l text; n int;
begin
  n := least(greatest(coalesce(p_max, 100), 4), 200);
  v := coalesce(nullif(btrim(p.title), ''), '');
  if v = '' then
    foreach l in array regexp_split_to_array(coalesce(p.content, ''), '\r?\n') loop
      l := regexp_replace(l, '(https?://|www\.)\S+', '', 'gi');
      l := regexp_replace(l, '@[A-Za-z0-9_.가-힣-]+', '', 'g');
      l := btrim(regexp_replace(l, '\s+', ' ', 'g'));
      if char_length(l) >= 4 then v := l; exit; end if;
    end loop;
  else
    v := btrim(regexp_replace(regexp_replace(v, '(https?://|www\.)\S+', '', 'gi'), '@[A-Za-z0-9_.가-힣-]+', '', 'g'));
  end if;
  if char_length(v) < 4 then return null; end if;
  if char_length(v) > n then v := left(v, n - 1) || '…'; end if;
  return v;
end $$;
revoke all on function public.peek__share_line(public.posts, int) from public, anon, authenticated;

create or replace function public.post_share_preview(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare p public.posts; q public.posts; v_title text; v_body text; v_name text;
begin
  if p_id is null then return null; end if;
  if coalesce((select value from public.site_config where key = 'landing_peek'), 'true') = 'false' then
    return null;
  end if;
  select x.* into p
  from public.posts x
  join public.members m on m.id = x.author_id
  where x.id = p_id
    and x.parent_id is null and x.deleted_at is null and not coalesce(x.is_hidden, false)
    and x.visibility = 'members' and x.group_id is null and x.as_group_id is null
    and x.posted_as = 'real' and x.author_kind = 'member' and x.agent_token_id is null
    and not coalesce(x.is_agent_posted, false)
    and m.signup_completed_at is not null and not m.is_banned and m.public_peek
    and not public.peek__has_pii(coalesce(x.title, '') || E'\n' || coalesce(x.content, ''));
  if p.id is null then return null; end if;
  select nullif(btrim(m.display_name), '') into v_name from public.members m where m.id = p.author_id;
  if v_name is not null and char_length(v_name) > 24 then v_name := left(v_name, 23) || '…'; end if;
  if nullif(btrim(p.title), '') is not null then v_title := public.peek__share_line(p, 100); end if;
  q := p; q.title := null;
  v_body := public.peek__share_line(q, 100);
  if v_title is null and v_body is null then return null; end if;
  return jsonb_build_object('title', v_title, 'body', v_body, 'name', v_name);
end $$;
revoke all on function public.post_share_preview(uuid) from public, anon, authenticated;
grant execute on function public.post_share_preview(uuid) to anon, authenticated;
