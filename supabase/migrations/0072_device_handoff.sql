-- D1: desktop onboarding hands setup to the member's phone (QR). The desktop makes a short-lived,
-- single-use handoff; only the SHA-256 of its 256-bit token is stored (the token itself lives in the
-- QR's URL fragment, so it never reaches a server log). The phone completes it either already signed
-- in as the same member (handoff_redeem), or — when the server has the service role — through
-- handoff_consume, after which the app mints that member's session with Supabase's own magic-link
-- verification (no email sent). The desktop polls handoff_status and moves on.

CREATE TABLE IF NOT EXISTS public.device_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_device_handoffs_member ON public.device_handoffs(member_id, created_at DESC);
ALTER TABLE public.device_handoffs ENABLE ROW LEVEL SECURITY;
-- no policies: reachable only through the functions below
REVOKE ALL ON public.device_handoffs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handoff__caller()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT m.id FROM public.members m WHERE m.auth_id = auth.uid() AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.handoff__caller() FROM PUBLIC, anon, authenticated;

-- desktop: start a handoff (≤5 per 10 minutes per member); returns its id and expiry
CREATE OR REPLACE FUNCTION public.handoff_create(p_token_hash TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.handoff__caller(); v_id UUID; v_exp TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'bad_token' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.device_handoffs WHERE member_id = v_me AND created_at < NOW() - INTERVAL '1 day';
  IF (SELECT count(*) FROM public.device_handoffs WHERE member_id = v_me AND created_at > NOW() - INTERVAL '10 minutes') >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.device_handoffs (member_id, token_hash) VALUES (v_me, p_token_hash) RETURNING id, expires_at INTO v_id, v_exp;
  RETURN jsonb_build_object('id', v_id, 'expiresAt', v_exp);
END;
$$;

-- desktop: poll my own handoff
CREATE OR REPLACE FUNCTION public.handoff_status(p_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE WHEN h.used_at IS NOT NULL THEN 'completed' WHEN h.expires_at <= NOW() THEN 'expired' ELSE 'pending' END
    FROM public.device_handoffs h WHERE h.id = p_id AND h.member_id = public.handoff__caller()
$$;

-- phone, already signed in: completes only for the same member; a wrong member never consumes it
CREATE OR REPLACE FUNCTION public.handoff_redeem(p_token_hash TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.handoff__caller(); h public.device_handoffs%ROWTYPE;
BEGIN
  SELECT * INTO h FROM public.device_handoffs WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR h.used_at IS NOT NULL OR h.expires_at <= NOW() THEN RETURN 'invalid'; END IF;
  IF v_me IS NULL OR h.member_id <> v_me THEN RETURN 'wrong_member'; END IF;
  UPDATE public.device_handoffs SET used_at = NOW() WHERE id = h.id;
  RETURN 'ok';
END;
$$;

-- server (service role) only: consume and return whose session to mint
CREATE OR REPLACE FUNCTION public.handoff_consume(p_token_hash TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_auth UUID;
BEGIN
  UPDATE public.device_handoffs h SET used_at = NOW()
   WHERE h.token_hash = p_token_hash AND h.used_at IS NULL AND h.expires_at > NOW()
     AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = h.member_id AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE)
  RETURNING (SELECT m.auth_id FROM public.members m WHERE m.id = h.member_id) INTO v_auth;
  RETURN v_auth;
END;
$$;

REVOKE ALL ON FUNCTION public.handoff_create(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handoff_status(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handoff_redeem(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handoff_consume(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_create(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_redeem(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_consume(TEXT) TO service_role;
