-- 0008: follow (one-way, instant), friendship (request → accept/decline), invite network graph.
-- Social edges are between real identities only (never nickname personas).
-- Writes go through SECURITY DEFINER RPCs; agents/MCP get no social write tools.

-- ---------------------------------------------------------------------
-- 1. Follows
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON public.follows(followee_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.follows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.follows TO authenticated;
DROP POLICY IF EXISTS follows_select ON public.follows;
CREATE POLICY follows_select ON public.follows FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()));

-- ---------------------------------------------------------------------
-- 2. Friendships (separate from follows; mutual follow = 맞팔, not friends)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  pair_low UUID GENERATED ALWAYS AS (LEAST(requester_id, addressee_id)) STORED,
  pair_high UUID GENERATED ALWAYS AS (GREATEST(requester_id, addressee_id)) STORED,
  CHECK (requester_id <> addressee_id),
  UNIQUE (pair_low, pair_high)
);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friendships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.friendships TO authenticated;
DROP POLICY IF EXISTS friendships_select ON public.friendships;
-- Accepted friendships are visible to members (friend lists); pending/declined only to the two people.
CREATE POLICY friendships_select ON public.friendships FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()) AND (
    status = 'accepted'
    OR requester_id = (SELECT public.current_member_id())
    OR addressee_id = (SELECT public.current_member_id())
  ));

CREATE OR REPLACE FUNCTION public.social__target(p_member UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned) THEN
    RAISE EXCEPTION 'social_member_not_found' USING ERRCODE = 'P0001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.social__target(UUID) FROM PUBLIC, anon, authenticated;

-- friend state from viewer's perspective: friends | pending_out | pending_in | none
CREATE OR REPLACE FUNCTION public.social__friend_state(p_viewer UUID, p_other UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN f.status = 'accepted' THEN 'friends'
      WHEN f.status = 'pending' AND f.requester_id = p_viewer THEN 'pending_out'
      WHEN f.status = 'pending' THEN 'pending_in'
      ELSE 'none' END
    FROM public.friendships f
    WHERE f.pair_low = LEAST(p_viewer, p_other) AND f.pair_high = GREATEST(p_viewer, p_other)
  ), 'none');
$$;
REVOKE ALL ON FUNCTION public.social__friend_state(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.social__relation(p_viewer UUID, p_other UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'is_me', p_viewer = p_other,
    'i_follow', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p_viewer AND f.followee_id = p_other),
    'follows_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p_other AND f.followee_id = p_viewer),
    'friend', public.social__friend_state(p_viewer, p_other)
  );
