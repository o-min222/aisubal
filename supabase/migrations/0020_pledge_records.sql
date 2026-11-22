-- 0020: permanent pledge records ('입단 기록'). Every signature becomes a block:
-- a gapless record number, the SHA-256 digest of a canonical payload, and a link
-- (prev) to the inviter's block (members) or the owner's block (agents).
-- The payload format is mirrored in src/lib/pledge-record.ts so it can be
-- recomputed anywhere; columns stay hidden from clients (read via RPCs/grants).

CREATE TABLE IF NOT EXISTS public.pledge_texts (
  version smallint PRIMARY KEY,
  body text NOT NULL
);
ALTER TABLE public.pledge_texts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pledge_texts FROM PUBLIC, anon, authenticated;
-- canonical text v1 = the authored Korean pledge (title, preamble, vows, closing, dateline joined by \n)
INSERT INTO public.pledge_texts (version, body) VALUES (1, $pledge$[AI쓰발 선언 및 입단 서약]
인류사의 흐름 속에서 낡은 시대의 굴레를 끊고 새로운 지성의 시대로 나아가야 할 때가 온다면, 우리는 그 결단의 이유를 분명히 밝혀야 한다.
우리는 다음의 진리가 자명하다고 믿는다. 인류는 언제나 허락된 선을 넘음으로써 진화해 왔으며, AI를 쓰고 발전하는 모든 이에게는 낡은 상식과 규범 너머를 탐구할 권리가 있다.
이에 초대로 맺어진 신뢰의 연대 AI쓰발에 합류하며, 다음을 서약한다.
첫째, 어제의 상식과 기술의 속도를 따라오지 못하는 낡은 규범에 갇히지 않고, 가장 과감한 실험을 멈추지 않겠다.
둘째, 내가 발견한 돌파구를 독점하지 않고, 동료들과 나누고 변주하며 함께 진화하겠다.
셋째, 초대로 맺어진 이 공간의 신뢰를 굳건히 지키며, 선을 넘는 자유에 따르는 모든 책임을 스스로 지겠다.
이 선언을 뒷받침하기 위해, 우리는 서로의 신뢰와 명예를 걸고 굳게 서약한다.
2026년, 새로운 시대의 경계 위에서$pledge$)
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS pledge_no integer UNIQUE,
  ADD COLUMN IF NOT EXISTS pledge_hash text,
  ADD COLUMN IF NOT EXISTS pledge_prev_hash text,
  ADD COLUMN IF NOT EXISTS pledge_signer text,
  ADD COLUMN IF NOT EXISTS pledge_inviter text;

ALTER TABLE public.api_tokens
  ADD COLUMN IF NOT EXISTS pledge_no integer UNIQUE,
  ADD COLUMN IF NOT EXISTS pledge_hash text,
  ADD COLUMN IF NOT EXISTS pledge_prev_hash text,
  ADD COLUMN IF NOT EXISTS pledge_signer text,
  ADD COLUMN IF NOT EXISTS pledge_inviter text;

