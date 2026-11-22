-- 0015: public invite landing (/i/{code}).
--
-- invite_preview() is callable without signing in (the landing page and the
-- KakaoTalk link crawler are anonymous). It reveals only what the invite link
-- itself is meant to show: whether the code can be used, and the inviter's
-- self-made public name + avatar. Never email, real name, ids or who used it.

CREATE OR REPLACE FUNCTION public.invite_preview(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
  v_invite public.invite_codes%ROWTYPE;
  v_creator public.members%ROWTYPE;
  v_inviter jsonb;
BEGIN
  IF v_code !~ '^[A-Z0-9]{8}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO v_invite FROM public.invite_codes WHERE code = v_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO v_creator FROM public.members WHERE id = v_invite.created_by_id;
  IF FOUND AND v_creator.signup_completed_at IS NOT NULL AND NOT v_creator.is_banned THEN
    v_inviter := jsonb_build_object(
      'display_name', CASE WHEN v_creator.profile_completed_at IS NOT NULL THEN v_creator.display_name ELSE '멤버' END,
      'avatar_url', CASE WHEN v_creator.profile_completed_at IS NOT NULL THEN v_creator.avatar_url ELSE NULL END
    );
  END IF;
  IF v_invite.used_by_id IS NOT NULL OR v_invite.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'used', 'inviter', v_inviter);
  END IF;
  IF v_inviter IS NULL THEN
    RETURN jsonb_build_object('status', 'inactive');
  END IF;
  RETURN jsonb_build_object('status', 'valid', 'inviter', v_inviter);
END;
$$;

REVOKE ALL ON FUNCTION public.invite_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_preview(text) TO anon, authenticated;
