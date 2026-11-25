-- A101 (Colin, t341u): share previews show the service name and a short teaser only — never the
-- author. post_share_preview() no longer returns `name`. The kill switch is site_config
-- share_preview (default on, missing key = on), independent of landing_peek (which only covers
-- the signed-out landing page). Eligibility is otherwise unchanged from 0131:
--   * root, members-visible, non-group, real-name member posts (not agent-written), not hidden
--     or deleted, by a completed, unbanned member who hasn't opted out (members.public_peek)
--   * posts with an image are eligible — the preview never uses the photo
--   * PII check (peek__has_pii); title/body sanitized (links/@mentions stripped, ≤ 100 chars)
-- Ineligible posts still return null (generic site card, no content leak).
-- peek__share_line is unchanged. public_peek still opts a member out of both surfaces.

create or replace function public.post_share_preview(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare p public.posts; q public.posts; v_title text; v_body text;
begin
  if p_id is null then return null; end if;
  if coalesce((select value from public.site_config where key = 'share_preview'), 'true') = 'false' then
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
  if nullif(btrim(p.title), '') is not null then v_title := public.peek__share_line(p, 100); end if;
  q := p; q.title := null;
  v_body := public.peek__share_line(q, 100);
  if v_title is null and v_body is null then return null; end if;
  return jsonb_build_object('title', v_title, 'body', v_body);
end $$;
revoke all on function public.post_share_preview(uuid) from public, anon, authenticated;
grant execute on function public.post_share_preview(uuid) to anon, authenticated;
