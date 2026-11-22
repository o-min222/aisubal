-- Authorship marker on every human post AND comment: the 익명 board too (0046 covered posts).
alter table public.anon_posts add column if not exists authorship text not null default 'human';
alter table public.anon_posts drop constraint if exists anon_posts_authorship_check;
alter table public.anon_posts add constraint anon_posts_authorship_check check (authorship in ('human', 'ai_assisted', 'ai_generated'));

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
    'createdAt', date_trunc('minute', p.created_at)
  ) || CASE WHEN p_admin THEN jsonb_build_object(
    'reportCount', p.report_count,
    'hiddenReason', p.hidden_reason,
    'adminCleared', p.admin_cleared,
    'reportReasons', COALESCE((SELECT jsonb_agg(r.reason ORDER BY r.created_at) FROM anon_private.reports r WHERE r.post_id = p.id), '[]'::jsonb)
  ) ELSE '{}'::jsonb END;
$function$;

drop function if exists public.anon_create(text, text, uuid);
CREATE OR REPLACE FUNCTION public.anon_create(p_body text, p_category text DEFAULT NULL::text, p_parent_id uuid DEFAULT NULL::uuid, p_authorship text DEFAULT 'human'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := anon_private.me();
  v_body TEXT := btrim(COALESCE(p_body, ''));
  v_max INTEGER := anon_private.cfg_int('anon_post_max_chars', 1000);
  parent public.anon_posts%ROWTYPE;
  v_root UUID; v_cat TEXT; v_alias TEXT; v_is_op BOOLEAN := FALSE; v_id UUID := gen_random_uuid(); v_count INTEGER;
BEGIN
  IF char_length(v_body) = 0 THEN RAISE EXCEPTION 'anon_empty' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_body) > 20000 THEN RAISE EXCEPTION 'anon_too_long' USING ERRCODE = 'P0001'; END IF;
  IF COALESCE(p_authorship, 'human') NOT IN ('human', 'ai_assisted', 'ai_generated') THEN RAISE EXCEPTION 'anon_bad_authorship' USING ERRCODE = 'P0001'; END IF;

  IF p_parent_id IS NULL THEN
    IF p_category IS NULL OR p_category NOT IN ('chat', 'work', 'career', 'ai', 'worry') THEN
      RAISE EXCEPTION 'anon_bad_category' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO v_count FROM anon_private.post_authors
      WHERE member_id = v_me AND NOT is_reply AND created_at > NOW() - INTERVAL '1 day';
    IF v_count >= anon_private.cfg_int('anon_daily_post_limit', 10) THEN
      RAISE EXCEPTION 'anon_daily_limit' USING ERRCODE = 'P0001';
    END IF;
    v_cat := p_category; v_is_op := TRUE;
    -- root row first so the alias FK holds; alias filled right after
    INSERT INTO public.anon_posts(id, category, body, alias, is_op, authorship) VALUES (v_id, v_cat, v_body, '', TRUE, COALESCE(p_authorship, 'human'));
    v_alias := anon_private.alias_for(v_id, v_me);
    UPDATE public.anon_posts SET alias = v_alias WHERE id = v_id;
    INSERT INTO anon_private.post_authors(post_id, member_id, root_id, is_reply) VALUES (v_id, v_me, v_id, FALSE);
    RETURN jsonb_build_object('id', v_id, 'rootId', v_id, 'alias', v_alias);
  END IF;

  SELECT * INTO parent FROM public.anon_posts WHERE id = p_parent_id;
  IF NOT FOUND OR parent.is_hidden OR parent.is_deleted THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  v_root := COALESCE(parent.root_id, parent.id);
  IF EXISTS (SELECT 1 FROM public.anon_posts WHERE id = v_root AND (is_hidden OR is_deleted)) THEN
    RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_count FROM anon_private.post_authors
    WHERE member_id = v_me AND is_reply AND created_at > NOW() - INTERVAL '1 day';
  IF v_count >= anon_private.cfg_int('anon_daily_reply_limit', 60) THEN
    RAISE EXCEPTION 'anon_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  SELECT category INTO v_cat FROM public.anon_posts WHERE id = v_root;
  v_is_op := EXISTS (SELECT 1 FROM anon_private.post_authors WHERE post_id = v_root AND member_id = v_me);
  v_alias := anon_private.alias_for(v_root, v_me);
  INSERT INTO public.anon_posts(id, parent_id, root_id, category, body, alias, is_op, authorship)
    VALUES (v_id, parent.id, v_root, v_cat, v_body, v_alias, v_is_op, COALESCE(p_authorship, 'human'));
  INSERT INTO anon_private.post_authors(post_id, member_id, root_id, is_reply) VALUES (v_id, v_me, v_root, TRUE);
  RETURN jsonb_build_object('id', v_id, 'rootId', v_root, 'alias', v_alias);
END;
$function$;
revoke all on function public.anon_create(text, text, uuid, text) from public, anon;
grant execute on function public.anon_create(text, text, uuid, text) to authenticated;

-- author changes it later (own rows via post_authors; never reveals who)
create or replace function public.anon_set_authorship(p_id uuid, p_authorship text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare v_me uuid := anon_private.me(); v_n int;
begin
  if v_me is null then return false; end if;
  if p_authorship not in ('human', 'ai_assisted', 'ai_generated') then
    raise exception 'anon_bad_authorship' using errcode = 'P0001';
  end if;
  update public.anon_posts p set authorship = p_authorship
   where p.id = p_id and not p.is_deleted
     and exists (select 1 from anon_private.post_authors a where a.post_id = p.id and a.member_id = v_me);
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke all on function public.anon_set_authorship(uuid, text) from public, anon;
grant execute on function public.anon_set_authorship(uuid, text) to authenticated;
