-- AI쓰발 hardening (apply AFTER 0001_init). Do not edit 0001.
-- Fixes advisor: search_path, SECURITY DEFINER grants, auth.uid() initplans,
-- overlapping SELECT policies, unindexed FKs, members.email privacy.

-- =====================
-- 1) search_path on update_updated_at
-- =====================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =====================
-- 2) REVOKE trigger/internal SECURITY DEFINER; keep app RPCs
-- =====================

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
-- Trigger still runs as owner (postgres/supabase_admin)

REVOKE ALL ON FUNCTION public.on_member_signup_complete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.on_member_signup_complete() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.create_member_invite_codes(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_member_invite_codes(UUID) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM anon, authenticated;

-- App-callable RPCs: authenticated only (not anon)
REVOKE ALL ON FUNCTION public.redeem_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_invite(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_waitlist() FROM PUBLIC;
-- waitlist/login may call before membership completes; allow both anon+authenticated
-- only if session exists (function checks auth.uid()). Grant authenticated; also anon
-- for edge cases where JWT role is anon with a user claim mid-signup.
GRANT EXECUTE ON FUNCTION public.ensure_waitlist() TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_waitlist() FROM anon;

REVOKE ALL ON FUNCTION public.get_site_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_site_config() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_site_config() TO authenticated;

REVOKE ALL ON FUNCTION public.count_active_members() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_active_members() FROM anon;
GRANT EXECUTE ON FUNCTION public.count_active_members() TO authenticated;

REVOKE ALL ON FUNCTION public.current_member_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_member_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;

REVOKE ALL ON FUNCTION public.is_completed_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_completed_member() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_completed_member() TO authenticated;

-- =====================
-- 3) Email privacy + helper RPCs
-- =====================

-- Own full profile (includes email)
CREATE OR REPLACE FUNCTION public.get_my_member()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := (SELECT auth.uid());
  r public.members%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO r FROM public.members WHERE auth_id = uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(r);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_member() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_member() TO authenticated;

-- Invite code soft-validate (no service role)
CREATE OR REPLACE FUNCTION public.validate_invite_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := upper(trim(p_code));
  v_invite public.invite_codes%ROWTYPE;
  v_creator public.members%ROWTYPE;
BEGIN
  IF v_code IS NULL OR length(v_code) <> 8 THEN
    RETURN jsonb_build_object('ok', false, 'valid', false, 'error', '초대 코드는 8자리입니다.');
  END IF;

  SELECT * INTO v_invite FROM public.invite_codes WHERE code = v_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'valid', false, 'error', '유효하지 않은 초대 코드입니다.');
  END IF;
  IF v_invite.used_by_id IS NOT NULL OR v_invite.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'valid', false, 'error', '이미 사용된 초대 코드입니다.');
  END IF;

  SELECT * INTO v_creator FROM public.members WHERE id = v_invite.created_by_id;
  IF v_creator.signup_completed_at IS NULL OR v_creator.is_banned THEN
    RETURN jsonb_build_object('ok', false, 'valid', false, 'error', '아직 활성화되지 않은 초대 코드입니다.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'valid', true,
    'inviter_display_name', v_creator.display_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_invite_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_invite_code(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(TEXT) TO authenticated;

-- Admin list users WITH email (SECURITY DEFINER; checks is_admin)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := (SELECT auth.uid());
  result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE auth_id = uid AND is_admin AND signup_completed_at IS NOT NULL AND NOT is_banned
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      m.id,
      m.display_name AS name,
      m.email,
      (SELECT COUNT(*)::int FROM public.posts p WHERE p.author_id = m.id) AS posts,
      m.is_admin AS "isAdmin",
      m.is_banned AS "isBanned",
      m.created_at
    FROM public.members m
    WHERE m.signup_completed_at IS NOT NULL
  ) x;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Admin invite tree WITH email
CREATE OR REPLACE FUNCTION public.admin_invite_tree()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := (SELECT auth.uid());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE auth_id = uid AND is_admin AND signup_completed_at IS NOT NULL AND NOT is_banned
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN (
    WITH RECURSIVE tree AS (
      SELECT
        m.id,
        m.display_name,
        m.email,
        m.signup_completed_at AS joined_at,
        m.is_banned,
        m.invited_by_id,
        0 AS depth
      FROM public.members m
      WHERE m.signup_completed_at IS NOT NULL
        AND m.invited_by_id IS NULL

      UNION ALL

      SELECT
        c.id,
        c.display_name,
        c.email,
        c.signup_completed_at,
        c.is_banned,
        c.invited_by_id,
        t.depth + 1
      FROM public.members c
      JOIN tree t ON c.invited_by_id = t.id
      WHERE c.signup_completed_at IS NOT NULL
    ),
    counted AS (
      SELECT
        t.*,
        (SELECT COUNT(*)::int FROM public.members x WHERE x.invited_by_id = t.id AND x.signup_completed_at IS NOT NULL) AS invited_count
      FROM tree t
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'displayName', display_name,
          'email', email,
          'joinedAt', joined_at,
          'isBanned', is_banned,
          'invitedCount', invited_count,
          'invitedById', invited_by_id,
          'depth', depth
        )
        ORDER BY depth, joined_at
      ),
      '[]'::jsonb
    )
    FROM counted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_invite_tree() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_invite_tree() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_invite_tree() TO authenticated;