$$;
REVOKE ALL ON FUNCTION public.social__relation(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.follow_set(p_member UUID, p_follow BOOLEAN DEFAULT TRUE)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  IF p_member = v_me THEN RAISE EXCEPTION 'social_self' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.social__target(p_member);
  IF p_follow THEN
    IF (SELECT count(*) FROM public.follows WHERE follower_id = v_me AND created_at > NOW() - INTERVAL '24 hours') >= 300 THEN
      RAISE EXCEPTION 'social_rate_limited' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.follows (follower_id, followee_id) VALUES (v_me, p_member) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.follows WHERE follower_id = v_me AND followee_id = p_member;
  END IF;
  RETURN public.social__relation(v_me, p_member);
END;
$$;

CREATE OR REPLACE FUNCTION public.friend_request(p_member UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); f public.friendships%ROWTYPE; v_has BOOLEAN;
BEGIN
  IF p_member = v_me THEN RAISE EXCEPTION 'social_self' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.social__target(p_member);
  SELECT * INTO f FROM public.friendships
    WHERE pair_low = LEAST(v_me, p_member) AND pair_high = GREATEST(v_me, p_member) FOR UPDATE;
  v_has := FOUND;
  IF v_has THEN
    IF f.status = 'accepted' OR (f.status = 'pending' AND f.requester_id = v_me) THEN
      RETURN public.social__relation(v_me, p_member);
    END IF;
    IF f.status = 'pending' THEN
      -- They already asked me: requesting back = accept.
      UPDATE public.friendships SET status = 'accepted', responded_at = NOW() WHERE id = f.id;
      RETURN public.social__relation(v_me, p_member);
    END IF;
    -- declined: the person who was declined waits 14 days before asking again.
    IF f.requester_id = v_me AND f.responded_at > NOW() - INTERVAL '14 days' THEN
      RAISE EXCEPTION 'social_friend_cooldown' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF (SELECT count(*) FROM public.friendships WHERE requester_id = v_me AND created_at > NOW() - INTERVAL '24 hours') >= 30 THEN
    RAISE EXCEPTION 'social_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  IF v_has THEN
    UPDATE public.friendships SET requester_id = v_me, addressee_id = p_member, status = 'pending',
      created_at = NOW(), responded_at = NULL WHERE id = f.id;
  ELSE
    INSERT INTO public.friendships (requester_id, addressee_id) VALUES (v_me, p_member);
  END IF;
  RETURN public.social__relation(v_me, p_member);
END;
$$;

CREATE OR REPLACE FUNCTION public.friend_respond(p_member UUID, p_accept BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  UPDATE public.friendships SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, responded_at = NOW()
  WHERE requester_id = p_member AND addressee_id = v_me AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'social_request_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN public.social__relation(v_me, p_member);
END;
$$;

-- Unfriend, or cancel my pending request.
CREATE OR REPLACE FUNCTION public.friend_remove(p_member UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  DELETE FROM public.friendships
  WHERE pair_low = LEAST(v_me, p_member) AND pair_high = GREATEST(v_me, p_member)
    AND (status = 'accepted' OR (status = 'pending' AND requester_id = v_me));
  RETURN public.social__relation(v_me, p_member);
END;
$$;

-- Counts + relation for a profile.
CREATE OR REPLACE FUNCTION public.social_summary(p_member UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  RETURN jsonb_build_object(
    'followers', (SELECT count(*) FROM public.follows f JOIN public.members m ON m.id = f.follower_id
                  WHERE f.followee_id = p_member AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned),
    'following', (SELECT count(*) FROM public.follows f JOIN public.members m ON m.id = f.followee_id
                  WHERE f.follower_id = p_member AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned),
    'friends', (SELECT count(*) FROM public.friendships f WHERE f.status = 'accepted'
                AND (f.requester_id = p_member OR f.addressee_id = p_member)),
    'incoming_requests', CASE WHEN p_member = v_me THEN
      (SELECT count(*) FROM public.friendships f WHERE f.addressee_id = v_me AND f.status = 'pending') END,
    'relation', public.social__relation(v_me, p_member)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.social__person_json(p_member UUID, p_viewer UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object('id', m.id, 'name', m.display_name, 'avatar_url', m.avatar_url,
    'bio', left(COALESCE(m.bio, ''), 140), 'relation', public.social__relation(p_viewer, m.id))
  FROM public.members m WHERE m.id = p_member;
$$;
REVOKE ALL ON FUNCTION public.social__person_json(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- kind: followers | following | friends | requests (incoming, self only) | sent (outgoing, self only)
CREATE OR REPLACE FUNCTION public.social_list(p_member UUID, p_kind TEXT, p_offset INTEGER DEFAULT 0, p_limit INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
        v_off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF p_kind IN ('requests', 'sent') AND p_member <> v_me THEN RAISE EXCEPTION 'social_forbidden' USING ERRCODE = 'P0001'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(public.social__person_json(x.id, v_me) ORDER BY x.at DESC)
    FROM (
      SELECT ids.id, ids.at FROM (
        SELECT f.follower_id AS id, f.created_at AS at FROM public.follows f WHERE p_kind = 'followers' AND f.followee_id = p_member
        UNION ALL
        SELECT f.followee_id, f.created_at FROM public.follows f WHERE p_kind = 'following' AND f.follower_id = p_member
        UNION ALL
        SELECT CASE WHEN f.requester_id = p_member THEN f.addressee_id ELSE f.requester_id END, COALESCE(f.responded_at, f.created_at)
          FROM public.friendships f WHERE p_kind = 'friends' AND f.status = 'accepted' AND (f.requester_id = p_member OR f.addressee_id = p_member)
        UNION ALL
        SELECT f.requester_id, f.created_at FROM public.friendships f WHERE p_kind = 'requests' AND f.addressee_id = p_member AND f.status = 'pending'
        UNION ALL
        SELECT f.addressee_id, f.created_at FROM public.friendships f WHERE p_kind = 'sent' AND f.requester_id = p_member AND f.status = 'pending'
      ) ids JOIN public.members m ON m.id = ids.id
      WHERE m.signup_completed_at IS NOT NULL AND NOT m.is_banned
      ORDER BY ids.at DESC
      OFFSET v_off LIMIT v_lim
    ) x
  ), '[]'::jsonb);
END;
$$;

-- Relations of the viewer to many members at once (feed cards, tool users).
CREATE OR REPLACE FUNCTION public.social_relations(p_members UUID[])
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_object_agg(x.id, public.social__relation(v_me, x.id))
    FROM (SELECT DISTINCT unnest(p_members[1:300]) AS id) x
  ), '{}'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Invite network graph (members only; no emails; paginated expansion)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.graph__node_json(p_member UUID, p_viewer UUID, p_depth INTEGER)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'name', m.display_name, 'avatar_url', m.avatar_url, 'bio', left(COALESCE(m.bio, ''), 140),
    'parent_id', m.invited_by_id, 'depth', p_depth, 'joined_at', m.signup_completed_at,
    'child_count', (SELECT count(*) FROM public.members c WHERE c.invited_by_id = m.id
                    AND c.signup_completed_at IS NOT NULL AND NOT c.is_banned),
    'relation', public.social__relation(p_viewer, m.id)
  )
  FROM public.members m WHERE m.id = p_member;
$$;
REVOKE ALL ON FUNCTION public.graph__node_json(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- Ancestors up to p_hops above, and descendants up to p_hops below the root
-- (at most p_per_node children per node, 400 nodes total). Use invite_children for more.
CREATE OR REPLACE FUNCTION public.invite_graph(p_root UUID DEFAULT NULL, p_hops INTEGER DEFAULT 3, p_per_node INTEGER DEFAULT 12)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := public.app__me();
  v_root UUID := COALESCE(p_root, v_me);
  v_hops INTEGER := LEAST(GREATEST(COALESCE(p_hops, 3), 1), 3);
  v_per INTEGER := LEAST(GREATEST(COALESCE(p_per_node, 12), 1), 30);
BEGIN
  PERFORM public.social__target(v_root);
  RETURN jsonb_build_object(
    'root_id', v_root,
    'per_node', v_per,
    'nodes', COALESCE((
      WITH RECURSIVE up AS (
        SELECT m.id, m.invited_by_id, 0 AS depth FROM public.members m WHERE m.id = v_root
        UNION ALL
        SELECT p.id, p.invited_by_id, u.depth - 1 FROM up u JOIN public.members p ON p.id = u.invited_by_id
        WHERE u.depth > -v_hops AND p.signup_completed_at IS NOT NULL AND NOT p.is_banned
      ),
      down AS (
        SELECT m.id, 0 AS depth FROM public.members m WHERE m.id = v_root
        UNION ALL
        SELECT c.id, d.depth + 1 FROM down d
        CROSS JOIN LATERAL (
          SELECT x.id FROM public.members x
          WHERE x.invited_by_id = d.id AND x.signup_completed_at IS NOT NULL AND NOT x.is_banned
          ORDER BY x.signup_completed_at, x.id LIMIT v_per
        ) c
        WHERE d.depth < v_hops
      ),
      allnodes AS (
        SELECT id, depth FROM up WHERE depth < 0
        UNION ALL
        SELECT id, depth FROM down
      )
      SELECT jsonb_agg(public.graph__node_json(a.id, v_me, a.depth) ORDER BY a.depth)
      FROM (SELECT * FROM allnodes ORDER BY abs(depth), depth LIMIT 400) a
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_children(p_member UUID, p_offset INTEGER DEFAULT 0, p_limit INTEGER DEFAULT 12)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := public.app__me();
  v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 50);
  v_off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_total INTEGER;
BEGIN
  PERFORM public.social__target(p_member);
  SELECT count(*) INTO v_total FROM public.members c
    WHERE c.invited_by_id = p_member AND c.signup_completed_at IS NOT NULL AND NOT c.is_banned;
  RETURN jsonb_build_object(
    'parent_id', p_member, 'total', v_total, 'offset', v_off,
    'has_more', v_off + v_lim < v_total,
    'nodes', COALESCE((
      SELECT jsonb_agg(public.graph__node_json(x.id, v_me, NULL) ORDER BY x.signup_completed_at, x.id)
      FROM (
        SELECT c.id, c.signup_completed_at FROM public.members c
        WHERE c.invited_by_id = p_member AND c.signup_completed_at IS NOT NULL AND NOT c.is_banned
        ORDER BY c.signup_completed_at, c.id OFFSET v_off LIMIT v_lim
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Grants (authenticated web session only; nothing for anon / MCP tokens)
-- ---------------------------------------------------------------------
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'follow_set(uuid,boolean)', 'friend_request(uuid)', 'friend_respond(uuid,boolean)', 'friend_remove(uuid)',
    'social_summary(uuid)', 'social_list(uuid,text,integer,integer)', 'social_relations(uuid[])',
    'invite_graph(uuid,integer,integer)', 'invite_children(uuid,integer,integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
