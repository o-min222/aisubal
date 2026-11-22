-- 0017: '선언 및 입단 서약' — signup is complete only after the pledge is signed.
-- Columns are NOT granted to clients (members has column-level SELECT); the
-- owner reads them through pledge_status() and writes through pledge_sign().

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS pledge_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pledge_version smallint;

-- Own pledge state: signer = self-made display name (never the real name),
-- inviter = inviter's display name (null for founding members).
CREATE OR REPLACE FUNCTION public.pledge_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
  m record;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT me.pledge_signed_at, me.pledge_version, me.display_name, me.profile_completed_at, inv.display_name AS inviter
    INTO m
    FROM public.members me
    LEFT JOIN public.members inv ON inv.id = me.invited_by_id
   WHERE me.id = v_me;
  RETURN jsonb_build_object(
    'signedAt', m.pledge_signed_at,
    'version', m.pledge_version,
    'signer', m.display_name,
    'inviter', m.inviter,
    'profileDone', m.profile_completed_at IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.pledge_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pledge_status() TO authenticated;

-- Sign once: the typed signature must match the member's own display name.
CREATE OR REPLACE FUNCTION public.pledge_sign(p_version integer, p_signature text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
  v_name text;
  v_done timestamptz;
  v_signed timestamptz;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF p_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'pledge_version' USING ERRCODE = 'P0001'; END IF;
  SELECT display_name, profile_completed_at, pledge_signed_at INTO v_name, v_done, v_signed FROM public.members WHERE id = v_me FOR UPDATE;
  IF v_done IS NULL THEN RAISE EXCEPTION 'profile_required' USING ERRCODE = 'P0001'; END IF;
  IF lower(regexp_replace(btrim(COALESCE(p_signature, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'signature_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF v_signed IS NULL THEN
    UPDATE public.members SET pledge_signed_at = now(), pledge_version = p_version WHERE id = v_me RETURNING pledge_signed_at INTO v_signed;
  END IF;
  RETURN jsonb_build_object('ok', true, 'signedAt', v_signed);
END;
$$;
REVOKE ALL ON FUNCTION public.pledge_sign(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pledge_sign(integer, text) TO authenticated;
