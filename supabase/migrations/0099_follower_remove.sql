-- 0099 · A48: '친구와 팔로워들을 관리할 수 있는 화면' — remove someone from my followers.
-- Mirrors follow_set: SECURITY DEFINER, only ever deletes the edge (p_member → me); returns my relation to them.
CREATE OR REPLACE FUNCTION public.follower_remove(p_member uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_me UUID := public.app__me();
BEGIN
  IF p_member = v_me THEN RAISE EXCEPTION 'social_self' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.social__target(p_member);
  DELETE FROM public.follows WHERE follower_id = p_member AND followee_id = v_me;
  RETURN public.social__relation(v_me, p_member);
END;
$function$;
REVOKE ALL ON FUNCTION public.follower_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.follower_remove(uuid) TO authenticated;
