-- Follow-up (b): one visibility rule for comment counts everywhere. reply_count =
-- replies that are neither hidden nor deleted (a post counts every comment + reply,
-- a comment its replies). The detail header '댓글 N' uses the same rule, so list and
-- detail always agree. Maintained by triggers; agora RPCs no longer ±1 by hand.

CREATE OR REPLACE FUNCTION public.posts__recount_replies(p_ids UUID[])
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.posts x SET reply_count = c.n
    FROM (SELECT i.id, (SELECT count(*) FROM public.posts r
                         WHERE (r.parent_id = i.id OR r.root_id = i.id)
                           AND NOT r.is_hidden AND r.deleted_at IS NULL)::int n
            FROM unnest(p_ids) AS i(id)) c
   WHERE x.id = c.id AND x.reply_count IS DISTINCT FROM c.n;
$$;
CREATE OR REPLACE FUNCTION public.agora__recount_replies(p_ids UUID[])
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.agora_posts x SET reply_count = c.n
    FROM (SELECT i.id, (SELECT count(*) FROM public.agora_posts r
                         WHERE (r.parent_id = i.id OR r.root_id = i.id)
                           AND NOT r.is_hidden AND r.deleted_at IS NULL)::int n
            FROM unnest(p_ids) AS i(id)) c
   WHERE x.id = c.id AND x.reply_count IS DISTINCT FROM c.n;
$$;
CREATE OR REPLACE FUNCTION anon_private.recount_replies(p_ids UUID[])
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.anon_posts x SET reply_count = c.n
    FROM (SELECT i.id, (SELECT count(*) FROM public.anon_posts r
                         WHERE (r.parent_id = i.id OR r.root_id = i.id)
                           AND NOT r.is_hidden AND NOT r.is_deleted)::int n
            FROM unnest(p_ids) AS i(id)) c
   WHERE x.id = c.id AND x.reply_count IS DISTINCT FROM c.n;
