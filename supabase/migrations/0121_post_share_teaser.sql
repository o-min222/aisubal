-- AI-8 follow-up (Colin, t294u): a shared post link's preview (KakaoTalk etc.) teases the post.
-- Same safety rules as the A64 landing peek (0113), reusing its sanitizer (peek__line) and PII check:
--   * only root, members-visible, non-group, real-name member posts (not agent-written), no image,
--     not hidden or deleted, by a completed, unbanned member who hasn't opted out (members.public_peek)
--   * admin kill switch: site_config landing_peek = 'false' turns it off too
--   * returns only {title, body}: each a sanitized line (links and @mentions stripped, ≤ 60 chars) —
--     no author, no image, no counts; null for anything ineligible (the caller keeps the generic text)
-- The landing peek's popularity / 30-day filters pick what to show; they are not safety rules, so not here.

create or replace function public.post_share_teaser(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare p public.posts; q public.posts; v_title text; v_body text;
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
    and x.image_path is null
    and m.signup_completed_at is not null and not m.is_banned and m.public_peek
    and not public.peek__has_pii(coalesce(x.title, '') || E'\n' || coalesce(x.content, ''));
  if p.id is null then return null; end if;
  if nullif(btrim(p.title), '') is not null then v_title := public.peek__line(p); end if;
  q := p; q.title := null;            -- the body's first usable line, same sanitizer
  v_body := public.peek__line(q);
  if v_title is null and v_body is null then return null; end if;
  return jsonb_build_object('title', v_title, 'body', v_body);
end $$;
revoke all on function public.post_share_teaser(uuid) from public, anon, authenticated;
grant execute on function public.post_share_teaser(uuid) to anon, authenticated;
