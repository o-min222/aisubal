-- Colin 2026-11-23: every member gets 3 invite slots (was 2). A slot is an original code plus its
-- 7-day renewals (0063), so allowance counts originals (renewed_from_id IS NULL), not every row —
-- renewals never eat into it and used codes are never touched. The invites page loader tops up
-- lazily through invites__renew_mine, so a later change to the setting needs no backfill.

UPDATE public.site_config SET value = '3' WHERE key = 'invites_per_member';
INSERT INTO public.site_config (key, value) SELECT 'invites_per_member', '3'
 WHERE NOT EXISTS (SELECT 1 FROM public.site_config WHERE key = 'invites_per_member');

CREATE OR REPLACE FUNCTION public.create_member_invite_codes(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_count INTEGER := 3;
  existing_slots INTEGER;
  new_code TEXT;
  cfg TEXT;
BEGIN
  SELECT value INTO cfg FROM public.site_config WHERE key = 'invites_per_member';
  IF cfg IS NOT NULL AND cfg ~ '^[0-9]+$' THEN
    target_count := cfg::INTEGER;
  END IF;

  -- slots = original codes; renewals replace a used code in the same slot
  SELECT COUNT(*) INTO existing_slots
  FROM public.invite_codes
  WHERE created_by_id = p_member_id AND renewed_from_id IS NULL;

  WHILE existing_slots < target_count LOOP
    LOOP
      new_code := public.generate_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invite_codes WHERE code = new_code);
    END LOOP;
    INSERT INTO public.invite_codes (code, created_by_id) VALUES (new_code, p_member_id);
    existing_slots := existing_slots + 1;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.create_member_invite_codes(UUID) FROM PUBLIC, anon, authenticated;

-- the invites page: top up missing slots, then renew codes used 7+ days ago; returns rows added
CREATE OR REPLACE FUNCTION public.invites__renew_mine()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_me UUID := public.current_member_id();
  v_before INTEGER;
  v_after INTEGER;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members m WHERE m.id = v_me AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE
  ) THEN
    RETURN 0;
  END IF;
  SELECT COUNT(*) INTO v_before FROM public.invite_codes WHERE created_by_id = v_me;
  PERFORM public.create_member_invite_codes(v_me);
  PERFORM public.invites__renew_due(v_me);
  SELECT COUNT(*) INTO v_after FROM public.invite_codes WHERE created_by_id = v_me;
  RETURN v_after - v_before;
END;
$$;
REVOKE ALL ON FUNCTION public.invites__renew_mine() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invites__renew_mine() TO authenticated;

-- backfill: existing active members up to 3 slots (adds codes only; used/renewed codes untouched)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.members WHERE signup_completed_at IS NOT NULL AND is_banned = FALSE LOOP
    PERFORM public.create_member_invite_codes(r.id);
  END LOOP;
END;
$$;
