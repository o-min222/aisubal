-- 0021: the pledge dateline carries the signing year ('{year}년, 새로운 시대의 경계 위에서').
-- Same pledge version (1): only the year varies, and it is part of the hashed
-- text, filled from signed_at in KST, so each record is exactly what was signed.

UPDATE public.pledge_texts
   SET body = replace(body, E'\n2026년, 새로운 시대의 경계 위에서', E'\n{year}년, 새로운 시대의 경계 위에서')
 WHERE version = 1;

CREATE OR REPLACE FUNCTION public.pledge__digest(p_kind text, p_version integer, p_signer text, p_inviter text, p_prev text, p_signed_at timestamptz)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  v_text text;
BEGIN
  SELECT body INTO v_text FROM public.pledge_texts WHERE version = p_version;
  IF v_text IS NULL OR p_signer IS NULL OR p_signed_at IS NULL THEN RAISE EXCEPTION 'pledge_text_missing' USING ERRCODE = 'P0001'; END IF;
  v_text := replace(v_text, '{year}', to_char(p_signed_at AT TIME ZONE 'Asia/Seoul', 'YYYY'));
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

-- Re-seal any record made under 0020 (in record order, so prev links follow).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT me.id, me.pledge_version, me.pledge_signer, me.pledge_inviter, me.pledge_signed_at, inv.pledge_hash AS prev
             FROM public.members me LEFT JOIN public.members inv ON inv.id = me.invited_by_id
            WHERE me.pledge_hash IS NOT NULL ORDER BY me.pledge_no LOOP
    UPDATE public.members
       SET pledge_prev_hash = (SELECT inv.pledge_hash FROM public.members me2 LEFT JOIN public.members inv ON inv.id = me2.invited_by_id WHERE me2.id = r.id),
           pledge_hash = public.pledge__digest('member', COALESCE(r.pledge_version, 1), r.pledge_signer, r.pledge_inviter,
                           (SELECT inv.pledge_hash FROM public.members me2 LEFT JOIN public.members inv ON inv.id = me2.invited_by_id WHERE me2.id = r.id), r.pledge_signed_at)
     WHERE id = r.id;
  END LOOP;
  UPDATE public.api_tokens tk
     SET pledge_prev_hash = o.pledge_hash,
         pledge_hash = public.pledge__digest('agent', COALESCE(tk.pledge_version, 1), tk.pledge_signer, tk.pledge_inviter, o.pledge_hash, tk.pledge_signed_at)
    FROM public.members o
   WHERE o.id = tk.member_id AND tk.pledge_hash IS NOT NULL;
END;
$$;
