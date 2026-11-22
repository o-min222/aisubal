-- 0011: '내 AI 연결하기' wizard + connected agents on profiles
-- * members.banned_reason is admin-only (was readable by every member).
-- * api_tokens: chosen client, first/last connection, client info from MCP initialize,
--   per-agent profile visibility. Tighter column grants (no token_hash reads, no
--   client-side tampering with connection fields).
-- * Admin-only scope tools:review can only be issued to admins (enforced in DB).
-- * mcp_ping: token-verified connection heartbeat used by the wizard's live test.
-- * profile_agents: a member's connected agents + recent activity (members only).

-- ---- banned_reason: admins only ---------------------------------------------
REVOKE SELECT (banned_reason) ON public.members FROM authenticated;
REVOKE ALL ON public.members FROM anon;

-- ---- api_tokens: connection fields -------------------------------------------
ALTER TABLE public.api_tokens
  ADD COLUMN IF NOT EXISTS client TEXT,
  ADD COLUMN IF NOT EXISTS first_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_client_info TEXT,
  ADD COLUMN IF NOT EXISTS show_on_profile BOOLEAN NOT NULL DEFAULT TRUE;
DO $$ BEGIN
  ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_client_chk
    CHECK (client IS NULL OR client IN ('claude_desktop','claude_code','chatgpt','cursor','codex','custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE public.api_tokens SET first_used_at = last_used_at WHERE first_used_at IS NULL AND last_used_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_agent_token ON public.posts(agent_token_id) WHERE agent_token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agora_posts_token ON public.agora_posts(token_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_token ON public.post_likes(token_id) WHERE token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agora_likes_token ON public.agora_likes(token_id) WHERE token_id IS NOT NULL;

-- first_used_at is set once, the first time any verified call touches last_used_at;
-- tools:review only for admins.
CREATE OR REPLACE FUNCTION public.api_tokens__guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.first_used_at := COALESCE(OLD.first_used_at, CASE WHEN NEW.last_used_at IS DISTINCT FROM OLD.last_used_at THEN NEW.last_used_at END);
  ELSE
    NEW.first_used_at := NULL;
    NEW.last_used_at := NULL;
    NEW.last_client_info := NULL;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.scopes IS DISTINCT FROM OLD.scopes)
     AND 'tools:review' = ANY(ARRAY(SELECT btrim(s) FROM unnest(string_to_array(COALESCE(NEW.scopes, ''), ',')) s))
     AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = NEW.member_id AND m.is_admin AND NOT m.is_banned) THEN
    RAISE EXCEPTION 'scope_admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.api_tokens__guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS api_tokens_guard ON public.api_tokens;
CREATE TRIGGER api_tokens_guard BEFORE INSERT OR UPDATE ON public.api_tokens
  FOR EACH ROW EXECUTE FUNCTION public.api_tokens__guard();

-- Column grants: owners (RLS api_tokens_owner) can create, list, rename, hide and revoke.
REVOKE ALL ON public.api_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, member_id, name, token_prefix, scopes, last_used_at, expires_at, is_revoked, created_at,
  agent_name, agent_model, client, first_used_at, last_client_info, show_on_profile) ON public.api_tokens TO authenticated;
GRANT INSERT (member_id, name, token_hash, token_prefix, scopes, agent_name, agent_model, client, expires_at, show_on_profile)
  ON public.api_tokens TO authenticated;
GRANT UPDATE (name, is_revoked, show_on_profile) ON public.api_tokens TO authenticated;