-- Column privileges: hide email from authenticated table SELECT
REVOKE ALL ON TABLE public.members FROM PUBLIC;
GRANT SELECT (
  id, auth_id, display_name, bio, avatar_url,
  nickname, nickname_bio, nickname_avatar_url, nickname_created_at,
  is_admin, is_banned, banned_at, banned_reason,
  invited_by_id, invite_code_used, signup_completed_at,
  created_at, updated_at
) ON public.members TO authenticated;

GRANT UPDATE (
  display_name, bio, avatar_url,
  nickname, nickname_bio, nickname_avatar_url, nickname_created_at,
  updated_at
) ON public.members TO authenticated;

-- Admins still need ban updates via authenticated role
GRANT UPDATE (
  is_banned, banned_at, banned_reason, is_admin, updated_at
) ON public.members TO authenticated;

-- Public view without email (security invoker → RLS applies)
CREATE OR REPLACE VIEW public.members_public
WITH (security_invoker = true)
AS
SELECT
  id,
  display_name,
  bio,
  avatar_url,
  nickname,
  nickname_bio,
  nickname_avatar_url,
  nickname_created_at,
  is_admin,
  is_banned,
  banned_at,
  invited_by_id,
  signup_completed_at,
  created_at,
  updated_at
FROM public.members;

GRANT SELECT ON public.members_public TO authenticated;

-- =====================
-- 4) Fix auth.uid()/jwt() initplans in flagged policies
-- =====================

DROP POLICY IF EXISTS members_select_completed ON public.members;
CREATE POLICY members_select_completed ON public.members
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    OR auth_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS members_update_own ON public.members;
DROP POLICY IF EXISTS members_admin_update ON public.members;
CREATE POLICY members_update_own ON public.members
  FOR UPDATE TO authenticated
  USING (
    auth_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.auth_id = (SELECT auth.uid()) AND m.is_admin
    )
  )
  WITH CHECK (
    auth_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.auth_id = (SELECT auth.uid()) AND m.is_admin
    )
  );

DROP POLICY IF EXISTS waitlist_select_own ON public.waitlist;
CREATE POLICY waitlist_select_own ON public.waitlist
  FOR SELECT TO authenticated
  USING (auth_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS posts_select ON public.posts;
CREATE POLICY posts_select ON public.posts
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    AND (
      is_hidden = FALSE
      OR author_id = public.current_member_id()
      OR EXISTS (
        SELECT 1 FROM public.members
        WHERE auth_id = (SELECT auth.uid()) AND is_admin
      )
    )
  );

DROP POLICY IF EXISTS posts_update ON public.posts;
CREATE POLICY posts_update ON public.posts
  FOR UPDATE TO authenticated
  USING (
    author_id = public.current_member_id()
    OR EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

DROP POLICY IF EXISTS posts_admin_delete ON public.posts;
CREATE POLICY posts_admin_delete ON public.posts
  FOR DELETE TO authenticated
  USING (
    author_id = public.current_member_id()
    OR EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

DROP POLICY IF EXISTS reports_select_own ON public.reports;
CREATE POLICY reports_select_own ON public.reports
  FOR SELECT TO authenticated
  USING (
    reporter_id = public.current_member_id()
    OR EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

DROP POLICY IF EXISTS reports_admin ON public.reports;
CREATE POLICY reports_admin ON public.reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

DROP POLICY IF EXISTS site_settings_admin ON public.site_settings;
CREATE POLICY site_settings_admin ON public.site_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

-- =====================
-- 5) Merge overlapping permissive SELECT policies
-- =====================

-- site_config: one SELECT + admin write
DROP POLICY IF EXISTS site_config_select ON public.site_config;
DROP POLICY IF EXISTS site_config_admin ON public.site_config;

CREATE POLICY site_config_select ON public.site_config
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    OR EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

CREATE POLICY site_config_admin_insert ON public.site_config
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

CREATE POLICY site_config_admin_update ON public.site_config
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

CREATE POLICY site_config_admin_delete ON public.site_config
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

-- archive_collections
DROP POLICY IF EXISTS collections_owner ON public.archive_collections;
DROP POLICY IF EXISTS collections_shared_select ON public.archive_collections;

CREATE POLICY collections_select ON public.archive_collections
  FOR SELECT TO authenticated
  USING (
    owner_id = public.current_member_id()
    OR (public.is_completed_member() AND is_shared = TRUE)
  );

CREATE POLICY collections_insert ON public.archive_collections
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_member_id());

CREATE POLICY collections_update ON public.archive_collections
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_member_id())
  WITH CHECK (owner_id = public.current_member_id());

