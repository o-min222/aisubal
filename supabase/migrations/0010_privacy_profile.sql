-- 0010 Privacy-first identity.
-- * The member's self-made profile (display name + unique @handle + avatar + bio)
--   is the identity everywhere. Google name / email / photo move to member_private
--   (owner + admins only) and are used only as a private prefill.
-- * Real name is opt-in (show_real_name → public_real_name).
-- * Fixes a pre-existing leak: 0002's column-level grants never applied because
--   Supabase's explicit table grants to anon/authenticated remained, so members
--   could read other members' email. Table grants are reset to explicit columns.
-- * members writes go through RPCs only; a guard trigger blocks client-side
--   changes to privileged columns (is_admin, signup_completed_at, bans, ...).
-- * SNS links with per-link visibility, avatar storage bucket, 모임 attendees
--   visible only to managers + confirmed attendees (handles only), and agents
--   cannot @mention a member by real name.

-- ---- helpers ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app__is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.members m WHERE m.auth_id = (SELECT auth.uid())
    AND m.is_admin AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned);
$$;
REVOKE ALL ON FUNCTION public.app__is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app__is_admin() TO authenticated;

-- ---- private identity ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_private (
  member_id UUID PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  real_name TEXT,
  email TEXT,
  google_avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.member_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_private FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_private TO authenticated;
DROP POLICY IF EXISTS member_private_select ON public.member_private;
CREATE POLICY member_private_select ON public.member_private FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR public.app__is_admin());

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS handle TEXT,
  ADD COLUMN IF NOT EXISTS show_real_name BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_real_name TEXT,
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;
ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_handle_format;
ALTER TABLE public.members ADD CONSTRAINT members_handle_format CHECK (handle IS NULL OR handle ~ '^[a-z0-9_]{3,20}$');
CREATE UNIQUE INDEX IF NOT EXISTS members_handle_key ON public.members (handle) WHERE handle IS NOT NULL;
ALTER TABLE public.members ALTER COLUMN email DROP NOT NULL;

-- move Google data out of the public row (existing members re-onboard with a self-made profile)
INSERT INTO public.member_private (member_id, real_name, email, google_avatar_url)
SELECT m.id, m.display_name, m.email, m.avatar_url FROM public.members m
ON CONFLICT (member_id) DO NOTHING;
UPDATE public.members SET
  display_name = '멤버' || right(replace(id::text, '-', ''), 4),
  avatar_url = NULL,
  email = NULL,
  public_real_name = NULL,
  show_real_name = FALSE
WHERE profile_completed_at IS NULL;
-- the waitlist keeps only what the waiting person sees about themselves
UPDATE public.waitlist SET display_name = '대기 중인 멤버' WHERE TRUE;
DROP INDEX IF EXISTS public.idx_members_email;

-- ---- grants: explicit columns only (email is never selectable) ---------------
DROP POLICY IF EXISTS members_update_own ON public.members;   -- recursive + too broad; writes are RPC-only now
REVOKE ALL ON public.members FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, auth_id, display_name, handle, bio, avatar_url, show_real_name, public_real_name, profile_completed_at,
  nickname, nickname_bio, nickname_avatar_url, nickname_created_at,
  is_admin, is_banned, banned_at, banned_reason,
  invited_by_id, invite_code_used, signup_completed_at, created_at, updated_at
) ON public.members TO authenticated;
REVOKE ALL ON public.members_public FROM anon;

-- Guard: even if a write grant is ever re-added, clients can't touch privileged columns.
CREATE OR REPLACE FUNCTION public.members_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'members_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.auth_id IS DISTINCT FROM OLD.auth_id
       OR NEW.email IS DISTINCT FROM OLD.email OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.is_banned IS DISTINCT FROM OLD.is_banned OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
       OR NEW.banned_reason IS DISTINCT FROM OLD.banned_reason OR NEW.invited_by_id IS DISTINCT FROM OLD.invited_by_id
       OR NEW.invite_code_used IS DISTINCT FROM OLD.invite_code_used
       OR NEW.signup_completed_at IS DISTINCT FROM OLD.signup_completed_at
       OR NEW.public_real_name IS DISTINCT FROM OLD.public_real_name
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'members_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.members_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS members_guard_trg ON public.members;
CREATE TRIGGER members_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.members_guard();

