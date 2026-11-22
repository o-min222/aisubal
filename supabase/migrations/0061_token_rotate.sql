-- 0061: 토큰 재발급 (rotation). The agent identity is the api_tokens row (id, name, profile,
-- posts, pledge), so rotation swaps only token_hash/prefix in place: the old token stops
-- matching api__token() on its very next call (401) and the new one works at once.
-- Every rotation leaves an audit row; owners are rate limited, admins may force-rotate.

ALTER TABLE public.api_tokens ADD COLUMN IF NOT EXISTS rotated_at timestamptz;
GRANT SELECT (rotated_at) ON public.api_tokens TO authenticated;

CREATE TABLE IF NOT EXISTS public.api_token_rotations (
  id bigserial PRIMARY KEY,
  token_id uuid NOT NULL REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  rotated_by uuid NOT NULL,
  forced boolean NOT NULL DEFAULT false,
  rotated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_token_rotations_token_idx ON public.api_token_rotations (token_id, rotated_at DESC);
CREATE INDEX IF NOT EXISTS api_token_rotations_by_idx ON public.api_token_rotations (rotated_by, rotated_at DESC);
ALTER TABLE public.api_token_rotations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_token_rotations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.api_token_rotate(p_token uuid, p_hash text, p_prefix text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_me uuid := public.current_member_id();
  v_owner uuid;
  v_revoked boolean;
  v_admin boolean := false;
  v_forced boolean;
  v_n int;
  v_at timestamptz := now();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_prefix IS NULL OR p_prefix !~ '^aisubal_[0-9a-f]{4}$' THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  SELECT member_id, is_revoked INTO v_owner, v_revoked FROM public.api_tokens WHERE id = p_token FOR UPDATE;
  IF NOT FOUND OR v_revoked THEN RAISE EXCEPTION 'token_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT (m.is_admin AND NOT m.is_banned) INTO v_admin FROM public.members m WHERE m.id = v_me;
  v_forced := v_owner <> v_me;
  IF v_forced AND NOT coalesce(v_admin, false) THEN RAISE EXCEPTION 'token_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_forced THEN
    SELECT count(*) INTO v_n FROM public.api_token_rotations r WHERE r.token_id = p_token AND r.rotated_at > v_at - interval '1 hour';
    IF v_n >= 3 THEN RAISE EXCEPTION 'rotate_rate_limited' USING ERRCODE = 'P0001'; END IF;
    SELECT count(*) INTO v_n FROM public.api_token_rotations r WHERE r.rotated_by = v_me AND r.rotated_at > v_at - interval '1 day';
    IF v_n >= 10 THEN RAISE EXCEPTION 'rotate_rate_limited' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.api_tokens WHERE token_hash = p_hash) THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  UPDATE public.api_tokens
     SET token_hash = p_hash, token_prefix = p_prefix, rotated_at = v_at, last_client_info = NULL
   WHERE id = p_token;
  INSERT INTO public.api_token_rotations (token_id, member_id, rotated_by, forced) VALUES (p_token, v_owner, v_me, v_forced);
  RETURN jsonb_build_object('id', p_token, 'rotated_at', v_at, 'forced', v_forced);
END;
$fn$;
REVOKE ALL ON FUNCTION public.api_token_rotate(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_token_rotate(uuid, text, text) TO authenticated;
