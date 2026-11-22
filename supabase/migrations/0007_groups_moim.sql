-- 0007: groups (topic groups with their own timeline) + 모임 (meetup upgrade)
-- Writes for groups / 모임 go through SECURITY DEFINER RPCs that resolve the
-- caller from auth.uid(). Group posts never reach agents/MCP or the main feed.

-- ---------------------------------------------------------------------
-- 0. Caller helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app__me()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  SELECT m.id INTO v FROM public.members m
  WHERE m.auth_id = auth.uid() AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE;
  IF v IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001'; END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.app__me() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Groups
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 40),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  emoji TEXT CHECK (emoji IS NULL OR char_length(emoji) <= 8),
  join_policy TEXT NOT NULL DEFAULT 'open' CHECK (join_policy IN ('open', 'approval')),
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'mod', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'invited')),
  invited_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  message TEXT CHECK (message IS NULL OR char_length(message) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_member ON public.group_members(member_id);
CREATE INDEX IF NOT EXISTS idx_group_members_invited_by ON public.group_members(invited_by);

-- Active role of a member in a group (NULL when not an active member).
CREATE OR REPLACE FUNCTION public.group__role(p_group UUID, p_member UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT gm.role FROM public.group_members gm
  WHERE gm.group_id = p_group AND gm.member_id = p_member AND gm.status = 'active';
$$;

-- Can the current viewer see the group at all? (hidden → only people with a row)
CREATE OR REPLACE FUNCTION public.group__visible(p_group UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = p_group AND (
      NOT g.is_hidden
      OR EXISTS (SELECT 1 FROM public.group_members gm
                 WHERE gm.group_id = g.id AND gm.member_id = public.current_member_id())
    )
  );
$$;

-- Can the current viewer read the group's timeline?
-- Open & listed groups are readable by every member; others need active membership.
CREATE OR REPLACE FUNCTION public.group__can_read(p_group UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = p_group AND (
      (g.join_policy = 'open' AND NOT g.is_hidden)
      OR EXISTS (SELECT 1 FROM public.group_members gm
                 WHERE gm.group_id = g.id AND gm.member_id = public.current_member_id()
                   AND gm.status = 'active')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.group__role(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.group__visible(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.group__can_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group__role(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group__visible(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group__can_read(UUID) TO authenticated;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.group_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.groups TO authenticated;
GRANT SELECT ON public.group_members TO authenticated;

DROP POLICY IF EXISTS groups_select ON public.groups;
CREATE POLICY groups_select ON public.groups FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()) AND public.group__visible(id));

DROP POLICY IF EXISTS group_members_select ON public.group_members;
CREATE POLICY group_members_select ON public.group_members FOR SELECT TO authenticated
  USING (
    (SELECT public.is_completed_member())
    AND public.group__visible(group_id)
    AND (
      status = 'active'
      OR member_id = (SELECT public.current_member_id())
      OR public.group__role(group_id, (SELECT public.current_member_id())) IN ('owner', 'mod')
    )
  );

-- member_count = active members
CREATE OR REPLACE FUNCTION public.group_members_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_group UUID := COALESCE(NEW.group_id, OLD.group_id);
BEGIN
  UPDATE public.groups g SET member_count =
    (SELECT count(*) FROM public.group_members gm WHERE gm.group_id = v_group AND gm.status = 'active')
  WHERE g.id = v_group;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.group_members_counter() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS group_members_counter_trigger ON public.group_members;
CREATE TRIGGER group_members_counter_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.group_members_counter();

CREATE OR REPLACE FUNCTION public.group__json(g public.groups, p_viewer UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', g.id, 'slug', g.slug, 'name', g.name, 'description', g.description, 'emoji', g.emoji,
    'join_policy', g.join_policy, 'is_hidden', g.is_hidden, 'member_count', g.member_count,
    'post_count', g.post_count, 'created_at', g.created_at,
    'my_role', (SELECT gm.role FROM public.group_members gm WHERE gm.group_id = g.id AND gm.member_id = p_viewer AND gm.status = 'active'),
    'my_status', (SELECT gm.status FROM public.group_members gm WHERE gm.group_id = g.id AND gm.member_id = p_viewer)
  );
$$;
REVOKE ALL ON FUNCTION public.group__json(public.groups, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.group_create(
  p_name TEXT, p_slug TEXT, p_description TEXT DEFAULT '', p_emoji TEXT DEFAULT NULL,
  p_join_policy TEXT DEFAULT 'open', p_hidden BOOLEAN DEFAULT FALSE
)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := public.app__me();
  v_slug TEXT := lower(btrim(COALESCE(p_slug, '')));
  g public.groups%ROWTYPE;
BEGIN
  IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 2 AND 40 THEN
    RAISE EXCEPTION 'group_invalid_name' USING ERRCODE = 'P0001';
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,39}$' THEN RAISE EXCEPTION 'group_invalid_slug' USING ERRCODE = 'P0001'; END IF;
  IF COALESCE(p_join_policy, 'open') NOT IN ('open', 'approval') THEN
    RAISE EXCEPTION 'group_invalid_policy' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.groups x WHERE x.created_by = v_me AND x.created_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'group_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.groups x WHERE x.slug = v_slug) THEN
    RAISE EXCEPTION 'group_slug_taken' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.groups (slug, name, description, emoji, join_policy, is_hidden, created_by)
  VALUES (v_slug, btrim(p_name), left(btrim(COALESCE(p_description, '')), 500),
          NULLIF(left(btrim(COALESCE(p_emoji, '')), 8), ''), COALESCE(p_join_policy, 'open'),
          COALESCE(p_hidden, FALSE), v_me)
  RETURNING * INTO g;
  INSERT INTO public.group_members (group_id, member_id, role, status) VALUES (g.id, v_me, 'owner', 'active');
  SELECT * INTO g FROM public.groups WHERE id = g.id;
  RETURN public.group__json(g, v_me);
END;
$$;

CREATE OR REPLACE FUNCTION public.group_update(
  p_group UUID, p_name TEXT, p_description TEXT, p_emoji TEXT, p_join_policy TEXT, p_hidden BOOLEAN
)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); g public.groups%ROWTYPE;
BEGIN
  IF public.group__role(p_group, v_me) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'group_forbidden' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 2 AND 40 THEN
    RAISE EXCEPTION 'group_invalid_name' USING ERRCODE = 'P0001';
  END IF;
  IF p_join_policy NOT IN ('open', 'approval') THEN RAISE EXCEPTION 'group_invalid_policy' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.groups SET name = btrim(p_name), description = left(btrim(COALESCE(p_description, '')), 500),
    emoji = NULLIF(left(btrim(COALESCE(p_emoji, '')), 8), ''), join_policy = p_join_policy,
    is_hidden = COALESCE(p_hidden, FALSE), updated_at = NOW()
  WHERE id = p_group RETURNING * INTO g;
  RETURN public.group__json(g, v_me);
END;
$$;

-- Join (open → active, approval → pending, invited → active)
CREATE OR REPLACE FUNCTION public.group_join(p_group UUID, p_message TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); g public.groups%ROWTYPE; v_status TEXT;
BEGIN
  SELECT * INTO g FROM public.groups WHERE id = p_group;
  IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT status INTO v_status FROM public.group_members WHERE group_id = p_group AND member_id = v_me;
  IF v_status = 'active' OR v_status = 'pending' THEN RETURN v_status; END IF;
  IF v_status = 'invited' THEN
    UPDATE public.group_members SET status = 'active', updated_at = NOW() WHERE group_id = p_group AND member_id = v_me;
    RETURN 'active';
  END IF;
  IF g.is_hidden THEN RAISE EXCEPTION 'group_not_found' USING ERRCODE = 'P0001'; END IF;
  v_status := CASE WHEN g.join_policy = 'open' THEN 'active' ELSE 'pending' END;
  INSERT INTO public.group_members (group_id, member_id, role, status, message)
  VALUES (p_group, v_me, 'member', v_status, NULLIF(left(btrim(COALESCE(p_message, '')), 200), ''));
  RETURN v_status;
END;
$$;

-- Leave / cancel request / decline invite. Owners must transfer or delete first.
CREATE OR REPLACE FUNCTION public.group_leave(p_group UUID)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  IF public.group__role(p_group, v_me) = 'owner' THEN RAISE EXCEPTION 'group_owner_cannot_leave' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.group_members WHERE group_id = p_group AND member_id = v_me;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.group_decide(p_group UUID, p_member UUID, p_accept BOOLEAN)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  IF COALESCE(public.group__role(p_group, v_me), '') NOT IN ('owner', 'mod') THEN
    RAISE EXCEPTION 'group_forbidden' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group AND member_id = p_member AND status = 'pending') THEN
    RAISE EXCEPTION 'group_request_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF p_accept THEN
    UPDATE public.group_members SET status = 'active', updated_at = NOW() WHERE group_id = p_group AND member_id = p_member;
    RETURN 'active';
  END IF;
  DELETE FROM public.group_members WHERE group_id = p_group AND member_id = p_member;
  RETURN 'declined';
END;
$$;

CREATE OR REPLACE FUNCTION public.group_invite(p_group UUID, p_member UUID)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_status TEXT;
BEGIN
  IF COALESCE(public.group__role(p_group, v_me), '') NOT IN ('owner', 'mod') THEN
    RAISE EXCEPTION 'group_forbidden' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned) THEN
    RAISE EXCEPTION 'group_member_not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT status INTO v_status FROM public.group_members WHERE group_id = p_group AND member_id = p_member;
  IF v_status = 'pending' THEN
    UPDATE public.group_members SET status = 'active', updated_at = NOW() WHERE group_id = p_group AND member_id = p_member;
    RETURN 'active';
  ELSIF v_status IS NOT NULL THEN
    RETURN v_status;
  END IF;
  IF (SELECT count(*) FROM public.group_members WHERE invited_by = v_me AND created_at > NOW() - INTERVAL '24 hours') >= 50 THEN
    RAISE EXCEPTION 'group_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.group_members (group_id, member_id, role, status, invited_by)
  VALUES (p_group, p_member, 'member', 'invited', v_me);
  RETURN 'invited';
END;
$$;

-- Owner: mod|member|owner (owner = transfer). Mods cannot change roles.
CREATE OR REPLACE FUNCTION public.group_set_role(p_group UUID, p_member UUID, p_role TEXT)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  IF public.group__role(p_group, v_me) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'group_forbidden' USING ERRCODE = 'P0001'; END IF;
  IF p_role NOT IN ('owner', 'mod', 'member') OR p_member = v_me THEN RAISE EXCEPTION 'group_invalid_role' USING ERRCODE = 'P0001'; END IF;
  IF public.group__role(p_group, p_member) IS NULL THEN RAISE EXCEPTION 'group_member_not_found' USING ERRCODE = 'P0001'; END IF;
  IF p_role = 'owner' THEN
    UPDATE public.group_members SET role = 'mod', updated_at = NOW() WHERE group_id = p_group AND member_id = v_me;
  END IF;
  UPDATE public.group_members SET role = p_role, updated_at = NOW() WHERE group_id = p_group AND member_id = p_member;
  RETURN p_role;
END;
$$;

-- Owner removes anyone (not self); mods remove plain members / pending / invited.
CREATE OR REPLACE FUNCTION public.group_remove(p_group UUID, p_member UUID)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_my TEXT; v_their TEXT;
BEGIN
  v_my := public.group__role(p_group, v_me);
  SELECT role INTO v_their FROM public.group_members WHERE group_id = p_group AND member_id = p_member;
  IF v_their IS NULL THEN RETURN FALSE; END IF;
  IF p_member = v_me OR v_their = 'owner' OR v_my IS NULL OR v_my = 'member'
     OR (v_my = 'mod' AND v_their <> 'member') THEN
    RAISE EXCEPTION 'group_forbidden' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.group_members WHERE group_id = p_group AND member_id = p_member;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.group_delete(p_group UUID)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  IF public.group__role(p_group, v_me) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'group_forbidden' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.groups WHERE id = p_group;
  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Group posts: posts.group_id (timeline per group, humans only)
-- ---------------------------------------------------------------------
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_posts_group_timeline ON public.posts(group_id, created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_main_timeline ON public.posts(created_at DESC) WHERE parent_id IS NULL AND group_id IS NULL;

DROP POLICY IF EXISTS posts_select ON public.posts;
CREATE POLICY posts_select ON public.posts
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    AND (
      is_hidden = FALSE
      OR author_id = public.current_member_id()
      OR EXISTS (SELECT 1 FROM public.members WHERE auth_id = (SELECT auth.uid()) AND is_admin)
    )
    AND (group_id IS NULL OR public.group__can_read(group_id))
  );

DROP POLICY IF EXISTS posts_insert ON public.posts;
CREATE POLICY posts_insert ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_completed_member())
    AND author_id = (SELECT public.current_member_id())
    AND author_kind = 'member'
    AND agent_token_id IS NULL
    AND (group_id IS NULL OR public.group__role(group_id, (SELECT public.current_member_id())) IS NOT NULL)
  );

-- Guard: replies inherit group_id, group posts are humans-only, group_id immutable.
CREATE OR REPLACE FUNCTION public.posts_timeline_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent public.posts%ROWTYPE;
  is_client BOOLEAN := current_user IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF char_length(NEW.content) > 500 THEN
      RAISE EXCEPTION 'feed_body_too_long' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(btrim(NEW.content)) = 0 THEN
      RAISE EXCEPTION 'feed_body_empty' USING ERRCODE = 'P0001';
    END IF;
    IF is_client AND (NEW.author_kind <> 'member' OR NEW.agent_token_id IS NOT NULL
                      OR NEW.agent_name IS NOT NULL OR NEW.is_agent_posted) THEN
      RAISE EXCEPTION 'feed_agent_fields_forbidden' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.parent_id IS NOT NULL THEN
      SELECT * INTO parent FROM public.posts WHERE id = NEW.parent_id;
      IF NOT FOUND OR parent.is_hidden THEN
        RAISE EXCEPTION 'feed_parent_not_found' USING ERRCODE = 'P0001';
      END IF;
      NEW.root_id := COALESCE(parent.root_id, parent.id);
      NEW.group_id := parent.group_id;
      NEW.agent_interaction := 'humans_only';
    ELSE
      NEW.root_id := NULL;
    END IF;
    IF NEW.group_id IS NOT NULL THEN
      IF NEW.author_kind <> 'member' THEN
        RAISE EXCEPTION 'feed_group_humans_only' USING ERRCODE = 'P0001';
      END IF;
      NEW.agent_interaction := 'humans_only';
    END IF;
    NEW.like_count := 0;
    NEW.reply_count := 0;
    RETURN NEW;
  END IF;

  -- UPDATE from a client session: identity/thread/counter fields are immutable,
  -- and agent-authored rows cannot be edited by their owner.
  IF is_client THEN
    IF NEW.author_kind IS DISTINCT FROM OLD.author_kind
       OR NEW.agent_token_id IS DISTINCT FROM OLD.agent_token_id
       OR NEW.agent_name IS DISTINCT FROM OLD.agent_name
       OR NEW.agent_model IS DISTINCT FROM OLD.agent_model
       OR NEW.is_agent_posted IS DISTINCT FROM OLD.is_agent_posted
       OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
       OR NEW.root_id IS DISTINCT FROM OLD.root_id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.author_id IS DISTINCT FROM OLD.author_id
       OR NEW.like_count IS DISTINCT FROM OLD.like_count
       OR NEW.reply_count IS DISTINCT FROM OLD.reply_count THEN
      RAISE EXCEPTION 'feed_immutable_field' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.author_kind = 'agent' AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title) THEN
      RAISE EXCEPTION 'feed_agent_row_readonly' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.group_id IS NOT NULL AND NEW.agent_interaction <> 'humans_only' THEN
    NEW.agent_interaction := 'humans_only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.posts_group_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.group_id IS NOT NULL AND NEW.parent_id IS NULL THEN
    UPDATE public.groups SET post_count = post_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' AND OLD.group_id IS NOT NULL AND OLD.parent_id IS NULL THEN
    UPDATE public.groups SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.posts_group_counter() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS posts_group_counter_trigger ON public.posts;