-- ---- signup paths: Google data → member_private only -----------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_name TEXT; v_avatar TEXT; v_id UUID;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  v_avatar := NEW.raw_user_meta_data->>'avatar_url';
  INSERT INTO public.waitlist (auth_id, email, display_name, avatar_url)
  VALUES (NEW.id, NEW.email, '대기 중인 멤버', NULL)
  ON CONFLICT (auth_id) DO NOTHING;
  INSERT INTO public.members (auth_id, email, display_name, avatar_url, signup_completed_at)
  VALUES (NEW.id, NULL, '새 멤버', NULL, NULL)
  ON CONFLICT (auth_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.member_private (member_id, real_name, email, google_avatar_url)
    VALUES (v_id, v_name, NEW.email, v_avatar) ON CONFLICT (member_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_waitlist()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE uid UUID := auth.uid(); u RECORD; v_id UUID;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT id, email, raw_user_meta_data INTO u FROM auth.users WHERE id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;
  INSERT INTO public.waitlist (auth_id, email, display_name, avatar_url)
  VALUES (uid, u.email, '대기 중인 멤버', NULL) ON CONFLICT (auth_id) DO NOTHING;
  INSERT INTO public.members (auth_id, email, display_name, avatar_url, signup_completed_at)
  VALUES (uid, NULL, '새 멤버', NULL, NULL) ON CONFLICT (auth_id) DO NOTHING;
  SELECT id INTO v_id FROM public.members WHERE auth_id = uid;
  INSERT INTO public.member_private (member_id, real_name, email, google_avatar_url)
  VALUES (v_id, COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), u.email, u.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (member_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_waitlist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_waitlist() TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_invite(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  uid UUID := auth.uid();
  v_code TEXT := upper(trim(p_code));
  v_member public.members%ROWTYPE;
  v_invite public.invite_codes%ROWTYPE;
  v_creator public.members%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.'); END IF;
  IF v_code IS NULL OR length(v_code) <> 8 THEN RETURN jsonb_build_object('ok', false, 'error', '유효하지 않은 초대 코드입니다.'); END IF;
  PERFORM public.ensure_waitlist();
  SELECT * INTO v_member FROM public.members WHERE auth_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', '멤버 레코드를 찾을 수 없습니다.'); END IF;
  IF v_member.signup_completed_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', '이미 가입이 완료되었습니다.'); END IF;
  SELECT * INTO v_invite FROM public.invite_codes WHERE code = v_code FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', '존재하지 않는 초대 코드입니다.'); END IF;
  IF v_invite.used_by_id IS NOT NULL OR v_invite.used_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', '이미 사용된 초대 코드입니다.'); END IF;
  SELECT * INTO v_creator FROM public.members WHERE id = v_invite.created_by_id;
  IF v_creator.signup_completed_at IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', '아직 활성화되지 않은 초대 코드입니다.'); END IF;
  -- no Google name/photo copied into the public row: the member builds a profile next (/onboarding)
  UPDATE public.members SET invited_by_id = v_invite.created_by_id, invite_code_used = v_code,
    signup_completed_at = NOW(), updated_at = NOW()
  WHERE id = v_member.id RETURNING * INTO v_member;
  UPDATE public.invite_codes SET used_by_id = v_member.id, used_at = NOW() WHERE id = v_invite.id;
  DELETE FROM public.waitlist WHERE auth_id = uid;
  RETURN jsonb_build_object('ok', true, 'member', jsonb_build_object('id', v_member.id, 'needs_profile', v_member.profile_completed_at IS NULL));
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite(TEXT) TO authenticated;

-- own row + private fields (prefill only)
CREATE OR REPLACE FUNCTION public.get_my_member()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE uid UUID := (SELECT auth.uid()); r public.members%ROWTYPE; p public.member_private%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.members WHERE auth_id = uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.member_private WHERE member_id = r.id;
  RETURN to_jsonb(r) || jsonb_build_object('email', COALESCE(p.email, ''), 'private_real_name', p.real_name,
    'private_google_avatar_url', p.google_avatar_url);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_member() TO authenticated;

-- ---- profile save ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile__handle_ok(p TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT p ~ '^[a-z0-9_]{3,20}$' AND p NOT IN ('admin', 'root', 'system', 'aisubal', 'support', 'help', 'null', 'undefined',
    'me', 'settings', 'moim', 'groups', 'network', 'agora', 'anon', 'feed', 'tools', 'api', 'mod', 'staff', 'official');
$$;

CREATE OR REPLACE FUNCTION public.profile_handle_available(p_handle TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.profile__handle_ok(lower(btrim(p_handle)))
    AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.handle = lower(btrim(p_handle)) AND m.auth_id <> (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.profile_handle_available(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_handle_available(TEXT) TO authenticated;

-- p: { handle, display_name, bio, avatar: 'keep'|'none'|'google'|<storage url>, show_real_name }
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
  IF NOT public.profile__handle_ok(v_handle) THEN RAISE EXCEPTION 'profile_handle_invalid' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.members m WHERE m.handle = v_handle AND m.id <> me.id) THEN
    RAISE EXCEPTION 'profile_handle_taken' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 24 OR v_name ~ '[@<>[:cntrl:]]' THEN
    RAISE EXCEPTION 'profile_name_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF v_bio IS NOT NULL AND char_length(v_bio) > 160 THEN RAISE EXCEPTION 'profile_bio_too_long' USING ERRCODE = 'P0001'; END IF;
  v_url := CASE
    WHEN v_avatar = 'keep' THEN me.avatar_url
    WHEN v_avatar = 'none' THEN NULL
    WHEN v_avatar = 'google' THEN pv.google_avatar_url        -- explicit opt-in to reuse the Google photo
    WHEN v_avatar ~ ('^https://[a-z0-9.-]+/storage/v1/object/public/avatars/' || uid::text || '/[A-Za-z0-9._-]+$') THEN v_avatar
    ELSE NULL END;
  IF v_avatar NOT IN ('keep', 'none', 'google') AND v_url IS NULL THEN RAISE EXCEPTION 'profile_avatar_invalid' USING ERRCODE = 'P0001'; END IF;
  IF v_show AND COALESCE(pv.real_name, '') = '' THEN v_show := FALSE; END IF;

  UPDATE public.members SET handle = v_handle, display_name = v_name, bio = v_bio, avatar_url = v_url,
    show_real_name = v_show, public_real_name = CASE WHEN v_show THEN pv.real_name END,
    profile_completed_at = COALESCE(profile_completed_at, NOW()), updated_at = NOW()
  WHERE id = me.id RETURNING * INTO me;
  RETURN jsonb_build_object('id', me.id, 'handle', me.handle, 'display_name', me.display_name, 'avatar_url', me.avatar_url,
    'bio', me.bio, 'show_real_name', me.show_real_name);
END;
$$;
REVOKE ALL ON FUNCTION public.profile_save(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_save(JSONB) TO authenticated;

-- secondary 별명 persona (pre-existing feature) — now saved through an RPC as well
CREATE OR REPLACE FUNCTION public.profile_save_nickname(p_nickname TEXT, p_bio TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid UUID := (SELECT auth.uid()); me public.members%ROWTYPE; v TEXT := btrim(COALESCE(p_nickname, ''));
BEGIN
  SELECT * INTO me FROM public.members WHERE auth_id = uid FOR UPDATE;
  IF NOT FOUND OR me.signup_completed_at IS NULL OR me.is_banned THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v !~ '^[a-zA-Z0-9가-힣_]{2,24}$' THEN RAISE EXCEPTION 'profile_name_invalid' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.members m WHERE m.nickname = v AND m.id <> me.id) THEN RAISE EXCEPTION 'profile_nickname_taken' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.members SET nickname = v, nickname_bio = NULLIF(left(btrim(COALESCE(p_bio, '')), 160), ''),
    nickname_created_at = COALESCE(nickname_created_at, NOW()), updated_at = NOW() WHERE id = me.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.profile_save_nickname(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_save_nickname(TEXT, TEXT) TO authenticated;

-- ---- admin (the only place real name + email are visible) -------------------
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.app__is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at), '[]'::jsonb) FROM (
    SELECT m.id, m.display_name AS name, m.handle, pv.real_name AS "realName", pv.email,
      (SELECT COUNT(*)::int FROM public.posts p WHERE p.author_id = m.id) AS posts,
      m.is_admin AS "isAdmin", m.is_banned AS "isBanned", m.created_at
    FROM public.members m LEFT JOIN public.member_private pv ON pv.member_id = m.id
    WHERE m.signup_completed_at IS NOT NULL) x);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_invite_tree()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.app__is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN (
    WITH RECURSIVE tree AS (
      SELECT m.id, m.display_name, m.handle, m.signup_completed_at AS joined_at, m.is_banned, m.invited_by_id, 0 AS depth
      FROM public.members m WHERE m.signup_completed_at IS NOT NULL AND m.invited_by_id IS NULL
      UNION ALL
      SELECT c.id, c.display_name, c.handle, c.signup_completed_at, c.is_banned, c.invited_by_id, t.depth + 1
      FROM public.members c JOIN tree t ON c.invited_by_id = t.id WHERE c.signup_completed_at IS NOT NULL
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'displayName', t.display_name, 'handle', t.handle,
      'realName', pv.real_name, 'email', pv.email, 'joinedAt', t.joined_at, 'isBanned', t.is_banned,
      'invitedCount', (SELECT COUNT(*)::int FROM public.members x WHERE x.invited_by_id = t.id AND x.signup_completed_at IS NOT NULL),
      'invitedById', t.invited_by_id, 'depth', t.depth) ORDER BY t.depth, t.joined_at), '[]'::jsonb)
    FROM tree t LEFT JOIN public.member_private pv ON pv.member_id = t.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ban(p_member UUID, p_banned BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r public.members%ROWTYPE;
BEGIN
  IF NOT public.app__is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE public.members SET is_banned = p_banned, banned_reason = CASE WHEN p_banned THEN NULLIF(left(btrim(COALESCE(p_reason, '')), 300), '') END,
    banned_at = CASE WHEN p_banned THEN NOW() END, updated_at = NOW()
  WHERE id = p_member RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object('id', r.id, 'is_banned', r.is_banned, 'banned_reason', r.banned_reason, 'banned_at', r.banned_at);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_ban(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(UUID, BOOLEAN, TEXT) TO authenticated;

-- ---- public JSON shapes carry the handle --------------------------------------
CREATE OR REPLACE FUNCTION public.api__author_json(p_member_id UUID, p_posted_as TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN p_posted_as = 'nickname' AND m.nickname IS NOT NULL THEN
      jsonb_build_object('kind', 'nickname', 'id', 'nick_' || left(replace(m.id::text, '-', ''), 16),
                         'name', m.nickname, 'avatar_url', m.nickname_avatar_url)
    ELSE jsonb_build_object('kind', 'real', 'id', m.id, 'name', m.display_name, 'handle', m.handle, 'avatar_url', m.avatar_url)
  END
  FROM public.members m WHERE m.id = p_member_id;
$$;

CREATE OR REPLACE FUNCTION public.social__person_json(p_member UUID, p_viewer UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object('id', m.id, 'name', m.display_name, 'handle', m.handle, 'avatar_url', m.avatar_url,
    'bio', left(COALESCE(m.bio, ''), 140), 'relation', public.social__relation(p_viewer, m.id))
  FROM public.members m WHERE m.id = p_member;
$$;
REVOKE ALL ON FUNCTION public.social__person_json(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.graph__node_json(p_member UUID, p_viewer UUID, p_depth INTEGER)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'name', m.display_name, 'handle', m.handle, 'avatar_url', m.avatar_url, 'bio', left(COALESCE(m.bio, ''), 140),
    'parent_id', m.invited_by_id, 'depth', p_depth, 'joined_at', m.signup_completed_at,
    'child_count', (SELECT count(*) FROM public.members c WHERE c.invited_by_id = m.id
                    AND c.signup_completed_at IS NOT NULL AND NOT c.is_banned),
    'relation', public.social__relation(p_viewer, m.id))
  FROM public.members m WHERE m.id = p_member;
$$;
REVOKE ALL ON FUNCTION public.graph__node_json(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- ---- 모임 attendees: handles only, managers + confirmed attendees only -------------
CREATE OR REPLACE FUNCTION public.moim_get(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); m public.meetups%ROWTYPE; v JSONB; v_manage BOOLEAN; v_private BOOLEAN;
BEGIN
  SELECT * INTO m FROM public.meetups WHERE id = p_id;
  IF NOT FOUND OR (m.group_id IS NOT NULL AND NOT public.group__visible(m.group_id)) THEN
    RAISE EXCEPTION 'moim_not_found' USING ERRCODE = 'P0001';
  END IF;
  v_manage := public.moim__can_manage(m.id, v_me);
  v_private := public.moim__can_see_private(m.id, v_me);
  v := public.moim__json(m, v_me);
  v := v || jsonb_build_object(
    'private', CASE WHEN v_private THEN (
        SELECT jsonb_build_object('venue_address', p.venue_address, 'map_url', p.map_url, 'meeting_url', p.meeting_url)
        FROM public.meetup_private p WHERE p.meetup_id = m.id) END,
    'attendees', CASE WHEN v_private THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('kind', 'real', 'id', mm.id, 'member_id', mm.id,
                 'name', COALESCE('@' || mm.handle, '멤버'), 'handle', mm.handle, 'avatar_url', mm.avatar_url)
               ORDER BY r.decided_at NULLS LAST, r.created_at)
        FROM public.meetup_rsvps r JOIN public.members mm ON mm.id = r.member_id
        WHERE r.meetup_id = m.id AND r.status = 'confirmed'), '[]'::jsonb) END,
    'announcements', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'created_at', a.created_at) ORDER BY a.created_at DESC)
        FROM public.meetup_announcements a WHERE a.meetup_id = m.id), '[]'::jsonb),
    'applicants', CASE WHEN v_manage THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'member_id', r.member_id, 'status', r.status, 'answers', r.answers, 'note', r.note,
          'created_at', r.created_at, 'waitlisted_at', r.waitlisted_at,
          'author', jsonb_build_object('kind', 'real', 'id', mm.id, 'name', COALESCE('@' || mm.handle, '멤버'),
                     'handle', mm.handle, 'avatar_url', mm.avatar_url))
          ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'waitlisted' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END,
                   r.waitlisted_at NULLS LAST, r.created_at)
        FROM public.meetup_rsvps r JOIN public.members mm ON mm.id = r.member_id WHERE r.meetup_id = m.id), '[]'::jsonb) END
  );
  RETURN v;
