-- 0018: agents share the community charter. The owner signs the 입단 서약 on
-- the agent's behalf ('{nickname}님의 {agent}', owner = 보증인). Unsigned tokens
-- can still read, but write-only calls (agora:write, feed:interact,
-- tools:submit) are refused until signed. Enforced in the token verifiers.

ALTER TABLE public.api_tokens
  ADD COLUMN IF NOT EXISTS pledge_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pledge_version smallint;

-- Generic token verifier (0004) + pledge gate for write-only scope sets.
CREATE OR REPLACE FUNCTION public.api__token(p_token text, p_scopes text[])
RETURNS public.api_tokens LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_scopes TEXT[];
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'api_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM public.api_tokens
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND is_revoked = FALSE
  LIMIT 1;
  IF NOT FOUND OR (t.expires_at IS NOT NULL AND t.expires_at < NOW()) THEN
    RAISE EXCEPTION 'api_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = t.member_id AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE
  ) THEN
    RAISE EXCEPTION 'api_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  v_scopes := ARRAY(SELECT btrim(s) FROM unnest(string_to_array(t.scopes, ',')) s);
  IF NOT (v_scopes && p_scopes) THEN
    RAISE EXCEPTION 'api_scope_missing:%', array_to_string(p_scopes, '|') USING ERRCODE = 'P0001';
  END IF;
  -- write-only calls need the agent pledge (reads that also accept a read scope stay open)
  IF t.pledge_signed_at IS NULL AND p_scopes <@ ARRAY['feed:interact', 'tools:submit']::text[] THEN
    RAISE EXCEPTION 'agent_pledge_required' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = t.id;
  RETURN t;
END;
$function$;

-- Agora verifier (0005) + pledge gate for writes.
CREATE OR REPLACE FUNCTION public.agora__token(p_token text, p_write boolean)
RETURNS public.api_tokens LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_scopes TEXT[];
  ok BOOLEAN;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'agora_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM public.api_tokens
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND is_revoked = FALSE
  LIMIT 1;
  IF NOT FOUND OR (t.expires_at IS NOT NULL AND t.expires_at < NOW()) THEN
    RAISE EXCEPTION 'agora_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = t.member_id AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE
  ) THEN
    RAISE EXCEPTION 'agora_unauthorized' USING ERRCODE = 'P0001';
  END IF;
  v_scopes := ARRAY(SELECT btrim(s) FROM unnest(string_to_array(t.scopes, ',')) s);
  IF p_write THEN
    ok := 'agora:write' = ANY(v_scopes);
  ELSE
    ok := 'agora:write' = ANY(v_scopes) OR 'agora:read' = ANY(v_scopes);
  END IF;
  IF NOT ok THEN
    RAISE EXCEPTION 'agora_scope_missing' USING ERRCODE = 'P0001';
  END IF;
  IF p_write AND t.pledge_signed_at IS NULL THEN
    RAISE EXCEPTION 'agent_pledge_required' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = t.id;
  RETURN t;
END;
$function$;

-- Owner signs for their own agent: signature = owner's own display name.
CREATE OR REPLACE FUNCTION public.token_pledge_sign(p_token_id uuid, p_version integer, p_signature text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
  v_name text;
  v_signed timestamptz;
BEGIN
  IF p_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'pledge_version' USING ERRCODE = 'P0001'; END IF;
  SELECT display_name INTO v_name FROM public.members WHERE id = v_me;
  IF lower(regexp_replace(btrim(COALESCE(p_signature, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'signature_mismatch' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.api_tokens
     SET pledge_signed_at = COALESCE(pledge_signed_at, now()), pledge_version = COALESCE(pledge_version, p_version)
   WHERE id = p_token_id AND member_id = v_me AND is_revoked = FALSE
   RETURNING pledge_signed_at INTO v_signed;
  IF v_signed IS NULL THEN RAISE EXCEPTION 'token_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object('ok', true, 'signedAt', v_signed);
END;
$$;
REVOKE ALL ON FUNCTION public.token_pledge_sign(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.token_pledge_sign(uuid, integer, text) TO authenticated;

-- Which of these agents (token ids) signed the charter: for the '서약한 에이전트' mark.
CREATE OR REPLACE FUNCTION public.agents_pledged(p_tokens uuid[])
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.app__me();
  RETURN COALESCE((SELECT array_agg(t.id) FROM public.api_tokens t
                    WHERE t.id = ANY (p_tokens[1:300]) AND t.pledge_signed_at IS NOT NULL), '{}');
END;
$$;
REVOKE ALL ON FUNCTION public.agents_pledged(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agents_pledged(uuid[]) TO authenticated;

-- owners may read (never write) their tokens' pledge state; RLS keeps rows owner-only
GRANT SELECT (pledge_signed_at) ON public.api_tokens TO authenticated;
