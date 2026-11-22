-- A15: 익명 posts/comments get the same ⋯ 수정 as the feed.
-- Ownership is checked through anon_private.post_authors; nothing about the
-- author leaves the function. Only an "edited" flag is exposed (no timestamp).
alter table public.anon_posts add column if not exists edited_at timestamptz;

CREATE OR REPLACE FUNCTION anon_private.post_json(p anon_posts, p_viewer uuid, p_admin boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'parentId', p.parent_id,
    'rootId', p.root_id,
    'depth', p.thread_depth,
    'replyToId', p.reply_to_id,
    'category', p.category,
    'body', CASE WHEN p.is_deleted THEN '' WHEN p.is_hidden AND NOT p_admin THEN '' ELSE p.body END,
    'alias', p.alias,
    'isOp', p.is_op,
    'authorship', CASE WHEN p.is_deleted THEN 'human' ELSE p.authorship END,
    'likeCount', p.like_count,
    'replyCount', p.reply_count,
    'likedByMe', EXISTS (SELECT 1 FROM anon_private.likes l WHERE l.post_id = p.id AND l.member_id = p_viewer),
    'isMine', EXISTS (SELECT 1 FROM anon_private.post_authors a WHERE a.post_id = p.id AND a.member_id = p_viewer),
    'reportedByMe', EXISTS (SELECT 1 FROM anon_private.reports r WHERE r.post_id = p.id AND r.member_id = p_viewer),
    'isHidden', p.is_hidden,
    'isDeleted', p.is_deleted,
    'isEdited', p.edited_at IS NOT NULL AND NOT p.is_deleted,
    'createdAt', date_trunc('minute', p.created_at)
  ) || CASE WHEN p_admin THEN jsonb_build_object(
    'reportCount', p.report_count,
    'hiddenReason', p.hidden_reason,
    'adminCleared', p.admin_cleared,
    'reportReasons', COALESCE((SELECT jsonb_agg(r.reason ORDER BY r.created_at) FROM anon_private.reports r WHERE r.post_id = p.id), '[]'::jsonb)
  ) ELSE '{}'::jsonb END;
$function$;

create or replace function public.anon_edit(p_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := anon_private.me();
  v_body text := btrim(coalesce(p_body, ''));
  v_n int;
begin
  if v_me is null then raise exception 'anon_not_found' using errcode = 'P0001'; end if;
  if char_length(v_body) = 0 then raise exception 'anon_empty' using errcode = 'P0001'; end if;
  if char_length(v_body) > 20000 then raise exception 'anon_too_long' using errcode = 'P0001'; end if;
  -- hidden (reported) posts stay frozen until an admin clears them
  update public.anon_posts p set body = v_body, edited_at = now()
   where p.id = p_id and not p.is_deleted and not p.is_hidden
     and exists (select 1 from anon_private.post_authors a where a.post_id = p.id and a.member_id = v_me);
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'anon_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object('edited', true);
end;
$$;
revoke all on function public.anon_edit(uuid, text) from public, anon;
grant execute on function public.anon_edit(uuid, text) to authenticated;
