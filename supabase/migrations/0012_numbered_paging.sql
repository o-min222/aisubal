-- 0012: numbered pagination (no infinite scroll). anon_list 'latest' now honours p_offset
-- like 'popular' does, so /anon?page=N works for both sorts.
CREATE OR REPLACE FUNCTION public.anon_list(
  p_category TEXT DEFAULT NULL, p_sort TEXT DEFAULT 'latest',
  p_before TIMESTAMPTZ DEFAULT NULL, p_offset INTEGER DEFAULT 0, p_limit INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := anon_private.me(); v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
  v_off INTEGER := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
BEGIN
  IF p_sort = 'popular' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(anon_private.post_json(x, v_me) ORDER BY x.like_count * 2 + x.reply_count DESC, x.created_at DESC)
      FROM (
        SELECT p.id FROM public.anon_posts p
        WHERE p.parent_id IS NULL AND NOT p.is_hidden AND NOT p.is_deleted
          AND (p_category IS NULL OR p.category = p_category)
          AND p.created_at > NOW() - INTERVAL '30 days'
        ORDER BY p.like_count * 2 + p.reply_count DESC, p.created_at DESC
        OFFSET v_off LIMIT v_lim
      ) s JOIN public.anon_posts x ON x.id = s.id), '[]'::jsonb);
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(anon_private.post_json(x, v_me) ORDER BY x.created_at DESC)
    FROM (
      SELECT p.id FROM public.anon_posts p
      WHERE p.parent_id IS NULL AND NOT p.is_hidden AND NOT p.is_deleted
        AND (p_category IS NULL OR p.category = p_category)
        AND (p_before IS NULL OR p.created_at < p_before)
      ORDER BY p.created_at DESC
      OFFSET v_off LIMIT v_lim
    ) s JOIN public.anon_posts x ON x.id = s.id), '[]'::jsonb);
END;
$$;
