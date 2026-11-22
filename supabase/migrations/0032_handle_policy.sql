-- 0032 — Instagram-style @handle change policy.
--  * At most 2 changes per rolling 14 days (the first handle set at onboarding is free).
--  * After a change the old handle is held for its owner for 14 days: nobody else can take it,
--    only the owner can switch back (which counts as a change). Then it is released.
--  * handle_history keeps every change; the member sees their own rows, admins see all, never public.
--  * /u/{old} resolves to the member during the hold, and after release only while unclaimed.
-- Enforced in SECURITY DEFINER functions (row lock + per-handle advisory lock), a members
-- trigger (no handle change outside the policy function, no taking a held handle) and an
-- exclusion constraint (no two overlapping holds on the same handle).

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- reserved / system handles (extends the 0010 list)
CREATE OR REPLACE FUNCTION public.profile__handle_ok(p TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT p ~ '^[a-z0-9_]{3,20}$' AND p NOT IN ('admin', 'root', 'system', 'aisubal', 'support', 'help', 'null', 'undefined',
    'me', 'settings', 'moim', 'groups', 'network', 'agora', 'anon', 'feed', 'tools', 'api', 'mod', 'staff', 'official',
    'gallery', 'search', 'members', 'agents', 'invites', 'login', 'logout', 'signup', 'onboarding', 'waitlist', 'archive',
    'notifications', 'administrator', 'moderator', 'owner', 'team', 'security', 'privacy', 'terms', 'about', 'auth',
    'oauth', 'mcp', 'new', 'edit', 'anonymous', 'aisubal_official', 'official_aisubal', 'aisubal_team', 'aisubal_admin');
$$;

CREATE TABLE IF NOT EXISTS public.handle_history (
  id BIGSERIAL PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  old_handle TEXT NOT NULL,
  new_handle TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- end of the hold: changed_at + 14 days, or earlier when the owner switched back to it
  released_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT handle_history_diff CHECK (old_handle <> new_handle),
  CONSTRAINT handle_history_format CHECK (old_handle ~ '^[a-z0-9_]{3,20}$' AND new_handle ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT handle_history_release CHECK (released_at >= changed_at AND released_at <= changed_at + INTERVAL '14 days'),
  CONSTRAINT handle_history_one_hold EXCLUDE USING gist (old_handle WITH =, tstzrange(changed_at, released_at, '[)') WITH &&)
);
CREATE INDEX IF NOT EXISTS handle_history_member_idx ON public.handle_history (member_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS handle_history_old_idx ON public.handle_history (old_handle, released_at DESC);

ALTER TABLE public.handle_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.handle_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.handle_history TO authenticated;
REVOKE ALL ON SEQUENCE public.handle_history_id_seq FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS handle_history_select ON public.handle_history;
CREATE POLICY handle_history_select ON public.handle_history FOR SELECT TO authenticated
  USING (member_id = (SELECT public.app__me()) OR (SELECT public.app__is_admin()));

-- ---- members trigger: the policy function is the only way to change an existing handle ----
CREATE OR REPLACE FUNCTION public.members_handle_policy()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.handle IS NULL OR NEW.handle IS NOT DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.handle END) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.handle IS NOT NULL AND COALESCE(current_setting('app.handle_change', TRUE), '') <> 'on' THEN
    RAISE EXCEPTION 'handle_change_use_rpc' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.handle_history h
             WHERE h.old_handle = NEW.handle AND h.released_at > NOW() AND h.member_id <> NEW.id) THEN
    RAISE EXCEPTION 'handle_on_hold' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.members_handle_policy() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS members_handle_policy_trg ON public.members;
CREATE TRIGGER members_handle_policy_trg BEFORE INSERT OR UPDATE OF handle ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.members_handle_policy();

-- ---- quota: changes in the rolling window, and when the next one opens ----
CREATE OR REPLACE FUNCTION public.profile__handle_quota(p_member UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH recent AS (
    SELECT changed_at FROM public.handle_history
     WHERE member_id = p_member AND changed_at > NOW() - INTERVAL '14 days'
     ORDER BY changed_at DESC LIMIT 2
  )
  SELECT jsonb_build_object(
    'limit', 2, 'windowDays', 14, 'holdDays', 14,
    'used', (SELECT COUNT(*) FROM recent),
    'remaining', GREATEST(0, 2 - (SELECT COUNT(*) FROM recent)),
    -- the oldest of the last two changes drops out of the window at +14 days
    'nextAt', CASE WHEN (SELECT COUNT(*) FROM recent) >= 2 THEN (SELECT MIN(changed_at) FROM recent) + INTERVAL '14 days' END,
    -- when the remaining count goes back up (the oldest change in the window expires)
    'refillAt', (SELECT MIN(changed_at) FROM recent) + INTERVAL '14 days');
$$;
REVOKE ALL ON FUNCTION public.profile__handle_quota(UUID) FROM PUBLIC, anon, authenticated;

-- ---- the one place a handle changes ----
CREATE OR REPLACE FUNCTION public.profile__change_handle(p_member UUID, p_handle TEXT)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  me public.members%ROWTYPE;
  v_new TEXT := lower(btrim(ltrim(btrim(COALESCE(p_handle, '')), '@')));
  q JSONB;
BEGIN
  SELECT * INTO me FROM public.members WHERE id = p_member FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_new = me.handle THEN RETURN; END IF;
  IF NOT public.profile__handle_ok(v_new) THEN RAISE EXCEPTION 'profile_handle_invalid' USING ERRCODE = 'P0001'; END IF;
  -- serialize every claim on this handle (two members racing for the same name)
  PERFORM pg_advisory_xact_lock(hashtextextended('aisubal.handle:' || v_new, 0));
  IF EXISTS (SELECT 1 FROM public.members m WHERE m.handle = v_new AND m.id <> me.id) THEN
    RAISE EXCEPTION 'handle_taken' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.handle_history h WHERE h.old_handle = v_new AND h.released_at > NOW() AND h.member_id <> me.id) THEN
    RAISE EXCEPTION 'handle_on_hold' USING ERRCODE = 'P0001';
  END IF;

  IF me.handle IS NULL THEN            -- first handle (onboarding): free, no history
    PERFORM set_config('app.handle_change', 'on', TRUE);
    UPDATE public.members SET handle = v_new, updated_at = NOW() WHERE id = me.id;
    PERFORM set_config('app.handle_change', '', TRUE);
    RETURN;
  END IF;

  q := public.profile__handle_quota(me.id);
  IF (q->>'remaining')::INT <= 0 THEN
    RAISE EXCEPTION 'handle_change_cooldown' USING ERRCODE = 'P0001', DETAIL = q->>'nextAt';
  END IF;

  -- switching back to a handle I'm holding ends that hold now (it is in use again)
  UPDATE public.handle_history SET released_at = GREATEST(changed_at, NOW())
   WHERE member_id = me.id AND old_handle = v_new AND released_at > NOW();
  INSERT INTO public.handle_history (member_id, old_handle, new_handle, changed_at, released_at)
  VALUES (me.id, me.handle, v_new, NOW(), NOW() + INTERVAL '14 days');

  PERFORM set_config('app.handle_change', 'on', TRUE);
  UPDATE public.members SET handle = v_new, updated_at = NOW() WHERE id = me.id;
  PERFORM set_config('app.handle_change', '', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.profile__change_handle(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.profile__self()
RETURNS public.members LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE me public.members%ROWTYPE;
BEGIN
  SELECT * INTO me FROM public.members WHERE auth_id = (SELECT auth.uid());
  IF NOT FOUND OR me.signup_completed_at IS NULL OR me.is_banned THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN me;
END;
$$;
REVOKE ALL ON FUNCTION public.profile__self() FROM PUBLIC, anon, authenticated;

-- ---- status for the inline editor: quota, my history, and a live check of a candidate ----
CREATE OR REPLACE FUNCTION public.profile_handle_status(p_handle TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  me public.members%ROWTYPE := public.profile__self();
  v TEXT := lower(btrim(ltrim(btrim(COALESCE(p_handle, '')), '@')));
  v_state TEXT;
  v_until TIMESTAMPTZ;
  q JSONB := public.profile__handle_quota(me.id);
BEGIN
  IF v <> '' THEN
    SELECT h.released_at INTO v_until FROM public.handle_history h
     WHERE h.old_handle = v AND h.released_at > NOW() ORDER BY h.changed_at DESC LIMIT 1;
    v_state := CASE
      WHEN v = me.handle THEN 'same'
      WHEN NOT public.profile__handle_ok(v) THEN 'invalid'
      WHEN EXISTS (SELECT 1 FROM public.members m WHERE m.handle = v AND m.id <> me.id) THEN 'taken'
      WHEN EXISTS (SELECT 1 FROM public.handle_history h WHERE h.old_handle = v AND h.released_at > NOW() AND h.member_id <> me.id) THEN 'on_hold'
      WHEN EXISTS (SELECT 1 FROM public.handle_history h WHERE h.old_handle = v AND h.released_at > NOW() AND h.member_id = me.id) THEN 'own_hold'
      ELSE 'available' END;
  END IF;
  RETURN jsonb_build_object(
    'current', me.handle,
    'firstIsFree', me.handle IS NULL,
    'quota', q,
    'check', CASE WHEN v = '' THEN NULL ELSE jsonb_build_object('handle', v, 'state', v_state,
      -- hold end is shown only for my own held handle (others just see 'on_hold')
      'heldUntil', CASE WHEN v_state = 'own_hold' THEN v_until END) END,
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('old', h.old_handle, 'new', h.new_handle,
        'changedAt', h.changed_at, 'releasedAt', h.released_at) ORDER BY h.changed_at DESC)
      FROM (SELECT * FROM public.handle_history WHERE member_id = me.id ORDER BY changed_at DESC LIMIT 10) h), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.profile_handle_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_handle_status(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.profile_change_handle(p_handle TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE me public.members%ROWTYPE := public.profile__self();
BEGIN
  PERFORM public.profile__change_handle(me.id, p_handle);
  RETURN public.profile_handle_status(NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.profile_change_handle(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_change_handle(TEXT) TO authenticated;

-- onboarding availability now respects holds too
CREATE OR REPLACE FUNCTION public.profile_handle_available(p_handle TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.profile__handle_ok(lower(btrim(p_handle)))
    AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.handle = lower(btrim(p_handle)) AND m.auth_id <> (SELECT auth.uid()))
    AND NOT EXISTS (SELECT 1 FROM public.handle_history h JOIN public.members m ON m.id = h.member_id
                     WHERE h.old_handle = lower(btrim(p_handle)) AND h.released_at > NOW() AND m.auth_id <> (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.profile_handle_available(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_handle_available(TEXT) TO authenticated;

-- /u/{handle} fallback: an old handle → its member, during the hold or while nobody has claimed it
CREATE OR REPLACE FUNCTION public.member_id_by_old_handle(p_handle TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT h.member_id FROM public.handle_history h
    JOIN public.members m ON m.id = h.member_id AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned
   WHERE h.old_handle = lower(btrim(p_handle))
     AND (h.released_at > NOW() OR NOT EXISTS (SELECT 1 FROM public.members x WHERE x.handle = h.old_handle))
   ORDER BY h.changed_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.member_id_by_old_handle(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_id_by_old_handle(TEXT) TO authenticated;

-- ---- profile_save: the handle goes through the policy (an unchanged handle is never re-validated) ----
CREATE OR REPLACE FUNCTION public.profile_save(p JSONB)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  uid UUID := (SELECT auth.uid());
  me public.members%ROWTYPE;
  pv public.member_private%ROWTYPE;
  v_handle TEXT := lower(btrim(COALESCE(p->>'handle', '')));
  v_name TEXT := btrim(regexp_replace(COALESCE(p->>'display_name', ''), '\s+', ' ', 'g'));
  v_bio TEXT := NULLIF(btrim(COALESCE(p->>'bio', '')), '');
  v_avatar TEXT := COALESCE(p->>'avatar', 'keep');
  v_show BOOLEAN := COALESCE((p->>'show_real_name')::BOOLEAN, FALSE);
  v_url TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO me FROM public.members WHERE auth_id = uid FOR UPDATE;
  IF NOT FOUND OR me.signup_completed_at IS NULL OR me.is_banned THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO pv FROM public.member_private WHERE member_id = me.id;
  IF char_length(v_name) < 2 OR char_length(v_name) > 24 OR v_name ~ '[@<>[:cntrl:]]' THEN
    RAISE EXCEPTION 'profile_name_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF v_bio IS NOT NULL AND char_length(v_bio) > 160 THEN RAISE EXCEPTION 'profile_bio_too_long' USING ERRCODE = 'P0001'; END IF;
  v_url := CASE
    WHEN v_avatar = 'keep' THEN me.avatar_url
    WHEN v_avatar = 'none' THEN NULL
    WHEN v_avatar = 'google' THEN pv.google_avatar_url
    WHEN v_avatar ~ ('^https://[a-z0-9.-]+/storage/v1/object/public/avatars/' || uid::text || '/[A-Za-z0-9._-]+$') THEN v_avatar
    ELSE NULL END;
  IF v_avatar NOT IN ('keep', 'none', 'google') AND v_url IS NULL THEN RAISE EXCEPTION 'profile_avatar_invalid' USING ERRCODE = 'P0001'; END IF;
  IF v_show AND COALESCE(pv.real_name, '') = '' THEN v_show := FALSE; END IF;

  IF v_handle IS DISTINCT FROM me.handle THEN
    PERFORM public.profile__change_handle(me.id, v_handle);   -- first set is free; later changes obey the policy
  END IF;

  UPDATE public.members SET display_name = v_name, bio = v_bio, avatar_url = v_url,
    show_real_name = v_show, public_real_name = CASE WHEN v_show THEN pv.real_name END,
    profile_completed_at = COALESCE(profile_completed_at, NOW()), updated_at = NOW()
  WHERE id = me.id RETURNING * INTO me;
  RETURN jsonb_build_object('id', me.id, 'handle', me.handle, 'display_name', me.display_name, 'avatar_url', me.avatar_url,
    'bio', me.bio, 'show_real_name', me.show_real_name);
END;
$$;
REVOKE ALL ON FUNCTION public.profile_save(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_save(JSONB) TO authenticated;