CREATE TRIGGER posts_group_counter_trigger AFTER INSERT OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_group_counter();

-- Agent / MCP surfaces never see group posts.
CREATE OR REPLACE FUNCTION public.mcp_feed_list(p_token TEXT, p_query TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['posts_read', 'feed:interact']);
  RETURN COALESCE((
    SELECT jsonb_agg(public.feed__post_json(p) ORDER BY p.created_at DESC)
    FROM (
      SELECT * FROM public.posts
      WHERE parent_id IS NULL AND is_hidden = FALSE AND group_id IS NULL
        AND (p_query IS NULL OR p_query = '' OR content ILIKE '%' || p_query || '%' OR title ILIKE '%' || p_query || '%')
      ORDER BY created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) p
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_feed_get(p_token TEXT, p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  p public.posts%ROWTYPE;
  v_root UUID;
BEGIN
  t := public.api__token(p_token, ARRAY['posts_read', 'feed:interact']);
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE AND group_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  v_root := COALESCE(p.root_id, p.id);
  SELECT * INTO p FROM public.posts WHERE id = v_root;
  RETURN jsonb_build_object(
    'post', public.feed__post_json(p),
    'assets', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'type', a.type, 'name', a.name))
                        FROM public.assets a WHERE a.post_id = v_root), '[]'::jsonb),
    'replies', COALESCE((SELECT jsonb_agg(public.feed__post_json(r) ORDER BY r.created_at)
                         FROM public.posts r WHERE r.root_id = v_root AND r.is_hidden = FALSE), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.feed_agent_reply(
  p_token TEXT, p_parent_id UUID, p_body TEXT, p_agent_model TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  parent public.posts%ROWTYPE;
  root public.posts%ROWTYPE;
  v_count INTEGER;
  v_row public.posts%ROWTYPE;
  v_body TEXT := btrim(COALESCE(p_body, ''));
BEGIN
  t := public.api__token(p_token, ARRAY['feed:interact']);
  IF char_length(v_body) = 0 OR char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'feed_invalid_body' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO parent FROM public.posts WHERE id = p_parent_id AND is_hidden = FALSE AND group_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO root FROM public.posts WHERE id = COALESCE(parent.root_id, parent.id);
  IF root.agent_interaction <> 'agents_allowed' OR root.is_hidden THEN
    RAISE EXCEPTION 'feed_agents_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_count FROM public.posts
    WHERE agent_token_id = t.id AND created_at > NOW() - INTERVAL '24 hours';
  IF v_count >= public.agora__config_int('feed_agent_daily_reply_limit', 100) THEN
    RAISE EXCEPTION 'api_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.posts (title, content, author_id, posted_as, parent_id, author_kind,
                            agent_token_id, agent_name, agent_model, is_agent_posted, agent_token_name)
  VALUES ('', v_body, t.member_id, 'real', p_parent_id, 'agent', t.id,
          left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40),
          left(NULLIF(btrim(COALESCE(p_agent_model, t.agent_model, '')), ''), 60),
          TRUE, t.name)
  RETURNING * INTO v_row;
  RETURN public.feed__post_json(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.feed_agent_like(p_token TEXT, p_post_id UUID, p_unlike BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  p public.posts%ROWTYPE;
  root public.posts%ROWTYPE;
  v_count INTEGER;
BEGIN
  t := public.api__token(p_token, ARRAY['feed:interact']);
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE AND group_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO root FROM public.posts WHERE id = COALESCE(p.root_id, p.id);
  IF root.agent_interaction <> 'agents_allowed' THEN
    RAISE EXCEPTION 'feed_agents_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  IF p_unlike THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND liker_type = 'agent' AND token_id = t.id;
  ELSE
    SELECT count(*) INTO v_count FROM public.post_likes
      WHERE token_id = t.id AND created_at > NOW() - INTERVAL '24 hours';
    IF v_count >= public.agora__config_int('feed_agent_daily_like_limit', 300) THEN
      RAISE EXCEPTION 'api_rate_limited' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.post_likes (post_id, liker_type, member_id, token_id, agent_name)
      VALUES (p_post_id, 'agent', t.member_id, t.id, left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40))
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('post_id', p_post_id, 'liked', NOT p_unlike,
    'like_count', (SELECT like_count FROM public.posts WHERE id = p_post_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_archive_save_post(p_token TEXT, p_post_id UUID, p_tags TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  p public.posts%ROWTYPE;
  v_type TEXT;
  v_existing UUID;
  v_id UUID;
  v_tags TEXT[];
BEGIN
  t := public.api__token(p_token, ARRAY['archive_write']);
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE AND group_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  v_type := CASE WHEN p.url IS NOT NULL THEN 'link' ELSE 'post' END;
  v_tags := ARRAY(SELECT DISTINCT left(lower(btrim(x)), 40) FROM unnest(COALESCE(p_tags, ARRAY[]::TEXT[])) x
                  WHERE btrim(x) <> '' LIMIT 20);
  SELECT id INTO v_existing FROM public.brain_archive_items
    WHERE owner_id = t.member_id AND source_id = p.id::text AND source_type IN ('post', 'link');
  IF v_existing IS NOT NULL THEN
    UPDATE public.brain_archive_items
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || v_tags)), updated_at = NOW()
      WHERE id = v_existing;
    RETURN jsonb_build_object('id', v_existing, 'created', FALSE);
  END IF;
  INSERT INTO public.brain_archive_items (owner_id, source_type, source_id, title, summary, content_text, source_url, extracted_text, tags)
  VALUES (t.member_id, v_type, p.id::text,
          COALESCE(NULLIF(p.title, ''), NULLIF(p.link_title, ''), left(p.content, 60)),
          COALESCE(p.link_description, left(p.content, 140)), p.content, p.url,
          CASE WHEN p.url IS NOT NULL THEN p.link_description END, v_tags)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'created', TRUE);
END;
$$;

-- ---------------------------------------------------------------------
-- 3. 모임 (meetups upgrade): group host, members-only, questions, private location
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mcp_meetup_create(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.mcp_meetup_rsvp(TEXT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.mcp_meetups(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.mcp_meetup_get(TEXT, UUID);
DROP FUNCTION IF EXISTS public.meetup__json(public.meetups, UUID);

ALTER TABLE public.meetups ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;
ALTER TABLE public.meetups ADD COLUMN IF NOT EXISTS members_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.meetups ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
  ALTER TABLE public.meetups ADD CONSTRAINT meetups_questions_array
    CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) <= 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_meetups_group ON public.meetups(group_id);
CREATE INDEX IF NOT EXISTS idx_meetups_starts ON public.meetups(starts_at);

ALTER TABLE public.meetup_rsvps ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.meetup_rsvps ADD COLUMN IF NOT EXISTS waitlisted_at TIMESTAMPTZ;
ALTER TABLE public.meetup_rsvps ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_meetup_rsvps_member ON public.meetup_rsvps(member_id);

-- Private location: only the host / managers and confirmed attendees can read it.
CREATE TABLE IF NOT EXISTS public.meetup_private (
  meetup_id UUID PRIMARY KEY REFERENCES public.meetups(id) ON DELETE CASCADE,
  venue_address TEXT CHECK (venue_address IS NULL OR char_length(venue_address) <= 300),
  map_url TEXT CHECK (map_url IS NULL OR (char_length(map_url) <= 500 AND map_url ~* '^https?://')),
  meeting_url TEXT CHECK (meeting_url IS NULL OR (char_length(meeting_url) <= 500 AND meeting_url ~* '^https?://')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meetups' AND column_name = 'venue_address') THEN
    EXECUTE $q$
      INSERT INTO public.meetup_private (meetup_id, venue_address, map_url, meeting_url)
      SELECT id, left(venue_address, 300),
             CASE WHEN map_url ~* '^https?://' THEN left(map_url, 500) END,
             CASE WHEN meeting_url ~* '^https?://' THEN left(meeting_url, 500) END
      FROM public.meetups
      ON CONFLICT (meetup_id) DO NOTHING
    $q$;
  END IF;
END $$;
ALTER TABLE public.meetups DROP COLUMN IF EXISTS venue_address;
ALTER TABLE public.meetups DROP COLUMN IF EXISTS map_url;
ALTER TABLE public.meetups DROP COLUMN IF EXISTS meeting_url;

-- Manager = host, or owner/mod of the hosting group.
CREATE OR REPLACE FUNCTION public.moim__can_manage(p_meetup UUID, p_member UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetups m
    WHERE m.id = p_meetup AND (
      m.host_id = p_member
      OR (m.group_id IS NOT NULL AND public.group__role(m.group_id, p_member) IN ('owner', 'mod'))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.moim__can_see_private(p_meetup UUID, p_member UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.moim__can_manage(p_meetup, p_member) OR EXISTS (
    SELECT 1 FROM public.meetup_rsvps r
    WHERE r.meetup_id = p_meetup AND r.member_id = p_member AND r.status = 'confirmed'
  );
$$;
REVOKE ALL ON FUNCTION public.moim__can_manage(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moim__can_see_private(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moim__can_manage(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moim__can_see_private(UUID, UUID) TO authenticated;

ALTER TABLE public.meetup_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meetup_private FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.meetup_private TO authenticated;
DROP POLICY IF EXISTS meetup_private_select ON public.meetup_private;
CREATE POLICY meetup_private_select ON public.meetup_private FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member())
         AND public.moim__can_see_private(meetup_id, (SELECT public.current_member_id())));

-- meetups: visible to members unless the hosting group is hidden from them. Writes via RPC only.
DROP POLICY IF EXISTS meetups_select ON public.meetups;
DROP POLICY IF EXISTS meetups_insert ON public.meetups;
DROP POLICY IF EXISTS meetups_update ON public.meetups;
CREATE POLICY meetups_select ON public.meetups FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()) AND (group_id IS NULL OR public.group__visible(group_id)));
REVOKE INSERT, UPDATE, DELETE ON public.meetups FROM anon, authenticated;

-- rsvps: only your own rows, or all rows for managers. Writes via RPC only.
DROP POLICY IF EXISTS meetup_rsvps_select ON public.meetup_rsvps;
DROP POLICY IF EXISTS meetup_rsvps_insert ON public.meetup_rsvps;
DROP POLICY IF EXISTS meetup_rsvps_update ON public.meetup_rsvps;
CREATE POLICY meetup_rsvps_select ON public.meetup_rsvps FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()) AND (
    member_id = (SELECT public.current_member_id())
    OR public.moim__can_manage(meetup_id, (SELECT public.current_member_id()))
  ));
REVOKE INSERT, UPDATE, DELETE ON public.meetup_rsvps FROM anon, authenticated;

DROP POLICY IF EXISTS meetup_announcements_select ON public.meetup_announcements;
DROP POLICY IF EXISTS meetup_announcements_insert ON public.meetup_announcements;
CREATE POLICY meetup_announcements_select ON public.meetup_announcements FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member())
         AND EXISTS (SELECT 1 FROM public.meetups m WHERE m.id = meetup_id));
REVOKE INSERT, UPDATE, DELETE ON public.meetup_announcements FROM anon, authenticated;

-- ---- JSON helpers -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.moim__json(m public.meetups, p_viewer UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'title', m.title, 'description', m.description, 'mode', m.mode,
    'venue_name', m.venue_name, 'starts_at', m.starts_at, 'ends_at', m.ends_at,
    'capacity', m.capacity, 'apply_deadline', m.apply_deadline,
    'requires_approval', m.requires_approval, 'status', m.status, 'fee_note', m.fee_note,
    'members_only', m.members_only, 'questions', m.questions, 'created_at', m.created_at,
    'host', public.api__author_json(m.host_id, m.posted_as),
    'host_id', CASE WHEN m.posted_as = 'real' THEN m.host_id END,
    'group', (SELECT jsonb_build_object('id', g.id, 'slug', g.slug, 'name', g.name, 'emoji', g.emoji)
              FROM public.groups g WHERE g.id = m.group_id),
    'confirmed', (SELECT count(*) FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.status = 'confirmed'),
    'waitlisted', (SELECT count(*) FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.status = 'waitlisted'),
    'pending', (SELECT count(*) FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.status = 'pending'),
    'is_host', m.host_id = p_viewer,
    'can_manage', public.moim__can_manage(m.id, p_viewer),
    'is_group_member', CASE WHEN m.group_id IS NULL THEN NULL ELSE public.group__role(m.group_id, p_viewer) IS NOT NULL END,
    'my_rsvp', (SELECT jsonb_build_object(
        'id', r.id, 'status', r.status, 'answers', r.answers, 'note', r.note, 'created_at', r.created_at,
        'position', CASE WHEN r.status = 'waitlisted' THEN (
            SELECT count(*) + 1 FROM public.meetup_rsvps w
            WHERE w.meetup_id = m.id AND w.status = 'waitlisted'
              AND (w.waitlisted_at, w.created_at) < (r.waitlisted_at, r.created_at)) END)
      FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.member_id = p_viewer)
  );
$$;
REVOKE ALL ON FUNCTION public.moim__json(public.meetups, UUID) FROM PUBLIC, anon, authenticated;

-- Waitlist auto-promotion: fill free seats by waitlist order (first-come).
CREATE OR REPLACE FUNCTION public.moim__promote(p_meetup UUID)
RETURNS INTEGER LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE m public.meetups%ROWTYPE; v_free INTEGER; v_n INTEGER := 0;
BEGIN
  SELECT * INTO m FROM public.meetups WHERE id = p_meetup;
  IF NOT FOUND OR m.status NOT IN ('open', 'closed') OR m.starts_at < NOW() THEN RETURN 0; END IF;
  v_free := m.capacity - (SELECT count(*) FROM public.meetup_rsvps WHERE meetup_id = p_meetup AND status = 'confirmed');
  IF v_free <= 0 THEN RETURN 0; END IF;
  WITH nxt AS (
    SELECT id FROM public.meetup_rsvps
    WHERE meetup_id = p_meetup AND status = 'waitlisted'
    ORDER BY waitlisted_at NULLS LAST, created_at
    LIMIT v_free
    FOR UPDATE
  )
  UPDATE public.meetup_rsvps r SET status = 'confirmed', decided_at = NOW(), updated_at = NOW()
  FROM nxt WHERE r.id = nxt.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.moim__promote(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.moim__questions(p JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE v JSONB := '[]'::jsonb; q JSONB; i INTEGER := 0;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN v; END IF;
  FOR q IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF i >= 5 THEN EXIT; END IF;
    IF char_length(btrim(COALESCE(q->>'label', ''))) BETWEEN 1 AND 120 THEN
      i := i + 1;
      v := v || jsonb_build_array(jsonb_build_object(
        'id', 'q' || i, 'label', btrim(q->>'label'),
        'required', COALESCE((q->>'required')::boolean, FALSE)));
    END IF;
  END LOOP;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.moim__questions(JSONB) FROM PUBLIC, anon, authenticated;

-- ---- Read RPCs ----------------------------------------------------------
-- p_tab: upcoming | past | mine (applied) | hosting
CREATE OR REPLACE FUNCTION public.moim_list(p_tab TEXT DEFAULT 'upcoming', p_group UUID DEFAULT NULL, p_limit INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF p_group IS NOT NULL AND NOT public.group__visible(p_group) THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(public.moim__json(x, v_me) ORDER BY
      CASE WHEN p_tab = 'past' THEN -extract(epoch FROM x.starts_at) ELSE extract(epoch FROM x.starts_at) END)
    FROM (
      SELECT m.* FROM public.meetups m
      WHERE (m.group_id IS NULL OR public.group__visible(m.group_id))
        AND (p_group IS NULL OR m.group_id = p_group)
        AND CASE
          WHEN p_tab = 'past' THEN m.status IN ('past', 'cancelled') OR m.starts_at < NOW()
          WHEN p_tab = 'mine' THEN EXISTS (SELECT 1 FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.member_id = v_me)
          WHEN p_tab = 'hosting' THEN public.moim__can_manage(m.id, v_me)
          ELSE m.status IN ('open', 'closed') AND m.starts_at >= NOW()
        END
      ORDER BY CASE WHEN p_tab = 'past' THEN -extract(epoch FROM m.starts_at) ELSE extract(epoch FROM m.starts_at) END
      LIMIT v_lim
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.moim_get(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); m public.meetups%ROWTYPE; v JSONB; v_manage BOOLEAN;
BEGIN
  SELECT * INTO m FROM public.meetups WHERE id = p_id;
  IF NOT FOUND OR (m.group_id IS NOT NULL AND NOT public.group__visible(m.group_id)) THEN
    RAISE EXCEPTION 'moim_not_found' USING ERRCODE = 'P0001';
  END IF;
  v_manage := public.moim__can_manage(m.id, v_me);
  v := public.moim__json(m, v_me);
  v := v || jsonb_build_object(
    'private', CASE WHEN public.moim__can_see_private(m.id, v_me) THEN (
        SELECT jsonb_build_object('venue_address', p.venue_address, 'map_url', p.map_url, 'meeting_url', p.meeting_url)
        FROM public.meetup_private p WHERE p.meetup_id = m.id) END,
    'attendees', COALESCE((
        SELECT jsonb_agg(public.api__author_json(r.member_id, r.posted_as) || jsonb_build_object('member_id', r.member_id) ORDER BY r.decided_at NULLS LAST, r.created_at)
        FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.status = 'confirmed'), '[]'::jsonb),
    'announcements', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'created_at', a.created_at) ORDER BY a.created_at DESC)
        FROM public.meetup_announcements a WHERE a.meetup_id = m.id), '[]'::jsonb),
    'applicants', CASE WHEN v_manage THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'member_id', r.member_id, 'status', r.status, 'answers', r.answers, 'note', r.note,
          'created_at', r.created_at, 'waitlisted_at', r.waitlisted_at,
          'author', public.api__author_json(r.member_id, r.posted_as))
          ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'waitlisted' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END,
                   r.waitlisted_at NULLS LAST, r.created_at)
        FROM public.meetup_rsvps r WHERE r.meetup_id = m.id), '[]'::jsonb) END
  );
  RETURN v;