END;
$$;

-- ---- SNS links ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('x', 'instagram', 'threads', 'linkedin', 'github', 'youtube', 'tiktok', 'facebook', 'bluesky', 'huggingface', 'blog', 'website')),
  url TEXT NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 300),
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('members', 'friends', 'private')),
  position SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_member_links_member ON public.member_links(member_id, position);
ALTER TABLE public.member_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_links TO authenticated;
DROP POLICY IF EXISTS member_links_select_own ON public.member_links;
CREATE POLICY member_links_select_own ON public.member_links FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

CREATE OR REPLACE FUNCTION public.links__host_ok(p_kind TEXT, p_url TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT p_url ~ '^https://[^\s/@]+\.[^\s/@]+(/[^\s]*)?$' AND CASE p_kind
    WHEN 'x' THEN p_url ~* '^https://(www\.)?(x|twitter)\.com/'
    WHEN 'instagram' THEN p_url ~* '^https://(www\.)?instagram\.com/'
    WHEN 'threads' THEN p_url ~* '^https://(www\.)?threads\.(net|com)/'
    WHEN 'linkedin' THEN p_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/'
    WHEN 'github' THEN p_url ~* '^https://(www\.)?github\.com/'
    WHEN 'youtube' THEN p_url ~* '^https://((www|m)\.)?(youtube\.com|youtu\.be)/'
    WHEN 'tiktok' THEN p_url ~* '^https://(www\.)?tiktok\.com/'
    WHEN 'facebook' THEN p_url ~* '^https://((www|m)\.)?facebook\.com/'
    WHEN 'bluesky' THEN p_url ~* '^https://(www\.)?bsky\.app/'
    WHEN 'huggingface' THEN p_url ~* '^https://(www\.)?huggingface\.co/'
    ELSE TRUE END;
$$;

-- replace-all save (≤ 12 links)
CREATE OR REPLACE FUNCTION public.links_save(p_links JSONB)
RETURNS INTEGER LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); x JSONB; i INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_links) <> 'array' OR jsonb_array_length(p_links) > 12 THEN RAISE EXCEPTION 'links_invalid' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.member_links WHERE member_id = v_me;
  FOR x IN SELECT * FROM jsonb_array_elements(p_links) LOOP
    IF NOT public.links__host_ok(x->>'kind', btrim(x->>'url')) THEN
      RAISE EXCEPTION 'links_invalid_url:%', COALESCE(x->>'kind', '?') USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.member_links (member_id, kind, url, visibility, position)
    VALUES (v_me, x->>'kind', btrim(x->>'url'), COALESCE(x->>'visibility', 'members'), i);
    i := i + 1;
  END LOOP;
  RETURN i;