CREATE POLICY collections_delete ON public.archive_collections
  FOR DELETE TO authenticated
  USING (owner_id = public.current_member_id());

-- assets
DROP POLICY IF EXISTS assets_select ON public.assets;
DROP POLICY IF EXISTS assets_write ON public.assets;

CREATE POLICY assets_select ON public.assets
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = assets.post_id
        AND (
          p.is_hidden = FALSE
          OR p.author_id = public.current_member_id()
          OR EXISTS (
            SELECT 1 FROM public.members
            WHERE auth_id = (SELECT auth.uid()) AND is_admin
          )
        )
    )
  );

CREATE POLICY assets_insert ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = assets.post_id AND p.author_id = public.current_member_id()
    )
  );

CREATE POLICY assets_update ON public.assets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = assets.post_id AND p.author_id = public.current_member_id()
    )
  );

CREATE POLICY assets_delete ON public.assets
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = assets.post_id AND p.author_id = public.current_member_id()
    )
  );

-- brain_archive_items
DROP POLICY IF EXISTS brain_items_owner ON public.brain_archive_items;
DROP POLICY IF EXISTS brain_items_shared_select ON public.brain_archive_items;

CREATE POLICY brain_items_select ON public.brain_archive_items
  FOR SELECT TO authenticated
  USING (
    owner_id = public.current_member_id()
    OR (
      public.is_completed_member()
      AND EXISTS (
        SELECT 1
        FROM public.brain_archive_collection_items ci
        JOIN public.archive_collections c ON c.id = ci.collection_id
        WHERE ci.item_id = brain_archive_items.id AND c.is_shared = TRUE
      )
    )
  );

CREATE POLICY brain_items_insert ON public.brain_archive_items
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_member_id());

CREATE POLICY brain_items_update ON public.brain_archive_items
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_member_id())
  WITH CHECK (owner_id = public.current_member_id());

CREATE POLICY brain_items_delete ON public.brain_archive_items
  FOR DELETE TO authenticated
  USING (owner_id = public.current_member_id());

-- brain_archive_collection_items
DROP POLICY IF EXISTS brain_ci_owner ON public.brain_archive_collection_items;
DROP POLICY IF EXISTS brain_ci_shared_select ON public.brain_archive_collection_items;

CREATE POLICY brain_ci_select ON public.brain_archive_collection_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.archive_collections c
      WHERE c.id = collection_id
        AND (
          c.owner_id = public.current_member_id()
          OR (public.is_completed_member() AND c.is_shared = TRUE)
        )
    )
  );

CREATE POLICY brain_ci_insert ON public.brain_archive_collection_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.archive_collections c
      WHERE c.id = collection_id AND c.owner_id = public.current_member_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.brain_archive_items i
      WHERE i.id = item_id AND i.owner_id = public.current_member_id()
    )
  );

CREATE POLICY brain_ci_delete ON public.brain_archive_collection_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.archive_collections c
      WHERE c.id = collection_id AND c.owner_id = public.current_member_id()
    )
  );

DROP POLICY IF EXISTS toolbox_entries_update ON public.toolbox_entries;
CREATE POLICY toolbox_entries_update ON public.toolbox_entries
  FOR UPDATE TO authenticated
  USING (
    created_by_id = public.current_member_id()
    OR EXISTS (
      SELECT 1 FROM public.members
      WHERE auth_id = (SELECT auth.uid()) AND is_admin
    )
  );

-- =====================
-- 6) Indexes for unindexed FKs
-- =====================

CREATE INDEX IF NOT EXISTS idx_archive_items_folder_id ON public.archive_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_meetups_recap_post_id ON public.meetups(recap_post_id);
CREATE INDEX IF NOT EXISTS idx_product_comments_member_id ON public.product_comments(member_id);
CREATE INDEX IF NOT EXISTS idx_product_upvotes_member_id ON public.product_upvotes(member_id);
CREATE INDEX IF NOT EXISTS idx_products_launch_post_id ON public.products(launch_post_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_resolved_by_id ON public.reports(resolved_by_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_compat_member_id ON public.toolbox_compat_votes(member_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_entries_created_by_id ON public.toolbox_entries(created_by_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_reviews_member_id ON public.toolbox_reviews(member_id);
