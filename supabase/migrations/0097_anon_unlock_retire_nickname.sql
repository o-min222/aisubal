-- 0097 · A42: retire 부캐 (nickname) posting; 익명 라운지 opens at N members with 익명/익명1/익명2 aliases.
-- Existing rows are kept (prod had 0 nickname profiles/posts and 0 anon posts when this shipped).

-- 1) unlock threshold moves from the old 부캐 key to the board
INSERT INTO public.site_config(key, value)
  SELECT 'anon_unlock_threshold', COALESCE((SELECT value FROM public.site_config WHERE key = 'nickname_unlock_threshold'), '100')
  ON CONFLICT (key) DO NOTHING;
DELETE FROM public.site_config WHERE key = 'nickname_unlock_threshold';

-- 2) no new 부캐: block the profile RPC and any nickname-authored row, whatever path writes it
REVOKE EXECUTE ON FUNCTION public.profile_save_nickname(text, text) FROM PUBLIC, anon, authenticated;
ALTER TABLE public.posts ADD CONSTRAINT posts_no_nickname_chk CHECK (posted_as IS DISTINCT FROM 'nickname');
ALTER TABLE public.product_comments ADD CONSTRAINT product_comments_no_nickname_chk CHECK (posted_as IS DISTINCT FROM 'nickname');

-- 3) per-thread aliases: the OP is 익명, everyone else 익명1, 익명2 … in order of first reply
CREATE OR REPLACE FUNCTION anon_private.alias_for(p_root uuid, p_member uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v TEXT;
  n INTEGER;
BEGIN
  SELECT alias INTO v FROM anon_private.thread_aliases WHERE root_id = p_root AND member_id = p_member;
  IF v IS NOT NULL THEN RETURN v; END IF;
  -- serialize alias allocation per thread
  PERFORM pg_advisory_xact_lock(hashtextextended(p_root::TEXT, 7));
  SELECT alias INTO v FROM anon_private.thread_aliases WHERE root_id = p_root AND member_id = p_member;
  IF v IS NOT NULL THEN RETURN v; END IF;
  -- anon_create asks for the root's alias before recording its author, so "no author yet" means the OP
  IF NOT EXISTS (SELECT 1 FROM anon_private.post_authors WHERE post_id = p_root)
     OR EXISTS (SELECT 1 FROM anon_private.post_authors WHERE post_id = p_root AND member_id = p_member) THEN
    v := '익명';
  ELSE
    SELECT count(*) INTO n FROM anon_private.thread_aliases WHERE root_id = p_root AND alias ~ '^익명[0-9]+$';
    v := '익명' || (n + 1);
  END IF;
  INSERT INTO anon_private.thread_aliases(root_id, member_id, alias) VALUES (p_root, p_member, v);
  RETURN v;
END;
$function$;

-- 4) posting is closed until the threshold
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
  -- A42: the board opens once the community reaches the admin-set size (site_config.anon_unlock_threshold)
  IF public.count_active_members() < anon_private.cfg_int('anon_unlock_threshold', 100) THEN
    RAISE EXCEPTION 'anon_locked' USING ERRCODE = 'P0001';
  END IF;
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