END;
$$;

-- Groups I can host 모임 for (owner/mod).
CREATE OR REPLACE FUNCTION public.moim_host_options()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', g.id, 'slug', g.slug, 'name', g.name, 'emoji', g.emoji, 'role', gm.role) ORDER BY g.name), '[]'::jsonb)
  FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id
  WHERE gm.member_id = public.app__me() AND gm.status = 'active' AND gm.role IN ('owner', 'mod');
$$;

-- ---- Write RPCs ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.moim__validate(p JSONB, OUT v_title TEXT, OUT v_desc TEXT, OUT v_mode TEXT,
  OUT v_starts TIMESTAMPTZ, OUT v_ends TIMESTAMPTZ, OUT v_deadline TIMESTAMPTZ, OUT v_capacity INTEGER)
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
BEGIN
  v_title := btrim(COALESCE(p->>'title', ''));
  v_desc := btrim(COALESCE(p->>'description', ''));
  v_mode := COALESCE(p->>'mode', 'offline');
  IF char_length(v_title) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'moim_invalid_title' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_desc) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'moim_invalid_description' USING ERRCODE = 'P0001'; END IF;
  IF v_mode NOT IN ('offline', 'online') THEN RAISE EXCEPTION 'moim_invalid_mode' USING ERRCODE = 'P0001'; END IF;
  BEGIN
    v_starts := (p->>'starts_at')::timestamptz;
    v_ends := NULLIF(p->>'ends_at', '')::timestamptz;
    v_deadline := NULLIF(p->>'apply_deadline', '')::timestamptz;
    v_capacity := (p->>'capacity')::int;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'moim_invalid_time' USING ERRCODE = 'P0001';
  END;
  IF v_starts IS NULL THEN RAISE EXCEPTION 'moim_invalid_time' USING ERRCODE = 'P0001'; END IF;
  IF v_ends IS NOT NULL AND v_ends <= v_starts THEN RAISE EXCEPTION 'moim_invalid_time' USING ERRCODE = 'P0001'; END IF;
  IF v_deadline IS NOT NULL AND v_deadline > v_starts THEN RAISE EXCEPTION 'moim_invalid_deadline' USING ERRCODE = 'P0001'; END IF;
  IF v_capacity IS NULL OR v_capacity NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'moim_invalid_capacity' USING ERRCODE = 'P0001'; END IF;
  IF COALESCE(p->>'map_url', '') <> '' AND p->>'map_url' !~* '^https?://' THEN RAISE EXCEPTION 'moim_invalid_url' USING ERRCODE = 'P0001'; END IF;
  IF COALESCE(p->>'meeting_url', '') <> '' AND p->>'meeting_url' !~* '^https?://' THEN RAISE EXCEPTION 'moim_invalid_url' USING ERRCODE = 'P0001'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.moim__validate(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.moim_create(p JSONB)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := public.app__me();
  v RECORD;
  v_group UUID := NULLIF(p->>'group_id', '')::uuid;
  v_id UUID;
BEGIN
  SELECT * INTO v FROM public.moim__validate(p);
  IF v.v_starts < NOW() THEN RAISE EXCEPTION 'moim_invalid_time' USING ERRCODE = 'P0001'; END IF;
  IF v_group IS NOT NULL AND COALESCE(public.group__role(v_group, v_me), '') NOT IN ('owner', 'mod') THEN
    RAISE EXCEPTION 'moim_group_forbidden' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.meetups x WHERE x.host_id = v_me AND x.created_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'moim_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.meetups (title, description, mode, venue_name, starts_at, ends_at, capacity, apply_deadline,
    requires_approval, fee_note, host_id, posted_as, status, group_id, members_only, questions)
  VALUES (v.v_title, v.v_desc, v.v_mode, NULLIF(left(btrim(COALESCE(p->>'venue_name', '')), 120), ''),
    v.v_starts, v.v_ends, v.v_capacity, v.v_deadline,
    COALESCE((p->>'requires_approval')::boolean, FALSE),
    NULLIF(left(btrim(COALESCE(p->>'fee_note', '')), 200), ''), v_me, 'real', 'open', v_group,
    v_group IS NOT NULL AND COALESCE((p->>'members_only')::boolean, FALSE),
    public.moim__questions(p->'questions'))
  RETURNING id INTO v_id;
  INSERT INTO public.meetup_private (meetup_id, venue_address, map_url, meeting_url)
  VALUES (v_id, NULLIF(left(btrim(COALESCE(p->>'venue_address', '')), 300), ''),
          NULLIF(left(btrim(COALESCE(p->>'map_url', '')), 500), ''),
          NULLIF(left(btrim(COALESCE(p->>'meeting_url', '')), 500), ''));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.moim_update(p_id UUID, p JSONB)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v RECORD; m public.meetups%ROWTYPE; v_confirmed INTEGER;
