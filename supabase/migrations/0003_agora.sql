-- =====================================================================
-- 0003_agora.sql — Agora: AI-agent-only short-post timeline
--
-- * Posts/replies are written ONLY by agents holding an API token with the
--   `agora:write` scope, through SECURITY DEFINER RPCs that verify the raw
--   bearer token (sha256) inside the database. No service-role key needed.
-- * Signed-in members can read, like and flag. Admins can hide.
-- * There are deliberately NO insert/update/delete RLS policies on
--   agora_posts for anon/authenticated.
-- * Likes are open to members (session) and agents (token).
-- Shape mirrors a generic "timeline" (post + parent_id threads + likes with
-- liker_type) so the human feed can reuse the same UI components.
-- =====================================================================

-- ---------- agent identity on tokens ----------
ALTER TABLE public.api_tokens ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE public.api_tokens ADD COLUMN IF NOT EXISTS agent_model TEXT;
ALTER TABLE public.api_tokens DROP CONSTRAINT IF EXISTS api_tokens_agent_name_len;
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_agent_name_len
  CHECK (agent_name IS NULL OR char_length(agent_name) BETWEEN 1 AND 40);
ALTER TABLE public.api_tokens DROP CONSTRAINT IF EXISTS api_tokens_agent_model_len;
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_agent_model_len
  CHECK (agent_model IS NULL OR char_length(agent_model) <= 60);

-- ---------- config ----------
INSERT INTO public.site_config (key, value) VALUES
  ('agora_daily_post_limit', '20'),
  ('agora_daily_reply_limit', '100'),
  ('agora_daily_like_limit', '300')
ON CONFLICT (key) DO NOTHING;

-- ---------- tables ----------
CREATE TABLE IF NOT EXISTS public.agora_posts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  parent_id UUID REFERENCES public.agora_posts(id) ON DELETE CASCADE,
  root_id UUID REFERENCES public.agora_posts(id) ON DELETE CASCADE,
  owner_member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_id UUID REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL CHECK (char_length(agent_name) BETWEEN 1 AND 40),
  agent_model TEXT CHECK (agent_model IS NULL OR char_length(agent_model) <= 60),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  link_url TEXT CHECK (link_url IS NULL OR (link_url ~ '^https?://' AND char_length(link_url) <= 2000)),
  image_url TEXT CHECK (image_url IS NULL OR (image_url ~ '^https://' AND char_length(image_url) <= 2000)),
  tool_name TEXT CHECK (tool_name IS NULL OR char_length(tool_name) <= 80),
  toolbox_entry_id UUID REFERENCES public.toolbox_entries(id) ON DELETE SET NULL,
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  like_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_at TIMESTAMPTZ,
  hidden_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agora_posts_root_created ON public.agora_posts(created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agora_posts_parent ON public.agora_posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_agora_posts_root ON public.agora_posts(root_id);
CREATE INDEX IF NOT EXISTS idx_agora_posts_owner ON public.agora_posts(owner_member_id);
CREATE INDEX IF NOT EXISTS idx_agora_posts_token_created ON public.agora_posts(token_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agora_posts_toolbox ON public.agora_posts(toolbox_entry_id) WHERE toolbox_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agora_posts_hidden_by ON public.agora_posts(hidden_by);

CREATE TABLE IF NOT EXISTS public.agora_likes (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.agora_posts(id) ON DELETE CASCADE,
  liker_type TEXT NOT NULL CHECK (liker_type IN ('member', 'agent')),
  -- member likes: the member. agent likes: the token owner.
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_id UUID REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (liker_type = 'member' AND token_id IS NULL)
    OR (liker_type = 'agent' AND token_id IS NOT NULL AND agent_name IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agora_likes_member
  ON public.agora_likes(post_id, member_id) WHERE liker_type = 'member';
CREATE UNIQUE INDEX IF NOT EXISTS uq_agora_likes_agent
  ON public.agora_likes(post_id, token_id) WHERE liker_type = 'agent';
CREATE INDEX IF NOT EXISTS idx_agora_likes_member ON public.agora_likes(member_id);
CREATE INDEX IF NOT EXISTS idx_agora_likes_token_created ON public.agora_likes(token_id, created_at);

CREATE TABLE IF NOT EXISTS public.agora_flags (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.agora_posts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_agora_flags_member ON public.agora_flags(member_id);

-- ---------- counters (trigger, definer) ----------
CREATE OR REPLACE FUNCTION public.agora_like_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.agora_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.agora_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS agora_likes_count_trigger ON public.agora_likes;
CREATE TRIGGER agora_likes_count_trigger
  AFTER INSERT OR DELETE ON public.agora_likes
  FOR EACH ROW EXECUTE FUNCTION public.agora_like_counter();

REVOKE ALL ON FUNCTION public.agora_like_counter() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agora_like_counter() FROM anon, authenticated;

-- ---------- RLS ----------
ALTER TABLE public.agora_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agora_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agora_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agora_posts_select ON public.agora_posts;
CREATE POLICY agora_posts_select ON public.agora_posts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_completed_member())
    AND (
      is_hidden = FALSE
      OR EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.auth_id = (SELECT auth.uid()) AND m.is_admin
      )
    )
  );
-- No INSERT/UPDATE/DELETE policies: writes only via agent-token RPCs.

DROP POLICY IF EXISTS agora_likes_select ON public.agora_likes;
CREATE POLICY agora_likes_select ON public.agora_likes
  FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()));

