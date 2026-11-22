-- =====================================================================
-- 0004_feed_timeline_mcp.sql
--  1) Human feed → Threads-style timeline on top of public.posts
--     (short posts, threaded replies as posts rows, likes with liker_type)
--     + per-post agent interaction setting ('humans_only' | 'agents_allowed').
--     Agents can reply/like ONLY on threads whose root allows agents, and can
--     NEVER create root posts. Data from post_votes / post_comments migrated.
--  2) Token-verified SECURITY DEFINER RPCs for the remaining MCP tools
--     (posts, archive, meetups, products, toolbox). No service-role key.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. posts → timeline columns
-- ---------------------------------------------------------------------
ALTER TABLE public.posts ALTER COLUMN title SET DEFAULT '';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS root_id UUID REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS agent_interaction TEXT NOT NULL DEFAULT 'humans_only';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_kind TEXT NOT NULL DEFAULT 'member';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS agent_token_id UUID REFERENCES public.api_tokens(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS agent_model TEXT;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_agent_interaction_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_agent_interaction_check
  CHECK (agent_interaction IN ('humans_only', 'agents_allowed'));
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_author_kind_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_author_kind_check
  CHECK (author_kind IN ('member', 'agent'));
-- Agents can never author a root (human-feed) post.
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_agent_only_replies;
ALTER TABLE public.posts ADD CONSTRAINT posts_agent_only_replies
  CHECK (author_kind = 'member' OR (parent_id IS NOT NULL AND agent_token_id IS NOT NULL AND agent_name IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_posts_root_feed ON public.posts(created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_parent ON public.posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_posts_root ON public.posts(root_id);
CREATE INDEX IF NOT EXISTS idx_posts_agent_token ON public.posts(agent_token_id, created_at);

INSERT INTO public.site_config (key, value) VALUES
  ('feed_post_max_chars', '500'),
  ('feed_agent_daily_reply_limit', '100'),
  ('feed_agent_daily_like_limit', '300')
ON CONFLICT (key) DO NOTHING;

-- Guard: new rows are short, replies inherit root, clients cannot forge agent rows.
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
      NEW.agent_interaction := 'humans_only';
    ELSE
      NEW.root_id := NULL;
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
       OR NEW.author_id IS DISTINCT FROM OLD.author_id
       OR NEW.like_count IS DISTINCT FROM OLD.like_count
       OR NEW.reply_count IS DISTINCT FROM OLD.reply_count THEN
      RAISE EXCEPTION 'feed_immutable_field' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.author_kind = 'agent' AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title) THEN
      RAISE EXCEPTION 'feed_agent_row_readonly' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_timeline_guard_trigger ON public.posts;
CREATE TRIGGER posts_timeline_guard_trigger
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_timeline_guard();

CREATE OR REPLACE FUNCTION public.posts_reply_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE public.posts SET reply_count = reply_count + 1
      WHERE id = NEW.parent_id OR (id = NEW.root_id AND NEW.root_id <> NEW.parent_id);
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE public.posts SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = OLD.parent_id OR (id = OLD.root_id AND OLD.root_id <> OLD.parent_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS posts_reply_counter_trigger ON public.posts;
CREATE TRIGGER posts_reply_counter_trigger
  AFTER INSERT OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_reply_counter();

-- Re-create insert policy: members insert member rows for themselves only.
DROP POLICY IF EXISTS posts_insert ON public.posts;
CREATE POLICY posts_insert ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_completed_member())
    AND author_id = (SELECT public.current_member_id())
    AND author_kind = 'member'
    AND agent_token_id IS NULL
  );

-- ---------------------------------------------------------------------
-- 2. post_likes (liker_type member|agent) — shared shape with agora_likes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  liker_type TEXT NOT NULL CHECK (liker_type IN ('member', 'agent')),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_id UUID REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (liker_type = 'member' AND token_id IS NULL)
    OR (liker_type = 'agent' AND token_id IS NOT NULL AND agent_name IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_likes_member ON public.post_likes(post_id, member_id) WHERE liker_type = 'member';
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_likes_agent ON public.post_likes(post_id, token_id) WHERE liker_type = 'agent';
CREATE INDEX IF NOT EXISTS idx_post_likes_member ON public.post_likes(member_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_token_created ON public.post_likes(token_id, created_at);

CREATE OR REPLACE FUNCTION public.post_like_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS post_likes_count_trigger ON public.post_likes;
CREATE TRIGGER post_likes_count_trigger
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.post_like_counter();

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_likes_select ON public.post_likes;
CREATE POLICY post_likes_select ON public.post_likes
  FOR SELECT TO authenticated USING ((SELECT public.is_completed_member()));
DROP POLICY IF EXISTS post_likes_insert_member ON public.post_likes;
CREATE POLICY post_likes_insert_member ON public.post_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    liker_type = 'member' AND token_id IS NULL
    AND member_id = (SELECT public.current_member_id())
    AND (SELECT public.is_completed_member())
  );
DROP POLICY IF EXISTS post_likes_delete_member ON public.post_likes;
CREATE POLICY post_likes_delete_member ON public.post_likes
  FOR DELETE TO authenticated
  USING (liker_type = 'member' AND member_id = (SELECT public.current_member_id()));
REVOKE ALL ON public.post_likes FROM anon;
REVOKE UPDATE, TRUNCATE ON public.post_likes FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;

REVOKE ALL ON FUNCTION public.post_like_counter() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.posts_reply_counter() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.posts_timeline_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Data migration (idempotent): votes → likes, comments → reply posts
-- ---------------------------------------------------------------------
INSERT INTO public.post_likes (post_id, liker_type, member_id, created_at)
SELECT v.post_id, 'member', v.member_id, v.created_at
FROM public.post_votes v
WHERE NOT EXISTS (
  SELECT 1 FROM public.post_likes l
  WHERE l.post_id = v.post_id AND l.member_id = v.member_id AND l.liker_type = 'member'
);

INSERT INTO public.posts (id, title, content, author_id, posted_as, nickname_profile_id, parent_id, created_at, updated_at)
SELECT c.id, '', left(c.body, 500), c.member_id, c.posted_as, c.nickname_profile_id, c.post_id, c.created_at, c.updated_at
FROM public.post_comments c
WHERE NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = c.id)
  AND btrim(c.body) <> '';

-- Recompute counters from source of truth.
UPDATE public.posts p SET
  like_count = (SELECT count(*) FROM public.post_likes l WHERE l.post_id = p.id),
  reply_count = (SELECT count(*) FROM public.posts r WHERE r.parent_id = p.id OR (r.root_id = p.id AND r.parent_id <> p.id));

-- ---------------------------------------------------------------------
-- 4. Shared token helper for MCP/CLI RPCs (any-of scopes)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.api__token(p_token TEXT, p_scopes TEXT[])
RETURNS public.api_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = t.id;
  RETURN t;
END;
$$;

-- Public author JSON for a member under the nickname rules (never leaks member id for nickname).
CREATE OR REPLACE FUNCTION public.api__author_json(p_member_id UUID, p_posted_as TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_posted_as = 'nickname' AND m.nickname IS NOT NULL THEN
      jsonb_build_object('kind', 'nickname', 'id', 'nick_' || left(replace(m.id::text, '-', ''), 16),
                         'name', m.nickname, 'avatar_url', m.nickname_avatar_url)
    ELSE jsonb_build_object('kind', 'real', 'id', m.id, 'name', m.display_name, 'avatar_url', m.avatar_url)
  END
  FROM public.members m WHERE m.id = p_member_id;
$$;

CREATE OR REPLACE FUNCTION public.feed__post_json(p public.posts)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'parent_id', p.parent_id,
    'root_id', p.root_id,
    'author', CASE WHEN p.author_kind = 'agent'
      THEN jsonb_build_object('kind', 'agent', 'name', p.agent_name, 'model', p.agent_model,
             'owner', (SELECT m.display_name FROM public.members m WHERE m.id = p.author_id))
      ELSE public.api__author_json(p.author_id, p.posted_as) END,
    'title', NULLIF(p.title, ''),
    'body', p.content,
    'url', p.url,
    'link_title', p.link_title,
    'link_description', p.link_description,
    'agent_interaction', p.agent_interaction,
    'like_count', p.like_count,
    'reply_count', p.reply_count,
    'created_at', p.created_at
  );
$$;

-- ---------------------------------------------------------------------
-- 5. Feed RPCs for agents (reads: posts_read|feed:interact, writes: feed:interact)
-- ---------------------------------------------------------------------
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
      WHERE parent_id IS NULL AND is_hidden = FALSE
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
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE;
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
  SELECT * INTO parent FROM public.posts WHERE id = p_parent_id AND is_hidden = FALSE;
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
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE;
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

-- ---------------------------------------------------------------------
-- 6. Archive (owner-scoped) RPCs
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive__item_json(i public.brain_archive_items)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(i) || jsonb_build_object(
    'collection_ids', COALESCE((SELECT jsonb_agg(ci.collection_id) FROM public.brain_archive_collection_items ci WHERE ci.item_id = i.id), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.mcp_archive_list(
  p_token TEXT, p_query TEXT DEFAULT NULL, p_type TEXT DEFAULT NULL, p_tag TEXT DEFAULT NULL,
  p_collection_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['archive_read', 'archive_write']);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'source_type', i.source_type,
             'summary', i.summary, 'tags', i.tags, 'source_url', i.source_url, 'created_at', i.created_at)
             ORDER BY i.created_at DESC)
    FROM (
      SELECT * FROM public.brain_archive_items b
      WHERE b.owner_id = t.member_id
        AND (p_type IS NULL OR p_type = '' OR b.source_type = p_type)
        AND (p_tag IS NULL OR p_tag = '' OR p_tag = ANY(b.tags))
        AND (p_collection_id IS NULL OR EXISTS (
              SELECT 1 FROM public.brain_archive_collection_items ci
              WHERE ci.item_id = b.id AND ci.collection_id = p_collection_id))
        AND (p_query IS NULL OR p_query = '' OR
             concat_ws(' ', b.title, b.summary, b.content_text, b.extracted_text, b.note, array_to_string(b.tags, ' '))
               ILIKE '%' || p_query || '%')
      ORDER BY b.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    ) i
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_archive_get(p_token TEXT, p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  i public.brain_archive_items%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['archive_read', 'archive_write']);
  SELECT * INTO i FROM public.brain_archive_items b
  WHERE b.id = p_item_id AND (b.owner_id = t.member_id OR EXISTS (
    SELECT 1 FROM public.brain_archive_collection_items ci
    JOIN public.archive_collections c ON c.id = ci.collection_id
    WHERE ci.item_id = b.id AND c.is_shared));
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN public.archive__item_json(i);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_collections(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['archive_read', 'archive_write']);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object('item_count',
             (SELECT count(*) FROM public.brain_archive_collection_items ci WHERE ci.collection_id = c.id))
             ORDER BY c.created_at DESC)
    FROM public.archive_collections c WHERE c.owner_id = t.member_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_collection_get(p_token TEXT, p_collection_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  c public.archive_collections%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['archive_read', 'archive_write']);
  SELECT * INTO c FROM public.archive_collections
  WHERE id = p_collection_id AND (owner_id = t.member_id OR is_shared);
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object(
    'collection', to_jsonb(c),
    'items', COALESCE((
      SELECT jsonb_agg(public.archive__item_json(i) ORDER BY i.created_at DESC)
      FROM public.brain_archive_items i
      JOIN public.brain_archive_collection_items ci ON ci.item_id = i.id
      WHERE ci.collection_id = c.id
    ), '[]'::jsonb)
  );
END;
$$;

-- Save a feed post (or link post) into the token owner's archive.
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
  SELECT * INTO p FROM public.posts WHERE id = p_post_id AND is_hidden = FALSE;
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
-- 7. Meetups
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meetup__json(m public.meetups, p_viewer UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'title', m.title, 'description', m.description, 'mode', m.mode,
    'venue_name', m.venue_name, 'starts_at', m.starts_at, 'ends_at', m.ends_at,
    'capacity', m.capacity, 'apply_deadline', m.apply_deadline,
    'requires_approval', m.requires_approval, 'status', m.status, 'fee_note', m.fee_note,
    'host', public.api__author_json(m.host_id, m.posted_as),
    'confirmed', (SELECT count(*) FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.status = 'confirmed'),
    'waitlisted', (SELECT count(*) FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.status = 'waitlisted'),
    'my_rsvp', (SELECT r.status FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.member_id = p_viewer
                AND r.status NOT IN ('cancelled', 'rejected') ORDER BY r.created_at DESC LIMIT 1),
    'meeting_url', CASE WHEN m.mode = 'online' AND (m.host_id = p_viewer OR EXISTS (
        SELECT 1 FROM public.meetup_rsvps r WHERE r.meetup_id = m.id AND r.member_id = p_viewer AND r.status = 'confirmed'))
      THEN m.meeting_url END
  );
$$;

CREATE OR REPLACE FUNCTION public.mcp_meetups(p_token TEXT, p_tab TEXT DEFAULT 'upcoming', p_limit INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['meetups_read', 'meetups_write']);
  RETURN COALESCE((
    SELECT jsonb_agg(public.meetup__json(m, t.member_id) ORDER BY
             CASE WHEN p_tab = 'past' THEN -extract(epoch FROM m.starts_at) ELSE extract(epoch FROM m.starts_at) END)
    FROM (
      SELECT * FROM public.meetups x
      WHERE CASE WHEN p_tab = 'past'
              THEN x.status IN ('past', 'cancelled') OR x.starts_at < NOW()
              ELSE x.status IN ('open', 'closed') AND x.starts_at >= NOW() END
      ORDER BY CASE WHEN p_tab = 'past' THEN -extract(epoch FROM x.starts_at) ELSE extract(epoch FROM x.starts_at) END
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) m
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_meetup_get(p_token TEXT, p_meetup_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  m public.meetups%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['meetups_read', 'meetups_write']);
  SELECT * INTO m FROM public.meetups WHERE id = p_meetup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN public.meetup__json(m, t.member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_meetup_create(p_token TEXT, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_posted_as TEXT := COALESCE(p_payload->>'posted_as', 'real');
  v_mode TEXT := COALESCE(p_payload->>'mode', 'offline');
  v_title TEXT := btrim(COALESCE(p_payload->>'title', ''));
  v_desc TEXT := btrim(COALESCE(p_payload->>'description', ''));
  v_starts TIMESTAMPTZ;
  v_capacity INTEGER;
  m public.meetups%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['meetups_write']);
  IF char_length(v_title) NOT BETWEEN 2 AND 120 OR char_length(v_desc) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'api_invalid:title/description' USING ERRCODE = 'P0001';
  END IF;
  IF v_mode NOT IN ('offline', 'online') OR v_posted_as NOT IN ('real', 'nickname') THEN
    RAISE EXCEPTION 'api_invalid:mode/posted_as' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    v_starts := (p_payload->>'starts_at')::timestamptz;
    v_capacity := (p_payload->>'capacity')::int;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'api_invalid:starts_at/capacity' USING ERRCODE = 'P0001';
  END;
  IF v_starts IS NULL OR v_starts < NOW() OR v_capacity IS NULL OR v_capacity NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'api_invalid:starts_at/capacity' USING ERRCODE = 'P0001';
  END IF;
  IF v_posted_as = 'nickname' AND NOT EXISTS (SELECT 1 FROM public.members WHERE id = t.member_id AND nickname IS NOT NULL) THEN
    RAISE EXCEPTION 'api_nickname_missing' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.meetups (title, description, mode, venue_name, meeting_url, starts_at, capacity,
                              requires_approval, host_id, posted_as, nickname_profile_id, status)
  VALUES (v_title, v_desc, v_mode, left(p_payload->>'venue_name', 200),
          CASE WHEN p_payload->>'meeting_url' ~* '^https?://' THEN left(p_payload->>'meeting_url', 500) END,
          v_starts, v_capacity, COALESCE((p_payload->>'requires_approval')::boolean, FALSE),
          t.member_id, v_posted_as,
          CASE WHEN v_posted_as = 'nickname' THEN 'nick_' || left(replace(t.member_id::text, '-', ''), 16) END,
          'open')
  RETURNING * INTO m;
  RETURN public.meetup__json(m, t.member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_meetup_rsvp(
  p_token TEXT, p_meetup_id UUID, p_action TEXT, p_note TEXT DEFAULT NULL, p_posted_as TEXT DEFAULT 'real'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  m public.meetups%ROWTYPE;
  v_confirmed INTEGER;
  v_status TEXT;
  v_rsvp public.meetup_rsvps%ROWTYPE;
  v_freed BOOLEAN;
  v_next UUID;
BEGIN
  t := public.api__token(p_token, ARRAY['meetups_write']);
  SELECT * INTO m FROM public.meetups WHERE id = p_meetup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;

  IF p_action = 'apply' THEN
    IF m.status IN ('cancelled', 'closed', 'past') OR m.starts_at < NOW()
       OR (m.apply_deadline IS NOT NULL AND m.apply_deadline < NOW()) THEN
      RAISE EXCEPTION 'meetup_closed' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.meetup_rsvps WHERE meetup_id = m.id AND member_id = t.member_id
               AND status NOT IN ('cancelled', 'rejected')) THEN
      RAISE EXCEPTION 'meetup_already_applied' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(p_posted_as, 'real') NOT IN ('real', 'nickname') THEN
      RAISE EXCEPTION 'api_invalid:posted_as' USING ERRCODE = 'P0001';
    END IF;
    IF p_posted_as = 'nickname' AND NOT EXISTS (SELECT 1 FROM public.members WHERE id = t.member_id AND nickname IS NOT NULL) THEN
      RAISE EXCEPTION 'api_nickname_missing' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO v_confirmed FROM public.meetup_rsvps WHERE meetup_id = m.id AND status = 'confirmed';
    v_status := CASE WHEN m.requires_approval THEN 'pending'
                     WHEN v_confirmed < m.capacity THEN 'confirmed' ELSE 'waitlisted' END;
    INSERT INTO public.meetup_rsvps (meetup_id, member_id, posted_as, nickname_profile_id, status, note)
    VALUES (m.id, t.member_id, COALESCE(p_posted_as, 'real'),
            CASE WHEN p_posted_as = 'nickname' THEN 'nick_' || left(replace(t.member_id::text, '-', ''), 16) END,
            v_status, left(p_note, 500))
    RETURNING * INTO v_rsvp;
    RETURN jsonb_build_object('rsvp', jsonb_build_object('id', v_rsvp.id, 'status', v_rsvp.status));
  ELSIF p_action = 'cancel' THEN
    v_freed := EXISTS (SELECT 1 FROM public.meetup_rsvps WHERE meetup_id = m.id AND member_id = t.member_id AND status = 'confirmed');
    UPDATE public.meetup_rsvps SET status = 'cancelled', updated_at = NOW()
      WHERE meetup_id = m.id AND member_id = t.member_id AND status IN ('confirmed', 'waitlisted', 'pending');
    IF v_freed THEN
      SELECT count(*) INTO v_confirmed FROM public.meetup_rsvps WHERE meetup_id = m.id AND status = 'confirmed';
      IF v_confirmed < m.capacity THEN
        SELECT id INTO v_next FROM public.meetup_rsvps WHERE meetup_id = m.id AND status = 'waitlisted'
          ORDER BY created_at LIMIT 1;
        IF v_next IS NOT NULL THEN
          UPDATE public.meetup_rsvps SET status = 'confirmed', updated_at = NOW() WHERE id = v_next;
        END IF;
      END IF;
    END IF;
    RETURN jsonb_build_object('success', TRUE);
  END IF;
  RAISE EXCEPTION 'api_invalid:action' USING ERRCODE = 'P0001';
END;
$$;

-- ---------------------------------------------------------------------
-- 8. Products
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product__json(p public.products, p_since TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'name', p.name, 'tagline', p.tagline, 'description', p.description,
    'website_url', p.website_url, 'github_url', p.github_url, 'tags', p.tags,
    'featured', p.featured, 'launched_at', p.launched_at, 'created_at', p.created_at,
    'upvotes', (SELECT count(*) FROM public.product_upvotes u WHERE u.product_id = p.id
                AND (p_since IS NULL OR u.created_at >= p_since)),
    'makers', COALESCE((SELECT jsonb_agg(public.api__author_json(mid, 'real'))
                        FROM unnest(COALESCE(p.maker_ids, ARRAY[]::UUID[])) mid), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.mcp_products(p_token TEXT, p_window TEXT DEFAULT 'all', p_limit INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_since TIMESTAMPTZ := CASE p_window
    WHEN 'today' THEN date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
    WHEN 'week' THEN NOW() - INTERVAL '7 days' ELSE NULL END;
BEGIN
  t := public.api__token(p_token, ARRAY['products_read', 'products_write']);
  RETURN COALESCE((
    SELECT jsonb_agg(s.j ORDER BY (s.j->>'upvotes')::int DESC, s.created_at DESC)
    FROM (
      SELECT public.product__json(p, v_since) j, p.created_at FROM public.products p
      ORDER BY (SELECT count(*) FROM public.product_upvotes u WHERE u.product_id = p.id
                AND (v_since IS NULL OR u.created_at >= v_since)) DESC, p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) s
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_product_get(p_token TEXT, p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  p public.products%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['products_read', 'products_write']);
  SELECT * INTO p FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN public.product__json(p, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_product_create(p_token TEXT, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_name TEXT := btrim(COALESCE(p_payload->>'name', ''));
  v_tagline TEXT := btrim(COALESCE(p_payload->>'tagline', ''));
  v_desc TEXT := btrim(COALESCE(p_payload->>'description', ''));
  p public.products%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['products_write']);
  IF char_length(v_name) NOT BETWEEN 1 AND 80 OR char_length(v_tagline) NOT BETWEEN 1 AND 140
     OR char_length(v_desc) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'api_invalid:name/tagline/description' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.products (name, tagline, description, website_url, github_url, tags, maker_ids, launched_at)
  VALUES (v_name, v_tagline, v_desc,
          CASE WHEN p_payload->>'website_url' ~* '^https?://' THEN left(p_payload->>'website_url', 500) END,
          CASE WHEN p_payload->>'github_url' ~* '^https?://' THEN left(p_payload->>'github_url', 500) END,
          ARRAY(SELECT DISTINCT left(lower(btrim(x)), 30) FROM jsonb_array_elements_text(COALESCE(p_payload->'tags', '[]'::jsonb)) x
                WHERE btrim(x) <> '' LIMIT 10),
          ARRAY[t.member_id], NOW())
  RETURNING * INTO p;
  RETURN public.product__json(p, NULL);
END;
$$;

-- ---------------------------------------------------------------------
-- 9. Toolbox
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mcp_toolbox_list(
  p_token TEXT, p_type TEXT DEFAULT NULL, p_tag TEXT DEFAULT NULL, p_query TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'trending', p_limit INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['toolbox_read', 'toolbox_write']);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(e) - 'created_by_id' ORDER BY e.rk)
    FROM (
      SELECT x.*, row_number() OVER (ORDER BY
        CASE p_sort
          WHEN 'rated' THEN COALESCE(x.avg_rating, 0) * 1000 + COALESCE(x.rating_count, 0)
          WHEN 'mentions' THEN COALESCE(x.mention_count, 0)
          WHEN 'installs' THEN COALESCE(x.install_count, 0)
          WHEN 'newest' THEN extract(epoch FROM x.created_at)
          ELSE COALESCE(x.mention_count, 0) * 2 + COALESCE(x.install_count, 0) + COALESCE(x.avg_rating, 0) * COALESCE(x.rating_count, 0)
               + CASE WHEN x.featured THEN 5 ELSE 0 END
        END DESC, x.created_at DESC) rk
      FROM public.toolbox_entries x
      WHERE (p_type IS NULL OR p_type = '' OR x.type = p_type)
        AND (p_tag IS NULL OR p_tag = '' OR p_tag = ANY(x.tags))
        AND (p_query IS NULL OR p_query = '' OR concat_ws(' ', x.name, x.one_liner, x.description, array_to_string(x.tags, ' '))
             ILIKE '%' || p_query || '%')
      ORDER BY rk
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
    ) e
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_toolbox_get(p_token TEXT, p_entry TEXT, p_record_install BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  e public.toolbox_entries%ROWTYPE;
BEGIN
  IF p_record_install THEN
    t := public.api__token(p_token, ARRAY['toolbox_write']);
  ELSE
    t := public.api__token(p_token, ARRAY['toolbox_read', 'toolbox_write']);
  END IF;
  SELECT * INTO e FROM public.toolbox_entries
  WHERE slug = p_entry OR id::text = p_entry LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  IF p_record_install THEN
    UPDATE public.toolbox_entries SET install_count = COALESCE(install_count, 0) + 1
      WHERE id = e.id RETURNING * INTO e;
  END IF;
  RETURN to_jsonb(e) - 'created_by_id';
END;
$$;

-- The app normalises the URL/slug/snippets with the shared pure rules and
-- passes them here; the DB merges by canonical_url.
CREATE OR REPLACE FUNCTION public.mcp_toolbox_create(p_token TEXT, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  e public.toolbox_entries%ROWTYPE;
  v_url TEXT := btrim(COALESCE(p_payload->>'canonical_url', ''));
  v_name TEXT := btrim(COALESCE(p_payload->>'name', ''));
  v_one TEXT := btrim(COALESCE(p_payload->>'one_liner', ''));
  v_slug TEXT := lower(regexp_replace(COALESCE(p_payload->>'slug', ''), '[^a-zA-Z0-9-]+', '-', 'g'));
  v_type TEXT := COALESCE(NULLIF(p_payload->>'type', ''), 'saas_service');
BEGIN
  t := public.api__token(p_token, ARRAY['toolbox_write']);
  IF v_type NOT IN ('agent_skill', 'mcp_server', 'cursor_rules', 'prompt', 'cli_tool', 'saas_service') THEN
    RAISE EXCEPTION 'api_invalid:type' USING ERRCODE = 'P0001';
  END IF;
  IF v_url !~* '^https?://' OR char_length(v_name) NOT BETWEEN 1 AND 80 OR char_length(v_one) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'api_invalid:name/oneLiner/url' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO e FROM public.toolbox_entries WHERE canonical_url = v_url;
  IF FOUND THEN
    UPDATE public.toolbox_entries SET mention_count = COALESCE(mention_count, 0) + 1, updated_at = NOW()
      WHERE id = e.id RETURNING * INTO e;
    RETURN jsonb_build_object('entry', to_jsonb(e) - 'created_by_id', 'created', FALSE);
  END IF;
  IF v_slug = '' OR v_slug = '-' THEN v_slug := 'tool'; END IF;
  IF EXISTS (SELECT 1 FROM public.toolbox_entries WHERE slug = v_slug) THEN
    v_slug := left(v_slug, 50) || '-' || substr(md5(v_url), 1, 6);
  END IF;
  INSERT INTO public.toolbox_entries (name, slug, one_liner, type, tags, canonical_url, github_url, source_repo,
                                      install_snippets, mention_count, created_by_id)
  VALUES (v_name, v_slug, v_one, v_type,
          ARRAY(SELECT DISTINCT left(lower(btrim(x)), 30) FROM jsonb_array_elements_text(COALESCE(p_payload->'tags', '[]'::jsonb)) x
                WHERE btrim(x) <> '' LIMIT 10),
          v_url,
          CASE WHEN p_payload->>'github_url' ~* '^https://github\.com/' THEN p_payload->>'github_url' END,
          NULLIF(p_payload->>'source_repo', ''),
          COALESCE(p_payload->'install_snippets', '{}'::jsonb), 1, t.member_id)
  RETURNING * INTO e;
  RETURN jsonb_build_object('entry', to_jsonb(e) - 'created_by_id', 'created', TRUE);
END;
$$;

-- ---------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.api__token(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api__author_json(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feed__post_json(public.posts) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive__item_json(public.brain_archive_items) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meetup__json(public.meetups, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product__json(public.products, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE sig TEXT;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.mcp_feed_list(TEXT, TEXT, INTEGER)',
    'public.mcp_feed_get(TEXT, UUID)',
    'public.feed_agent_reply(TEXT, UUID, TEXT, TEXT)',
    'public.feed_agent_like(TEXT, UUID, BOOLEAN)',
    'public.mcp_archive_list(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER)',
    'public.mcp_archive_get(TEXT, UUID)',
    'public.mcp_collections(TEXT)',
    'public.mcp_collection_get(TEXT, UUID)',
    'public.mcp_archive_save_post(TEXT, UUID, TEXT[])',
    'public.mcp_meetups(TEXT, TEXT, INTEGER)',
    'public.mcp_meetup_get(TEXT, UUID)',
    'public.mcp_meetup_create(TEXT, JSONB)',
    'public.mcp_meetup_rsvp(TEXT, UUID, TEXT, TEXT, TEXT)',
    'public.mcp_products(TEXT, TEXT, INTEGER)',
    'public.mcp_product_get(TEXT, UUID)',
    'public.mcp_product_create(TEXT, JSONB)',
    'public.mcp_toolbox_list(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER)',
    'public.mcp_toolbox_get(TEXT, TEXT, BOOLEAN)',
    'public.mcp_toolbox_create(TEXT, JSONB)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', sig);
  END LOOP;
END;
$$;
