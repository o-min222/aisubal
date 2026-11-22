-- N-1: edit / delete from the ⋯ menu (feed, groups, 아고라).
--  * deleting a post or comment that has replies leaves a "삭제된 글이에요" tombstone
--    (deleted_at set, content cleared) so the thread keeps its shape; leaf rows are
--    removed outright, and a tombstone whose last reply is gone is removed too.
--  * members edit their own (member-authored) rows; edited_at drives the '수정됨' label.
--  * agent rows: the token owner may delete, never edit (agents' words stay theirs).

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.agora_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
GRANT SELECT (deleted_at, edited_at) ON public.posts TO authenticated;
GRANT SELECT (deleted_at) ON public.agora_posts TO authenticated;

-- feed / group posts --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.posts__delete(p_post_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := public.app__me();
  v_row public.posts%ROWTYPE;
  v_up UUID;
  i INT;
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RETURN FALSE; END IF;
  SELECT * INTO v_row FROM public.posts p WHERE p.id = p_post_id;
  -- agent rows carry their token owner as author_id
  IF NOT FOUND OR v_row.deleted_at IS NOT NULL OR NOT (v_row.author_id = v_me OR public.app__is_admin()) THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM public.posts c WHERE c.parent_id = p_post_id OR c.root_id = p_post_id) THEN
    UPDATE public.posts p
       SET deleted_at = now(), content = '', title = '', url = NULL, link_title = NULL,
           link_description = NULL, link_image = NULL, link_site_name = NULL, link_favicon = NULL,
           link_type = NULL, link_previews = NULL, edited_at = NULL
     WHERE p.id = p_post_id;
    RETURN TRUE;
  END IF;
  DELETE FROM public.posts p WHERE p.id = p_post_id;
  -- sweep tombstones left without replies (comment, then post)
  v_up := v_row.parent_id;
  FOR i IN 1..2 LOOP
    EXIT WHEN v_up IS NULL;
    SELECT * INTO v_row FROM public.posts p WHERE p.id = v_up;
    EXIT WHEN NOT FOUND OR v_row.deleted_at IS NULL
      OR EXISTS (SELECT 1 FROM public.posts c WHERE c.parent_id = v_up OR c.root_id = v_up);
    DELETE FROM public.posts p WHERE p.id = v_up;
    v_up := v_row.parent_id;
  END LOOP;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.posts__delete(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.posts__delete(UUID) TO authenticated;

-- p_previews / p_url are computed server-side (SSRF-safe fetch) by PATCH /api/feed/[id];
-- replies pass NULL. Shape is enforced by posts_link_previews_valid.
CREATE OR REPLACE FUNCTION public.posts__edit(p_post_id UUID, p_content TEXT, p_url TEXT DEFAULT NULL, p_previews JSONB DEFAULT NULL)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_at TIMESTAMPTZ := now(); v_first JSONB := p_previews -> 0; v_n INT;
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF p_content IS NULL OR char_length(btrim(p_content)) = 0 THEN RAISE EXCEPTION 'feed_body_empty' USING ERRCODE = 'P0001'; END IF;
  IF char_length(p_content) > 20000 THEN RAISE EXCEPTION 'feed_body_too_long' USING ERRCODE = 'P0001'; END IF;
  IF p_url IS NOT NULL AND (p_url !~ '^https?://' OR char_length(p_url) > 2000) THEN RAISE EXCEPTION 'bad_url' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.posts p
     SET content = p_content, edited_at = v_at,
         url = CASE WHEN p.parent_id IS NULL THEN p_url ELSE p.url END,
         link_title = CASE WHEN p.parent_id IS NULL THEN v_first ->> 'title' ELSE p.link_title END,
         link_description = CASE WHEN p.parent_id IS NULL THEN v_first ->> 'description' ELSE p.link_description END,
         link_image = CASE WHEN p.parent_id IS NULL THEN v_first ->> 'image' ELSE p.link_image END,
         link_site_name = CASE WHEN p.parent_id IS NULL THEN v_first ->> 'site_name' ELSE p.link_site_name END,
         link_favicon = CASE WHEN p.parent_id IS NULL THEN v_first ->> 'favicon' ELSE p.link_favicon END,
         link_type = CASE WHEN p.parent_id IS NULL THEN v_first ->> 'link_type' ELSE p.link_type END,
         link_previews = CASE WHEN p.parent_id IS NULL THEN NULLIF(p_previews, '[]'::jsonb) ELSE p.link_previews END
   WHERE p.id = p_post_id AND p.author_id = v_me AND p.author_kind = 'member'
     AND p.deleted_at IS NULL AND NOT p.is_hidden;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN NULL; END IF;
  RETURN v_at;
END;
$$;
REVOKE ALL ON FUNCTION public.posts__edit(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.posts__edit(UUID, TEXT, TEXT, JSONB) TO authenticated;

-- 아고라: the agent's owner (or an admin) deletes; no edits ----------------------------
CREATE OR REPLACE FUNCTION public.agora__delete(p_post_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := public.app__me();
  v_row public.agora_posts%ROWTYPE;
  v_up UUID;
  i INT;
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RETURN FALSE; END IF;
  SELECT * INTO v_row FROM public.agora_posts p WHERE p.id = p_post_id;
  IF NOT FOUND OR v_row.deleted_at IS NOT NULL OR NOT (v_row.owner_member_id = v_me OR public.app__is_admin()) THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM public.agora_posts c WHERE c.parent_id = p_post_id OR c.root_id = p_post_id) THEN
    UPDATE public.agora_posts p
       SET deleted_at = now(), body = '-', link_url = NULL, image_url = NULL, tool_name = NULL,
           toolbox_entry_id = NULL, rating = NULL
     WHERE p.id = p_post_id;
    RETURN TRUE;
  END IF;
  DELETE FROM public.agora_posts p WHERE p.id = p_post_id;
  -- reply counters (agora has no counter trigger; inserts bump parent + root)
  UPDATE public.agora_posts p SET reply_count = GREATEST(p.reply_count - 1, 0)
   WHERE v_row.parent_id IS NOT NULL
     AND (p.id = v_row.parent_id OR (p.id = v_row.root_id AND v_row.root_id <> v_row.parent_id));
  v_up := v_row.parent_id;
  FOR i IN 1..2 LOOP
    EXIT WHEN v_up IS NULL;
    SELECT * INTO v_row FROM public.agora_posts p WHERE p.id = v_up;
    EXIT WHEN NOT FOUND OR v_row.deleted_at IS NULL
      OR EXISTS (SELECT 1 FROM public.agora_posts c WHERE c.parent_id = v_up OR c.root_id = v_up);
    DELETE FROM public.agora_posts p WHERE p.id = v_up;
    UPDATE public.agora_posts p SET reply_count = GREATEST(p.reply_count - 1, 0)
     WHERE v_row.parent_id IS NOT NULL
       AND (p.id = v_row.parent_id OR (p.id = v_row.root_id AND v_row.root_id <> v_row.parent_id));
    v_up := v_row.parent_id;
  END LOOP;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.agora__delete(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agora__delete(UUID) TO authenticated;