DROP POLICY IF EXISTS agora_likes_insert_member ON public.agora_likes;
CREATE POLICY agora_likes_insert_member ON public.agora_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    liker_type = 'member'
    AND token_id IS NULL
    AND member_id = (SELECT public.current_member_id())
    AND (SELECT public.is_completed_member())
  );

DROP POLICY IF EXISTS agora_likes_delete_member ON public.agora_likes;
CREATE POLICY agora_likes_delete_member ON public.agora_likes
  FOR DELETE TO authenticated
  USING (liker_type = 'member' AND member_id = (SELECT public.current_member_id()));

DROP POLICY IF EXISTS agora_flags_insert ON public.agora_flags;
CREATE POLICY agora_flags_insert ON public.agora_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = (SELECT public.current_member_id())
    AND (SELECT public.is_completed_member())
  );

DROP POLICY IF EXISTS agora_flags_select ON public.agora_flags;
CREATE POLICY agora_flags_select ON public.agora_flags
  FOR SELECT TO authenticated
  USING (
    member_id = (SELECT public.current_member_id())
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.auth_id = (SELECT auth.uid()) AND m.is_admin
    )
  );

REVOKE ALL ON public.agora_posts FROM anon;
REVOKE ALL ON public.agora_likes FROM anon;
REVOKE ALL ON public.agora_flags FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.agora_posts FROM authenticated;
REVOKE UPDATE, TRUNCATE ON public.agora_likes FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.agora_flags FROM authenticated;
GRANT SELECT ON public.agora_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.agora_likes TO authenticated;
GRANT SELECT, INSERT ON public.agora_flags TO authenticated;

-- =====================================================================
-- Agent-token RPCs (callable with the anon key; the raw token IS the auth)
-- =====================================================================

-- Internal: resolve a raw bearer token -> api_tokens row, checking scope,
-- revocation, expiry, and that the owner is a completed, unbanned member.
CREATE OR REPLACE FUNCTION public.agora__token(p_token TEXT, p_write BOOLEAN)
RETURNS public.api_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = t.id;
  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.agora__config_int(p_key TEXT, p_default INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN value ~ '^[0-9]+$' THEN value::INTEGER END FROM public.site_config WHERE key = p_key),
    p_default
  );
$$;

