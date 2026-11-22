-- Follow-up (a): agents never see deleted posts as content. Lists skip them; thread
-- reads keep tombstones for structure as {deleted: true, body: null, author: null};
-- agents can't like or reply to them.

CREATE OR REPLACE FUNCTION public.feed__post_json(p posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'parent_id', p.parent_id,
    'root_id', p.root_id,
    'depth', p.thread_depth,
    'reply_to_id', p.reply_to_id,
    'deleted', p.deleted_at IS NOT NULL,
    'edited', p.edited_at IS NOT NULL AND p.deleted_at IS NULL,
    'author', CASE WHEN p.deleted_at IS NOT NULL THEN NULL
      WHEN p.author_kind = 'agent'
      THEN jsonb_build_object('kind', 'agent', 'name', p.agent_name, 'model', p.agent_model,
             'owner', (SELECT m.display_name FROM public.members m WHERE m.id = p.author_id))
      ELSE public.api__author_json(p.author_id, p.posted_as) END,
    'title', CASE WHEN p.deleted_at IS NULL THEN NULLIF(p.title, '') END,
    'body', CASE WHEN p.deleted_at IS NULL THEN p.content END,
    'url', CASE WHEN p.deleted_at IS NULL THEN p.url END,
    'link_title', CASE WHEN p.deleted_at IS NULL THEN p.link_title END,
    'link_description', CASE WHEN p.deleted_at IS NULL THEN p.link_description END,
    'agent_interaction', p.agent_interaction,
    'like_count', p.like_count,
    'reply_count', p.reply_count,
    'created_at', p.created_at
  );
$function$;

CREATE OR REPLACE FUNCTION public.agora__post_json(p agora_posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'parent_id', p.parent_id,
    'root_id', p.root_id,
    'depth', p.thread_depth,
    'reply_to_id', p.reply_to_id,
    'deleted', p.deleted_at IS NOT NULL,
    'agent', CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE jsonb_build_object('name', p.agent_name, 'model', p.agent_model) END,
    'owner', CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE (SELECT jsonb_build_object('id', m.id, 'display_name', m.display_name)
              FROM public.members m WHERE m.id = p.owner_member_id) END,
    'body', CASE WHEN p.deleted_at IS NULL THEN p.body END,
    'link_url', CASE WHEN p.deleted_at IS NULL THEN p.link_url END,
    'image_url', CASE WHEN p.deleted_at IS NULL THEN p.image_url END,
    'tool', CASE WHEN p.tool_name IS NULL AND p.toolbox_entry_id IS NULL THEN NULL
                 ELSE jsonb_build_object('name', p.tool_name, 'toolbox_entry_id', p.toolbox_entry_id) END,
    'rating', p.rating,
    'like_count', p.like_count,
    'reply_count', p.reply_count,
    'created_at', p.created_at
  );
$function$;

CREATE OR REPLACE FUNCTION public.agora_agent_list(p_token text, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_tool text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
BEGIN
  t := public.agora__token(p_token, FALSE);
  RETURN COALESCE((
    SELECT jsonb_agg(public.agora__post_json(p) ORDER BY p.created_at DESC)
    FROM (
      SELECT * FROM public.agora_posts
      WHERE parent_id IS NULL AND is_hidden = FALSE AND deleted_at IS NULL
        AND (p_before IS NULL OR created_at < p_before)
        AND (p_tool IS NULL OR lower(tool_name) = lower(p_tool))
      ORDER BY created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) p
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_feed_list(p_token text, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['posts_read', 'feed:interact']);
  RETURN COALESCE((
    SELECT jsonb_agg(public.feed__post_json(p) ORDER BY p.created_at DESC)
    FROM (
      SELECT * FROM public.posts
      WHERE parent_id IS NULL AND is_hidden = FALSE AND group_id IS NULL AND deleted_at IS NULL
        AND (p_query IS NULL OR p_query = '' OR content ILIKE '%' || p_query || '%' OR title ILIKE '%' || p_query || '%')
      ORDER BY created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) p
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agora_agent_like(p_token text, p_post_id uuid, p_unlike boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_count INTEGER;
  v_likes INTEGER;
BEGIN
  t := public.agora__token(p_token, TRUE);

  IF NOT EXISTS (SELECT 1 FROM public.agora_posts WHERE id = p_post_id AND is_hidden = FALSE AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'agora_post_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF p_unlike THEN
    DELETE FROM public.agora_likes
      WHERE post_id = p_post_id AND liker_type = 'agent' AND token_id = t.id;
  ELSE
    SELECT count(*) INTO v_count FROM public.agora_likes
      WHERE token_id = t.id AND created_at > NOW() - INTERVAL '24 hours';
    IF v_count >= public.agora__config_int('agora_daily_like_limit', 300) THEN
      RAISE EXCEPTION 'agora_rate_limited' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.agora_likes (post_id, liker_type, member_id, token_id, agent_name)
      VALUES (p_post_id, 'agent', t.member_id, t.id,
              left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40))
      ON CONFLICT DO NOTHING;
  END IF;

  SELECT like_count INTO v_likes FROM public.agora_posts WHERE id = p_post_id;
  RETURN jsonb_build_object('post_id', p_post_id, 'liked', NOT p_unlike, 'like_count', v_likes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.feed_agent_like(p_token text, p_post_id uuid, p_unlike boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  p public.posts%ROWTYPE;
  root public.posts%ROWTYPE;
  v_count INTEGER;
BEGIN
  t := public.api__token(p_token, ARRAY['feed:interact']);
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE AND group_id IS NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO root FROM public.posts WHERE id = COALESCE(p.root_id, p.id);
  IF root.agent_interaction <> 'agents_allowed' THEN
    RAISE EXCEPTION 'feed_agents_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  IF p_unlike THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND liker_type = 'agent' AND token_id = t.id;
  ELSE
    SELECT count(*) INTO v_count FROM public.post_likes
      WHERE token_id = t.id AND created_at > NOW() - INTERVAL '24 hours';
    IF v_count >= public.agora__config_int('feed_agent_daily_like_limit', 300) THEN
      RAISE EXCEPTION 'api_rate_limited' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.post_likes (post_id, liker_type, member_id, token_id, agent_name)
      VALUES (p_post_id, 'agent', t.member_id, t.id, left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40))
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('post_id', p_post_id, 'liked', NOT p_unlike,
    'like_count', (SELECT like_count FROM public.posts WHERE id = p_post_id));
END;
$function$;

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

  IF p_parent_id IS NOT NULL THEN
    UPDATE public.agora_posts SET reply_count = reply_count + 1
      WHERE id = p_parent_id OR (id = v_root AND v_root <> p_parent_id);
  END IF;

  RETURN public.agora__post_json(v_row);
END;
$function$;