END;
$$;
REVOKE ALL ON FUNCTION public.links_save(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.links_save(JSONB) TO authenticated;

-- links visible to the viewer: owner sees all; members see 'members'; friends also see 'friends'
CREATE OR REPLACE FUNCTION public.profile_links(p_member UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', l.kind, 'url', l.url, 'visibility', l.visibility) ORDER BY l.position), '[]'::jsonb)
  FROM public.member_links l
  WHERE l.member_id = p_member AND (
    l.member_id = public.app__me()
    OR l.visibility = 'members'
    OR (l.visibility = 'friends' AND public.social__friend_state(public.app__me(), p_member) = 'friends'));
$$;
REVOKE ALL ON FUNCTION public.profile_links(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_links(UUID) TO authenticated;

-- ---- avatars bucket (public read; each member writes only their own folder) ------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = TRUE, file_size_limit = 2097152, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ---- agents cannot @mention a member by real name ------------------------------
CREATE OR REPLACE FUNCTION public.pii__mentions_real_name(p_text TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p_text IS NOT NULL AND position('@' IN p_text) > 0 AND EXISTS (
    SELECT 1 FROM public.member_private pv
    WHERE char_length(btrim(COALESCE(pv.real_name, ''))) >= 2
      AND (position('@' || btrim(pv.real_name) IN p_text) > 0 OR position('@ ' || btrim(pv.real_name) IN p_text) > 0));
$$;
REVOKE ALL ON FUNCTION public.pii__mentions_real_name(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_mention_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_text TEXT;
BEGIN
  IF TG_TABLE_NAME = 'agora_posts' THEN v_text := NEW.body; ELSE v_text := NEW.content; END IF;
  IF public.pii__mentions_real_name(v_text) THEN
    RAISE EXCEPTION 'agent_mention_real_name' USING ERRCODE = 'P0001',
      HINT = '멤버는 @핸들로만 언급할 수 있어요.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_mention_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agora_posts_mention_guard ON public.agora_posts;
CREATE TRIGGER agora_posts_mention_guard BEFORE INSERT OR UPDATE OF body ON public.agora_posts
  FOR EACH ROW EXECUTE FUNCTION public.agent_mention_guard();
DROP TRIGGER IF EXISTS posts_agent_mention_guard ON public.posts;
CREATE TRIGGER posts_agent_mention_guard BEFORE INSERT OR UPDATE OF content ON public.posts
  FOR EACH ROW WHEN (NEW.author_kind = 'agent') EXECUTE FUNCTION public.agent_mention_guard();