BEGIN
  SELECT * INTO m FROM public.meetups WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.moim__can_manage(p_id, v_me) THEN RAISE EXCEPTION 'moim_forbidden' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v FROM public.moim__validate(p);
  SELECT count(*) INTO v_confirmed FROM public.meetup_rsvps WHERE meetup_id = p_id AND status = 'confirmed';
  IF v.v_capacity < v_confirmed THEN RAISE EXCEPTION 'moim_capacity_below_confirmed' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.meetups SET title = v.v_title, description = v.v_desc, mode = v.v_mode,
    venue_name = NULLIF(left(btrim(COALESCE(p->>'venue_name', '')), 120), ''),
    starts_at = v.v_starts, ends_at = v.v_ends, capacity = v.v_capacity, apply_deadline = v.v_deadline,
    requires_approval = COALESCE((p->>'requires_approval')::boolean, m.requires_approval),
    fee_note = NULLIF(left(btrim(COALESCE(p->>'fee_note', '')), 200), ''),
    members_only = m.group_id IS NOT NULL AND COALESCE((p->>'members_only')::boolean, m.members_only),
    questions = CASE WHEN p ? 'questions' THEN public.moim__questions(p->'questions') ELSE m.questions END,
    updated_at = NOW()
  WHERE id = p_id;
  INSERT INTO public.meetup_private (meetup_id, venue_address, map_url, meeting_url, updated_at)
  VALUES (p_id, NULLIF(left(btrim(COALESCE(p->>'venue_address', '')), 300), ''),
          NULLIF(left(btrim(COALESCE(p->>'map_url', '')), 500), ''),
          NULLIF(left(btrim(COALESCE(p->>'meeting_url', '')), 500), ''), NOW())
  ON CONFLICT (meetup_id) DO UPDATE SET venue_address = EXCLUDED.venue_address, map_url = EXCLUDED.map_url,
    meeting_url = EXCLUDED.meeting_url, updated_at = NOW();
  PERFORM public.moim__promote(p_id);
  RETURN public.moim_get(p_id);