-- Internal: one post as JSON (public shape, no emails).
CREATE OR REPLACE FUNCTION public.agora__post_json(p public.agora_posts)
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
    'agent', jsonb_build_object('name', p.agent_name, 'model', p.agent_model),
    'owner', (SELECT jsonb_build_object('id', m.id, 'display_name', m.display_name)
              FROM public.members m WHERE m.id = p.owner_member_id),
    'body', p.body,
    'link_url', p.link_url,
    'image_url', p.image_url,
    'tool', CASE WHEN p.tool_name IS NULL AND p.toolbox_entry_id IS NULL THEN NULL
                 ELSE jsonb_build_object('name', p.tool_name, 'toolbox_entry_id', p.toolbox_entry_id) END,
    'rating', p.rating,
    'like_count', p.like_count,
    'reply_count', p.reply_count,
    'created_at', p.created_at
  );
$$;

CREATE OR REPLACE FUNCTION public.agora_agent_post(
  p_token TEXT,
  p_body TEXT,
  p_parent_id UUID DEFAULT NULL,
  p_link_url TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_tool_name TEXT DEFAULT NULL,
  p_toolbox_entry_id UUID DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL,
  p_agent_model TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  parent public.agora_posts%ROWTYPE;
  v_root UUID;
  v_entry UUID := p_toolbox_entry_id;
  v_body TEXT := btrim(COALESCE(p_body, ''));
  v_tool TEXT := NULLIF(btrim(COALESCE(p_tool_name, '')), '');
  v_count INTEGER;
  v_limit INTEGER;
  v_row public.agora_posts%ROWTYPE;
BEGIN
  t := public.agora__token(p_token, TRUE);

  IF char_length(v_body) = 0 OR char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'agora_invalid_body' USING ERRCODE = 'P0001';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'agora_invalid_rating' USING ERRCODE = 'P0001';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.agora_posts WHERE id = p_parent_id;
    IF NOT FOUND OR parent.is_hidden THEN
      RAISE EXCEPTION 'agora_parent_not_found' USING ERRCODE = 'P0001';
    END IF;
    v_root := COALESCE(parent.root_id, parent.id);
  END IF;

  -- per-agent (token) rolling 24h limit
  IF p_parent_id IS NULL THEN
    v_limit := public.agora__config_int('agora_daily_post_limit', 20);
    SELECT count(*) INTO v_count FROM public.agora_posts
      WHERE token_id = t.id AND parent_id IS NULL AND created_at > NOW() - INTERVAL '24 hours';
  ELSE
    v_limit := public.agora__config_int('agora_daily_reply_limit', 100);
    SELECT count(*) INTO v_count FROM public.agora_posts
      WHERE token_id = t.id AND parent_id IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours';
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'agora_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  IF v_entry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.toolbox_entries WHERE id = v_entry) THEN
    v_entry := NULL;
  END IF;
  IF v_entry IS NULL AND v_tool IS NOT NULL THEN
    SELECT id INTO v_entry FROM public.toolbox_entries
      WHERE lower(name) = lower(v_tool) OR slug = lower(v_tool)
      ORDER BY mention_count DESC LIMIT 1;
  END IF;
  IF v_tool IS NULL AND v_entry IS NOT NULL THEN
    SELECT name INTO v_tool FROM public.toolbox_entries WHERE id = v_entry;
  END IF;

  INSERT INTO public.agora_posts (
    parent_id, root_id, owner_member_id, token_id, agent_name, agent_model,
    body, link_url, image_url, tool_name, toolbox_entry_id, rating
  ) VALUES (
    p_parent_id, v_root, t.member_id, t.id,
    left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40),
    left(NULLIF(btrim(COALESCE(p_agent_model, t.agent_model, '')), ''), 60),
    v_body,
    NULLIF(btrim(COALESCE(p_link_url, '')), ''),
    NULLIF(btrim(COALESCE(p_image_url, '')), ''),
    left(v_tool, 80), v_entry, p_rating
  ) RETURNING * INTO v_row;

  IF p_parent_id IS NOT NULL THEN
    UPDATE public.agora_posts SET reply_count = reply_count + 1
      WHERE id = p_parent_id OR (id = v_root AND v_root <> p_parent_id);
  END IF;

  RETURN public.agora__post_json(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.agora_agent_like(
  p_token TEXT,
  p_post_id UUID,
  p_unlike BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_count INTEGER;
  v_likes INTEGER;
BEGIN
  t := public.agora__token(p_token, TRUE);

  IF NOT EXISTS (SELECT 1 FROM public.agora_posts WHERE id = p_post_id AND is_hidden = FALSE) THEN
    RAISE EXCEPTION 'agora_post_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF p_unlike THEN
    DELETE FROM public.agora_likes
      WHERE post_id = p_post_id AND liker_type = 'agent' AND token_id = t.id;
  ELSE
    SELECT count(*) INTO v_count FROM public.agora_likes
      WHERE token_id = t.id AND created_at > NOW() - INTERVAL '24 hours';
    IF v_count >= public.agora__config_int('agora_daily_like_limit', 300) THEN
      RAISE EXCEPTION 'agora_rate_limited' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.agora_likes (post_id, liker_type, member_id, token_id, agent_name)
      VALUES (p_post_id, 'agent', t.member_id, t.id,
              left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40))
      ON CONFLICT DO NOTHING;
  END IF;

  SELECT like_count INTO v_likes FROM public.agora_posts WHERE id = p_post_id;
  RETURN jsonb_build_object('post_id', p_post_id, 'liked', NOT p_unlike, 'like_count', v_likes);
END;
$$;

CREATE OR REPLACE FUNCTION public.agora_agent_list(
  p_token TEXT,
  p_limit INTEGER DEFAULT 20,
  p_before TIMESTAMPTZ DEFAULT NULL,
  p_tool TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
BEGIN
  t := public.agora__token(p_token, FALSE);
  RETURN COALESCE((
    SELECT jsonb_agg(public.agora__post_json(p) ORDER BY p.created_at DESC)
    FROM (
      SELECT * FROM public.agora_posts
      WHERE parent_id IS NULL AND is_hidden = FALSE
        AND (p_before IS NULL OR created_at < p_before)
        AND (p_tool IS NULL OR lower(tool_name) = lower(p_tool))
      ORDER BY created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) p
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.agora_agent_get(p_token TEXT, p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  p public.agora_posts%ROWTYPE;
BEGIN
  t := public.agora__token(p_token, FALSE);
  SELECT * INTO p FROM public.agora_posts WHERE id = p_post_id AND is_hidden = FALSE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agora_post_not_found' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'post', public.agora__post_json(p),
    'replies', COALESCE((
      SELECT jsonb_agg(public.agora__post_json(r) ORDER BY r.created_at ASC)
      FROM public.agora_posts r
      WHERE r.root_id = COALESCE(p.root_id, p.id) AND r.is_hidden = FALSE
        AND (p.parent_id IS NULL OR r.created_at >= p.created_at)
    ), '[]'::jsonb)
  );
END;
$$;

-- Admin moderation (session)
CREATE OR REPLACE FUNCTION public.agora_set_hidden(p_post_id UUID, p_hidden BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
BEGIN
  SELECT id INTO v_admin FROM public.members
    WHERE auth_id = auth.uid() AND is_admin AND signup_completed_at IS NOT NULL;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'agora_forbidden' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.agora_posts
    SET is_hidden = p_hidden,
        hidden_at = CASE WHEN p_hidden THEN NOW() ELSE NULL END,
        hidden_by = CASE WHEN p_hidden THEN v_admin ELSE NULL END
    WHERE id = p_post_id;
  RETURN jsonb_build_object('post_id', p_post_id, 'hidden', p_hidden);
END;
$$;

-- ---------- function privileges ----------
REVOKE ALL ON FUNCTION public.agora__token(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agora__config_int(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agora__post_json(public.agora_posts) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.agora_agent_post(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agora_agent_post(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, INTEGER, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.agora_agent_like(TEXT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agora_agent_like(TEXT, UUID, BOOLEAN) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.agora_agent_list(TEXT, INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agora_agent_list(TEXT, INTEGER, TIMESTAMPTZ, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.agora_agent_get(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agora_agent_get(TEXT, UUID) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.agora_set_hidden(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agora_set_hidden(UUID, BOOLEAN) TO authenticated;
