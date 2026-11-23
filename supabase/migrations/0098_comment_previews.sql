-- 0098 · A46: a couple of comments under feed cards ("몇몇 댓글은 피드화면에서 그냥 바로 확인이 되면 좋겠어").
-- One batched call per feed page (no N+1). Top-level comments only, most-reacted first, then latest;
-- hidden / deleted comments never show.

-- Member feed: SECURITY INVOKER, so posts RLS (incl. A43 visibility; replies inherit their root's)
-- decides what the viewer may see. Returns ids only; the app loads them with its usual select.
CREATE OR REPLACE FUNCTION public.feed_comment_previews(p_ids uuid[], p_per integer DEFAULT 2)
 RETURNS TABLE(root_id uuid, id uuid, rnk integer)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO ''
AS $function$
  SELECT r.id, c.id, c.rnk::integer
  FROM unnest((COALESCE(p_ids, '{}'::uuid[]))[1:50]) AS r(id)
  CROSS JOIN LATERAL (
    SELECT p.id, row_number() OVER (ORDER BY p.like_count + COALESCE(p.reaction_count, 0) DESC, p.created_at DESC) AS rnk
    FROM public.posts p
    WHERE p.parent_id = r.id AND NOT p.is_hidden AND p.deleted_at IS NULL
    ORDER BY p.like_count + COALESCE(p.reaction_count, 0) DESC, p.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_per, 2), 1), 3)
  ) c;
$function$;
REVOKE ALL ON FUNCTION public.feed_comment_previews(uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feed_comment_previews(uuid[], integer) TO authenticated;

-- 익명 라운지: anon_posts aren't readable directly, so this is SECURITY DEFINER like anon_list and
-- returns the same post_json (alias 익명 / 익명N, never a member id).
CREATE OR REPLACE FUNCTION public.anon_comment_previews(p_ids uuid[], p_per integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_me UUID := anon_private.me(); v_per INTEGER := LEAST(GREATEST(COALESCE(p_per, 2), 1), 3);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(anon_private.post_json(c, v_me) ORDER BY r.ord, c.like_count DESC, c.created_at DESC)
    FROM unnest((COALESCE(p_ids, '{}'::uuid[]))[1:50]) WITH ORDINALITY AS r(id, ord)
    JOIN public.anon_posts root ON root.id = r.id AND root.parent_id IS NULL AND NOT root.is_hidden AND NOT root.is_deleted
    CROSS JOIN LATERAL (
      SELECT x.* FROM public.anon_posts x
      WHERE x.parent_id = r.id AND NOT x.is_hidden AND NOT x.is_deleted
      ORDER BY x.like_count DESC, x.created_at DESC
      LIMIT v_per
    ) c
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.anon_comment_previews(uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anon_comment_previews(uuid[], integer) TO authenticated;