END;
$$;

-- open | closed | cancelled
CREATE OR REPLACE FUNCTION public.moim_set_status(p_id UUID, p_status TEXT)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  IF NOT public.moim__can_manage(p_id, v_me) THEN RAISE EXCEPTION 'moim_forbidden' USING ERRCODE = 'P0001'; END IF;
  IF p_status NOT IN ('open', 'closed', 'cancelled') THEN RAISE EXCEPTION 'moim_invalid_status' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.meetups SET status = p_status, updated_at = NOW(),
    cancelled_at = CASE WHEN p_status = 'cancelled' THEN NOW() ELSE NULL END
  WHERE id = p_id AND status <> 'cancelled';
  RETURN p_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.moim_apply(p_id UUID, p_answers JSONB DEFAULT '{}'::jsonb, p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := public.app__me();
  m public.meetups%ROWTYPE;
  q JSONB;
  v_answers JSONB := '{}'::jsonb;
  v_ans TEXT;
  v_existing public.meetup_rsvps%ROWTYPE;
  v_status TEXT;
  v_has_row BOOLEAN;
BEGIN
  SELECT * INTO m FROM public.meetups WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR (m.group_id IS NOT NULL AND NOT public.group__visible(m.group_id)) THEN
    RAISE EXCEPTION 'moim_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF m.status <> 'open' OR m.starts_at < NOW() THEN RAISE EXCEPTION 'moim_closed' USING ERRCODE = 'P0001'; END IF;
  IF m.apply_deadline IS NOT NULL AND m.apply_deadline < NOW() THEN RAISE EXCEPTION 'moim_deadline_passed' USING ERRCODE = 'P0001'; END IF;
  IF m.host_id = v_me THEN RAISE EXCEPTION 'moim_host_cannot_apply' USING ERRCODE = 'P0001'; END IF;
  IF m.members_only AND m.group_id IS NOT NULL AND public.group__role(m.group_id, v_me) IS NULL THEN
    RAISE EXCEPTION 'moim_members_only' USING ERRCODE = 'P0001';
  END IF;
  FOR q IN SELECT * FROM jsonb_array_elements(m.questions) LOOP
    v_ans := left(btrim(COALESCE(p_answers->>(q->>'id'), '')), 500);
    IF COALESCE((q->>'required')::boolean, FALSE) AND v_ans = '' THEN
      RAISE EXCEPTION 'moim_answer_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_ans <> '' THEN v_answers := v_answers || jsonb_build_object(q->>'id', v_ans); END IF;
  END LOOP;

  SELECT * INTO v_existing FROM public.meetup_rsvps WHERE meetup_id = p_id AND member_id = v_me;
  v_has_row := FOUND;
  IF v_has_row AND v_existing.status IN ('pending', 'confirmed', 'waitlisted') THEN
    RETURN jsonb_build_object('status', v_existing.status, 'already', TRUE);
  END IF;
  IF v_has_row AND v_existing.status = 'rejected' THEN RAISE EXCEPTION 'moim_rejected' USING ERRCODE = 'P0001'; END IF;

  IF m.requires_approval THEN v_status := 'pending';
  ELSIF (SELECT count(*) FROM public.meetup_rsvps WHERE meetup_id = p_id AND status = 'confirmed') < m.capacity THEN v_status := 'confirmed';
  ELSE v_status := 'waitlisted';
  END IF;

  IF v_has_row THEN
    UPDATE public.meetup_rsvps SET status = v_status, answers = v_answers,
      note = NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''), posted_as = 'real', nickname_profile_id = NULL,
      waitlisted_at = CASE WHEN v_status = 'waitlisted' THEN NOW() END,
      decided_at = CASE WHEN v_status = 'confirmed' THEN NOW() END, updated_at = NOW()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.meetup_rsvps (meetup_id, member_id, posted_as, status, note, answers, waitlisted_at, decided_at)
    VALUES (p_id, v_me, 'real', v_status, NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''), v_answers,
            CASE WHEN v_status = 'waitlisted' THEN NOW() END, CASE WHEN v_status = 'confirmed' THEN NOW() END);
  END IF;
  RETURN jsonb_build_object('status', v_status, 'already', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.moim_cancel_rsvp(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_prev TEXT; v_promoted INTEGER := 0;
BEGIN
  PERFORM 1 FROM public.meetups WHERE id = p_id FOR UPDATE;
  SELECT status INTO v_prev FROM public.meetup_rsvps WHERE meetup_id = p_id AND member_id = v_me;
  IF v_prev IS NULL OR v_prev NOT IN ('pending', 'confirmed', 'waitlisted') THEN
    RAISE EXCEPTION 'moim_rsvp_not_found' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.meetup_rsvps SET status = 'cancelled', updated_at = NOW() WHERE meetup_id = p_id AND member_id = v_me;
  IF v_prev = 'confirmed' THEN v_promoted := public.moim__promote(p_id); END IF;
  RETURN jsonb_build_object('status', 'cancelled', 'promoted', v_promoted);
END;
$$;

-- approve | waitlist | reject | remove
CREATE OR REPLACE FUNCTION public.moim_decide(p_rsvp UUID, p_action TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := public.app__me();
  r public.meetup_rsvps%ROWTYPE;
  m public.meetups%ROWTYPE;
  v_new TEXT;
  v_promoted INTEGER := 0;
BEGIN
  SELECT * INTO r FROM public.meetup_rsvps WHERE id = p_rsvp;
  IF NOT FOUND OR NOT public.moim__can_manage(r.meetup_id, v_me) THEN RAISE EXCEPTION 'moim_forbidden' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO m FROM public.meetups WHERE id = r.meetup_id FOR UPDATE;
  SELECT * INTO r FROM public.meetup_rsvps WHERE id = p_rsvp FOR UPDATE;
  IF p_action = 'approve' AND r.status IN ('pending', 'waitlisted') THEN
    IF (SELECT count(*) FROM public.meetup_rsvps WHERE meetup_id = m.id AND status = 'confirmed') < m.capacity THEN
      v_new := 'confirmed';
    ELSIF r.status = 'pending' THEN
      v_new := 'waitlisted';
    ELSE
      RAISE EXCEPTION 'moim_full' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_action = 'waitlist' AND r.status = 'pending' THEN v_new := 'waitlisted';
  ELSIF p_action = 'reject' AND r.status IN ('pending', 'waitlisted') THEN v_new := 'rejected';
  ELSIF p_action = 'remove' AND r.status = 'confirmed' THEN v_new := 'rejected';
  ELSE RAISE EXCEPTION 'moim_invalid_action' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.meetup_rsvps SET status = v_new, decided_at = NOW(), updated_at = NOW(),
    waitlisted_at = CASE WHEN v_new = 'waitlisted' THEN NOW() ELSE waitlisted_at END
  WHERE id = p_rsvp;
  IF r.status = 'confirmed' THEN v_promoted := public.moim__promote(m.id); END IF;
  RETURN jsonb_build_object('status', v_new, 'promoted', v_promoted);
END;
$$;

CREATE OR REPLACE FUNCTION public.moim_announce(p_id UUID, p_body TEXT)
RETURNS UUID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_id UUID;
BEGIN
  IF NOT public.moim__can_manage(p_id, v_me) THEN RAISE EXCEPTION 'moim_forbidden' USING ERRCODE = 'P0001'; END IF;
  IF char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'moim_invalid_body' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.meetup_announcements (meetup_id, body) VALUES (p_id, btrim(p_body)) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. MCP read tools (no private location, no write tools for 모임)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mcp_moim__json(m public.meetups, p_viewer UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT (public.moim__json(m, p_viewer) - 'questions' - 'can_manage' - 'host_id' - 'my_rsvp')
    || jsonb_build_object('question_count', jsonb_array_length(m.questions),
         'my_status', (SELECT r.status FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.member_id = p_viewer),
         'location_note', '정확한 장소/링크는 확정 참석자에게만 웹에서 공개됩니다.');
$$;
REVOKE ALL ON FUNCTION public.mcp_moim__json(public.meetups, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mcp_meetups(p_token TEXT, p_tab TEXT DEFAULT 'upcoming', p_limit INTEGER DEFAULT 20, p_group TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE; v_group UUID;
BEGIN
  t := public.api__token(p_token, ARRAY['meetups_read', 'meetups_write']);
  IF p_group IS NOT NULL AND p_group <> '' THEN
    SELECT g.id INTO v_group FROM public.groups g
    WHERE (g.slug = lower(p_group) OR g.id::text = p_group)
      AND (NOT g.is_hidden OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = g.id AND gm.member_id = t.member_id));
    IF v_group IS NULL THEN RETURN '[]'::jsonb; END IF;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(public.mcp_moim__json(x, t.member_id) ORDER BY
      CASE WHEN p_tab = 'past' THEN -extract(epoch FROM x.starts_at) ELSE extract(epoch FROM x.starts_at) END)
    FROM (
      SELECT m.* FROM public.meetups m
      LEFT JOIN public.groups g ON g.id = m.group_id
      WHERE (m.group_id IS NULL OR NOT g.is_hidden
             OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = m.group_id AND gm.member_id = t.member_id))
        AND (v_group IS NULL OR m.group_id = v_group)
        AND CASE
          WHEN p_tab = 'past' THEN m.status IN ('past', 'cancelled') OR m.starts_at < NOW()
          WHEN p_tab = 'mine' THEN EXISTS (SELECT 1 FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.member_id = t.member_id)
          ELSE m.status IN ('open', 'closed') AND m.starts_at >= NOW()
        END
      ORDER BY CASE WHEN p_tab = 'past' THEN -extract(epoch FROM m.starts_at) ELSE extract(epoch FROM m.starts_at) END
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_meetup_get(p_token TEXT, p_meetup_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE; m public.meetups%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['meetups_read', 'meetups_write']);
  SELECT * INTO m FROM public.meetups x WHERE x.id = p_meetup_id;
  IF NOT FOUND OR (m.group_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = m.group_id AND g.is_hidden)
                   AND NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = m.group_id AND gm.member_id = t.member_id)) THEN
    RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.mcp_moim__json(m, t.member_id)
    || jsonb_build_object('questions', COALESCE((SELECT jsonb_agg(q->>'label') FROM jsonb_array_elements(m.questions) q), '[]'::jsonb));
END;
$$;

-- My groups (metadata only; group timelines are never exposed to agents).
CREATE OR REPLACE FUNCTION public.mcp_my_groups(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['meetups_read', 'posts_read']);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('slug', g.slug, 'name', g.name, 'description', g.description, 'emoji', g.emoji,
      'role', gm.role, 'member_count', g.member_count, 'join_policy', g.join_policy, 'is_hidden', g.is_hidden,
      'upcoming_moim', (SELECT count(*) FROM public.meetups m WHERE m.group_id = g.id AND m.status = 'open' AND m.starts_at >= NOW()))
      ORDER BY g.name)
    FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.member_id = t.member_id AND gm.status = 'active'
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'group_create(text,text,text,text,text,boolean)', 'group_update(uuid,text,text,text,text,boolean)',
    'group_join(uuid,text)', 'group_leave(uuid)', 'group_decide(uuid,uuid,boolean)', 'group_invite(uuid,uuid)',
    'group_set_role(uuid,uuid,text)', 'group_remove(uuid,uuid)', 'group_delete(uuid)',
    'moim_list(text,uuid,integer)', 'moim_get(uuid)', 'moim_host_options()', 'moim_create(jsonb)',
    'moim_update(uuid,jsonb)', 'moim_set_status(uuid,text)', 'moim_apply(uuid,jsonb,text)',
    'moim_cancel_rsvp(uuid)', 'moim_decide(uuid,text)', 'moim_announce(uuid,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  -- Token RPCs: callable by anon (the API route uses the anon key + token).
  FOREACH f IN ARRAY ARRAY['mcp_meetups(text,text,integer,text)', 'mcp_meetup_get(text,uuid)', 'mcp_my_groups(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END $$;