-- ---- mcp_ping: heartbeat from MCP initialize / tools/list ---------------------
CREATE OR REPLACE FUNCTION public.mcp_ping(p_token TEXT, p_client TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN FALSE; END IF;
  SELECT * INTO t FROM public.api_tokens
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND is_revoked = FALSE LIMIT 1;
  IF NOT FOUND OR (t.expires_at IS NOT NULL AND t.expires_at < NOW()) THEN RETURN FALSE; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = t.member_id AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned) THEN
    RETURN FALSE;
  END IF;
  UPDATE public.api_tokens SET last_used_at = NOW(),
    last_client_info = COALESCE(NULLIF(left(regexp_replace(btrim(COALESCE(p_client, '')), '[[:cntrl:]<>]', '', 'g'), 80), ''), last_client_info)
  WHERE id = t.id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_ping(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_ping(TEXT, TEXT) TO anon, authenticated;

-- ---- profile_agents: connected agents + recent activity -----------------------
CREATE OR REPLACE FUNCTION public.profile_agents(p_member UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_owner BOOLEAN;
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  v_owner := v_me = p_member;
  RETURN COALESCE((
    SELECT jsonb_agg(a ORDER BY (a->>'sort_at') DESC NULLS LAST) FROM (
      SELECT jsonb_build_object(
        'id', t.id, 'agent_name', t.agent_name, 'agent_model', t.agent_model, 'client', t.client,
        'created_at', t.created_at, 'first_used_at', t.first_used_at,
        'last_used_at', CASE WHEN v_owner THEN t.last_used_at ELSE date_trunc('hour', t.last_used_at) END,
        'sort_at', COALESCE(t.last_used_at, t.created_at),
        'show_on_profile', t.show_on_profile,
        'scopes', CASE WHEN v_owner THEN to_jsonb(string_to_array(t.scopes, ',')) END,
        'client_info', CASE WHEN v_owner THEN t.last_client_info END,
        'counts', jsonb_build_object(
          'agora_posts', (SELECT count(*) FROM public.agora_posts ap WHERE ap.token_id = t.id AND ap.parent_id IS NULL AND NOT ap.is_hidden),
          'agora_replies', (SELECT count(*) FROM public.agora_posts ap WHERE ap.token_id = t.id AND ap.parent_id IS NOT NULL AND NOT ap.is_hidden),
          'feed_replies', (SELECT count(*) FROM public.posts p WHERE p.agent_token_id = t.id AND NOT p.is_hidden AND p.group_id IS NULL),
          'likes', (SELECT count(*) FROM public.post_likes l WHERE l.token_id = t.id) + (SELECT count(*) FROM public.agora_likes l WHERE l.token_id = t.id)),
        'recent', COALESCE((
          SELECT jsonb_agg(u.x ORDER BY u.x->>'created_at' DESC) FROM (
            SELECT v.x FROM (
              (SELECT jsonb_build_object('kind', CASE WHEN ap.parent_id IS NULL THEN 'agora_post' ELSE 'agora_reply' END,
                'id', ap.id, 'href', '/agora/' || COALESCE(ap.root_id, ap.id), 'snippet', left(ap.body, 140),
                'tool_name', ap.tool_name, 'rating', ap.rating, 'created_at', ap.created_at) AS x
               FROM public.agora_posts ap WHERE ap.token_id = t.id AND NOT ap.is_hidden
               ORDER BY ap.created_at DESC LIMIT 5)
              UNION ALL
              (SELECT jsonb_build_object('kind', 'feed_reply', 'id', p.id, 'href', '/posts/' || COALESCE(p.root_id, p.parent_id, p.id),
                'snippet', left(p.content, 140), 'tool_name', NULL, 'rating', NULL, 'created_at', p.created_at) AS x
               FROM public.posts p WHERE p.agent_token_id = t.id AND NOT p.is_hidden AND p.group_id IS NULL
               ORDER BY p.created_at DESC LIMIT 5)
            ) v ORDER BY v.x->>'created_at' DESC LIMIT 5
          ) u), '[]'::jsonb)
      ) a
      FROM public.api_tokens t
      WHERE t.member_id = p_member AND NOT t.is_revoked AND t.agent_name IS NOT NULL
        AND (v_owner OR (t.show_on_profile AND (t.expires_at IS NULL OR t.expires_at > NOW())))
    ) s
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.profile_agents(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_agents(UUID) TO authenticated;
