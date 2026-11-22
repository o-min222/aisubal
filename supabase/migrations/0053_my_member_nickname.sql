-- 부캐 split, step 1b: the signed-in member's own row carries their 부캐 from nickname_profiles
-- (nickname / nickname_bio / nickname_avatar_url / nickname_created_at keep their old keys; + nickname_id).
CREATE OR REPLACE FUNCTION public.get_my_member()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid UUID := (SELECT auth.uid()); r public.members%ROWTYPE; p public.member_private%ROWTYPE; np public.nickname_profiles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.members WHERE auth_id = uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.member_private WHERE member_id = r.id;
  SELECT * INTO np FROM public.nickname_profiles WHERE member_id = r.id;
  RETURN to_jsonb(r) || jsonb_build_object('email', COALESCE(p.email, ''), 'private_real_name', p.real_name,
    'private_google_avatar_url', p.google_avatar_url,
    'nickname', np.nickname, 'nickname_bio', np.bio, 'nickname_avatar_url', np.avatar_url,
    'nickname_created_at', np.created_at, 'nickname_id', np.id);
END;
$function$;