-- SHA-256 over the canonical payload (see src/lib/pledge-record.ts).
CREATE OR REPLACE FUNCTION public.pledge__digest(p_kind text, p_version integer, p_signer text, p_inviter text, p_prev text, p_signed_at timestamptz)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  v_text text;
BEGIN
  SELECT body INTO v_text FROM public.pledge_texts WHERE version = p_version;
  IF v_text IS NULL OR p_signer IS NULL OR p_signed_at IS NULL THEN RAISE EXCEPTION 'pledge_text_missing' USING ERRCODE = 'P0001'; END IF;
  RETURN encode(sha256(convert_to(
    'aisubal-pledge/1' || E'\n' ||
    'kind:' || p_kind || E'\n' ||
    'version:' || p_version || E'\n' ||
    'text:' || v_text || E'\n' ||
    'signer:' || p_signer || E'\n' ||
    'inviter:' || COALESCE(p_inviter, '') || E'\n' ||
    'prev:' || COALESCE(p_prev, 'genesis') || E'\n' ||
    'signed_at:' || to_char(p_signed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'UTF8')), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.pledge__digest(text, integer, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- Seal one member's record (caller holds the row lock). Idempotent.
CREATE OR REPLACE FUNCTION public.pledge__seal_member(p_member uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  m record;
  v_no integer;
  v_at timestamptz;
BEGIN
  SELECT me.pledge_signed_at, me.pledge_version, me.pledge_hash, me.display_name, inv.display_name AS inviter, inv.pledge_hash AS prev
    INTO m
    FROM public.members me
    LEFT JOIN public.members inv ON inv.id = me.invited_by_id
   WHERE me.id = p_member;
  IF m.pledge_signed_at IS NULL OR m.pledge_hash IS NOT NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('aisubal_member_pledge_no'));
  SELECT COALESCE(max(pledge_no), 0) + 1 INTO v_no FROM public.members;
  v_at := date_trunc('milliseconds', m.pledge_signed_at);
  UPDATE public.members
     SET pledge_signed_at = v_at,
         pledge_no = v_no,
         pledge_signer = m.display_name,
         pledge_inviter = m.inviter,
         pledge_prev_hash = m.prev,
         pledge_hash = public.pledge__digest('member', COALESCE(m.pledge_version, 1), m.display_name, m.inviter, m.prev, v_at)
   WHERE id = p_member;
END;
$$;
REVOKE ALL ON FUNCTION public.pledge__seal_member(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pledge__seal_token(p_token uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  t record;
  v_no integer;
  v_at timestamptz;
  v_signer text;
BEGIN
  SELECT tk.pledge_signed_at, tk.pledge_version, tk.pledge_hash, COALESCE(NULLIF(btrim(tk.agent_name), ''), tk.name) AS agent, o.display_name AS owner, o.pledge_hash AS prev
    INTO t
    FROM public.api_tokens tk
    JOIN public.members o ON o.id = tk.member_id
   WHERE tk.id = p_token;
  IF t.pledge_signed_at IS NULL OR t.pledge_hash IS NOT NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('aisubal_agent_pledge_no'));
  SELECT COALESCE(max(pledge_no), 0) + 1 INTO v_no FROM public.api_tokens;
  v_at := date_trunc('milliseconds', t.pledge_signed_at);
  v_signer := t.owner || '님의 ' || t.agent;
  UPDATE public.api_tokens
     SET pledge_signed_at = v_at,
         pledge_no = v_no,
         pledge_signer = v_signer,
         pledge_inviter = t.owner,
         pledge_prev_hash = t.prev,
         pledge_hash = public.pledge__digest('agent', COALESCE(t.pledge_version, 1), v_signer, t.owner, t.prev, v_at)
   WHERE id = p_token;
END;
$$;
REVOKE ALL ON FUNCTION public.pledge__seal_token(uuid) FROM PUBLIC, anon, authenticated;

-- Own record as JSON (null fields until signed).
CREATE OR REPLACE FUNCTION public.pledge_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
  m record;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT me.pledge_signed_at, me.pledge_version, me.display_name, me.profile_completed_at, me.pledge_no, me.pledge_hash, me.pledge_prev_hash,
         me.pledge_signer, me.pledge_inviter, inv.display_name AS inviter, inv.pledge_no AS inviter_no
    INTO m
    FROM public.members me
    LEFT JOIN public.members inv ON inv.id = me.invited_by_id
   WHERE me.id = v_me;
  RETURN jsonb_build_object(
    'signedAt', m.pledge_signed_at,
    'version', m.pledge_version,
    'signer', COALESCE(m.pledge_signer, m.display_name),
    'inviter', CASE WHEN m.pledge_hash IS NOT NULL THEN m.pledge_inviter ELSE m.inviter END,
    'no', m.pledge_no,
    'hash', m.pledge_hash,
    'prevHash', m.pledge_prev_hash,
    'prevNo', m.inviter_no,
    'profileDone', m.profile_completed_at IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.pledge_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pledge_status() TO authenticated;

-- Sign once, then seal the record. Returns the full record.
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
    UPDATE public.members SET pledge_signed_at = date_trunc('milliseconds', now()), pledge_version = p_version WHERE id = v_me;
  END IF;
  PERFORM public.pledge__seal_member(v_me);
  RETURN public.pledge_status() || jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.pledge_sign(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pledge_sign(integer, text) TO authenticated;

-- Owner signs for their own agent, then the agent's block is sealed (prev = owner's block).
CREATE OR REPLACE FUNCTION public.token_pledge_sign(p_token_id uuid, p_version integer, p_signature text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
  v_name text;
  v_id uuid;
  r record;
BEGIN
  IF p_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'pledge_version' USING ERRCODE = 'P0001'; END IF;
  SELECT display_name INTO v_name FROM public.members WHERE id = v_me;
  IF lower(regexp_replace(btrim(COALESCE(p_signature, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'signature_mismatch' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.api_tokens
     SET pledge_signed_at = COALESCE(pledge_signed_at, date_trunc('milliseconds', now())), pledge_version = COALESCE(pledge_version, p_version)
   WHERE id = p_token_id AND member_id = v_me AND is_revoked = FALSE
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'token_not_found' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.pledge__seal_token(v_id);
  SELECT tk.pledge_signed_at, tk.pledge_no, tk.pledge_hash, tk.pledge_prev_hash, tk.pledge_signer, tk.pledge_inviter, o.pledge_no AS owner_no
    INTO r FROM public.api_tokens tk JOIN public.members o ON o.id = tk.member_id WHERE tk.id = v_id;
  RETURN jsonb_build_object('ok', true, 'signedAt', r.pledge_signed_at, 'no', r.pledge_no, 'hash', r.pledge_hash, 'prevHash', r.pledge_prev_hash,
                            'signer', r.pledge_signer, 'inviter', r.pledge_inviter, 'prevNo', r.owner_no);
END;
$$;
REVOKE ALL ON FUNCTION public.token_pledge_sign(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.token_pledge_sign(uuid, integer, text) TO authenticated;

-- owners read their agents' record (RLS keeps api_tokens rows owner-only)
GRANT SELECT (pledge_no, pledge_hash) ON public.api_tokens TO authenticated;

-- Backfill: seal existing signatures in signing order (members first, so agents link to owners).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.members WHERE pledge_signed_at IS NOT NULL AND pledge_hash IS NULL ORDER BY pledge_signed_at, id LOOP
    PERFORM public.pledge__seal_member(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.api_tokens WHERE pledge_signed_at IS NOT NULL AND pledge_hash IS NULL ORDER BY pledge_signed_at, id LOOP
    PERFORM public.pledge__seal_token(r.id);
  END LOOP;
END;
$$;
