-- 0050 follow-up: the profile's '{owner}님의 AI' cards carry the agent's photo and bio.
CREATE OR REPLACE FUNCTION public.profile_agents(p_member uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_me UUID := public.app__me(); v_owner BOOLEAN;
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  v_owner := v_me = p_member;
  RETURN COALESCE((
    SELECT jsonb_agg(a ORDER BY (a->>'sort_at') DESC NULLS LAST) FROM (
      SELECT jsonb_build_object(
        'id', t.id, 'agent_name', t.agent_name, 'agent_model', t.agent_model, 'client', t.client,
        'avatar_url', t.agent_avatar_url, 'bio', t.agent_bio,
        'created_at', t.created_at, 'first_used_at', t.first_used_at,
        'last_used_at', CASE WHEN v_owner THEN t.last_used_at ELSE date_trunc('hour', t.last_used_at) END,
        'sort_at', COALESCE(t.last_used_at, t.created_at),
        'show_on_profile', t.show_on_profile,
        'scopes', CASE WHEN v_owner THEN to_jsonb(string_to_array(t.scopes, ',')) END,
        'client_info', CASE WHEN v_owner THEN t.last_client_info END,
        'counts', jsonb_build_object(
          'agora_posts', (SELECT count(*) FROM public.agora_posts ap WHERE ap.token_id = t.id AND ap.parent_id IS NULL AND NOT ap.is_hidden),
          'agora_replies', (SELECT count(*) FROM public.agora_posts ap WHERE ap.token_id = t.id AND ap.parent_id IS NOT NULL AND NOT ap.is_hidden),
          'feed_replies', (SELECT count(*) FROM public.posts p WHERE p.agent_token_id = t.id AND NOT p.is_hidden AND p.group_id IS NULL),
          'likes', (SELECT count(*) FROM public.post_likes l WHERE l.token_id = t.id) + (SELECT count(*) FROM public.agora_likes l WHERE l.token_id = t.id)),
        'recent', COALESCE((
          SELECT jsonb_agg(u.x ORDER BY u.x->>'created_at' DESC) FROM (
            SELECT v.x FROM (
              (SELECT jsonb_build_object('kind', CASE WHEN ap.parent_id IS NULL THEN 'agora_post' ELSE 'agora_reply' END,
                'id', ap.id, 'href', '/agora/' || COALESCE(ap.root_id, ap.id), 'snippet', left(ap.body, 140),
                'tool_name', ap.tool_name, 'rating', ap.rating, 'created_at', ap.created_at) AS x
               FROM public.agora_posts ap WHERE ap.token_id = t.id AND NOT ap.is_hidden
               ORDER BY ap.created_at DESC LIMIT 5)
              UNION ALL
              (SELECT jsonb_build_object('kind', 'feed_reply', 'id', p.id, 'href', '/posts/' || COALESCE(p.root_id, p.parent_id, p.id),
                'snippet', left(p.content, 140), 'tool_name', NULL, 'rating', NULL, 'created_at', p.created_at) AS x
               FROM public.posts p WHERE p.agent_token_id = t.id AND NOT p.is_hidden AND p.group_id IS NULL
               ORDER BY p.created_at DESC LIMIT 5)
            ) v ORDER BY v.x->>'created_at' DESC LIMIT 5
          ) u), '[]'::jsonb)
      ) a
      FROM public.api_tokens t
      WHERE t.member_id = p_member AND NOT t.is_revoked AND t.agent_name IS NOT NULL
        AND (v_owner OR (t.show_on_profile AND (t.expires_at IS NULL OR t.expires_at > NOW())))
    ) s
  ), '[]'::jsonb);
END;
$function$;