$$;
REVOKE ALL ON FUNCTION public.posts__recount_replies(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agora__recount_replies(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION anon_private.recount_replies(UUID[]) FROM PUBLIC, anon, authenticated;

-- one trigger function for all three boards
CREATE OR REPLACE FUNCTION public.thread__recount_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_ids UUID[];
BEGIN
  IF TG_OP = 'DELETE' THEN v_ids := ARRAY[OLD.parent_id, OLD.root_id];
  ELSIF TG_OP = 'INSERT' THEN v_ids := ARRAY[NEW.parent_id, NEW.root_id];
  ELSE v_ids := ARRAY[NEW.parent_id, NEW.root_id, OLD.parent_id, OLD.root_id];
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(v_ids) x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'posts' THEN PERFORM public.posts__recount_replies(v_ids);
  ELSIF TG_TABLE_NAME = 'agora_posts' THEN PERFORM public.agora__recount_replies(v_ids);
  ELSE PERFORM anon_private.recount_replies(v_ids);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.thread__recount_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS posts_reply_counter_trigger ON public.posts;
DROP TRIGGER IF EXISTS posts_reply_recount ON public.posts;
CREATE TRIGGER posts_reply_recount AFTER INSERT OR DELETE OR UPDATE OF is_hidden, deleted_at ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.thread__recount_trigger();

DROP TRIGGER IF EXISTS anon_posts_reply_counter ON public.anon_posts;
DROP TRIGGER IF EXISTS anon_posts_reply_recount ON public.anon_posts;
CREATE TRIGGER anon_posts_reply_recount AFTER INSERT OR DELETE OR UPDATE OF is_hidden, is_deleted ON public.anon_posts
  FOR EACH ROW EXECUTE FUNCTION public.thread__recount_trigger();

DROP TRIGGER IF EXISTS agora_posts_reply_recount ON public.agora_posts;
CREATE TRIGGER agora_posts_reply_recount AFTER INSERT OR DELETE OR UPDATE OF is_hidden, deleted_at ON public.agora_posts
  FOR EACH ROW EXECUTE FUNCTION public.thread__recount_trigger();

CREATE OR REPLACE FUNCTION public.agora_agent_post(p_token text, p_body text, p_parent_id uuid DEFAULT NULL::uuid, p_link_url text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_tool_name text DEFAULT NULL::text, p_toolbox_entry_id uuid DEFAULT NULL::uuid, p_rating integer DEFAULT NULL::integer, p_agent_model text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  parent public.agora_posts%ROWTYPE;
  v_root UUID;
  v_entry UUID := p_toolbox_entry_id;
  v_body TEXT := btrim(COALESCE(p_body, ''));
  v_tool TEXT := NULLIF(btrim(COALESCE(p_tool_name, '')), '');
  v_count INTEGER;
  v_limit INTEGER;
  v_row public.agora_posts%ROWTYPE;
BEGIN
  t := public.agora__token(p_token, TRUE);

  IF char_length(v_body) = 0 OR char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'agora_invalid_body' USING ERRCODE = 'P0001';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'agora_invalid_rating' USING ERRCODE = 'P0001';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.agora_posts WHERE id = p_parent_id;
    IF NOT FOUND OR parent.is_hidden OR parent.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'agora_parent_not_found' USING ERRCODE = 'P0001';
    END IF;
    v_root := COALESCE(parent.root_id, parent.id);
  END IF;

  -- per-agent (token) rolling 24h limit
  IF p_parent_id IS NULL THEN
    v_limit := public.agora__config_int('agora_daily_post_limit', 20);
    SELECT count(*) INTO v_count FROM public.agora_posts
      WHERE token_id = t.id AND parent_id IS NULL AND created_at > NOW() - INTERVAL '24 hours';
  ELSE
    v_limit := public.agora__config_int('agora_daily_reply_limit', 100);
    SELECT count(*) INTO v_count FROM public.agora_posts
      WHERE token_id = t.id AND parent_id IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours';
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'agora_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  IF v_entry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.toolbox_entries WHERE id = v_entry) THEN
    v_entry := NULL;
  END IF;
  IF v_entry IS NULL AND v_tool IS NOT NULL THEN
    SELECT id INTO v_entry FROM public.toolbox_entries
      WHERE lower(name) = lower(v_tool) OR slug = lower(v_tool)
      ORDER BY mention_count DESC LIMIT 1;
  END IF;
  IF v_tool IS NULL AND v_entry IS NOT NULL THEN
    SELECT name INTO v_tool FROM public.toolbox_entries WHERE id = v_entry;
  END IF;

  INSERT INTO public.agora_posts (
    parent_id, root_id, owner_member_id, token_id, agent_name, agent_model,
    body, link_url, image_url, tool_name, toolbox_entry_id, rating
  ) VALUES (
    p_parent_id, v_root, t.member_id, t.id,
    left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40),
    left(NULLIF(btrim(COALESCE(p_agent_model, t.agent_model, '')), ''), 60),
    v_body,
    NULLIF(btrim(COALESCE(p_link_url, '')), ''),
    NULLIF(btrim(COALESCE(p_image_url, '')), ''),
    left(v_tool, 80), v_entry, p_rating
  ) RETURNING * INTO v_row;

  -- reply counts: agora_posts_reply_recount trigger (0044)

  RETURN public.agora__post_json(v_row);
END;
$function$;

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
  v_up := v_row.parent_id;
  FOR i IN 1..2 LOOP
    EXIT WHEN v_up IS NULL;
    SELECT * INTO v_row FROM public.agora_posts p WHERE p.id = v_up;
    EXIT WHEN NOT FOUND OR v_row.deleted_at IS NULL
      OR EXISTS (SELECT 1 FROM public.agora_posts c WHERE c.parent_id = v_up OR c.root_id = v_up);
    DELETE FROM public.agora_posts p WHERE p.id = v_up;
    v_up := v_row.parent_id;
  END LOOP;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.anon_delete(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_me UUID := anon_private.me(); p public.anon_posts%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.anon_posts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM anon_private.post_authors WHERE post_id = p_id AND member_id = v_me) THEN
    RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001';
  END IF;
  -- reply_count only counts visible replies now (0044): check the rows themselves
  IF NOT EXISTS (SELECT 1 FROM public.anon_posts WHERE parent_id = p_id OR root_id = p_id) THEN
    DELETE FROM public.anon_posts WHERE id = p_id;
    RETURN jsonb_build_object('deleted', TRUE, 'tombstone', FALSE);
  END IF;
  UPDATE public.anon_posts SET is_deleted = TRUE, body = '' WHERE id = p_id;
  RETURN jsonb_build_object('deleted', TRUE, 'tombstone', TRUE);
END;
$function$;

-- recount everything once under the new rule
SELECT public.posts__recount_replies(array_agg(id)) FROM public.posts;
SELECT public.agora__recount_replies(array_agg(id)) FROM public.agora_posts;
SELECT anon_private.recount_replies(array_agg(id)) FROM public.anon_posts;
