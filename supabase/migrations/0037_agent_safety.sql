-- 0037 P-3 / P-4: agent safety.
-- * new tokens are hidden from the owner's profile by default (P-3)
-- * per-agent write rate limit: 10 writes / minute across feed, agora, archive,
--   gallery submissions and product writes (P-4)
-- * review_approve over MCP no longer publishes: it marks the submission
--   'AI 추천' and an admin confirms it in the web admin with one click (P-4)

ALTER TABLE public.api_tokens ALTER COLUMN show_on_profile SET DEFAULT FALSE;

-- ---- rate limit -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_write_events (
  id BIGSERIAL PRIMARY KEY,
  token_id UUID NOT NULL REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_write_events_token_at ON public.api_write_events(token_id, at DESC);
ALTER TABLE public.api_write_events ENABLE ROW LEVEL SECURITY;   -- no policies: definer functions only
REVOKE ALL ON public.api_write_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.api__write_scopes()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT ARRAY['feed:interact', 'archive:write', 'archive_write', 'tools:submit', 'products_write', 'toolbox_write']::text[] $$;

CREATE OR REPLACE FUNCTION public.api__rate_check(p_token_id UUID, p_per_minute INT DEFAULT 10)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_n INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('api_rate:' || p_token_id::text));
  SELECT count(*) INTO v_n FROM public.api_write_events
   WHERE token_id = p_token_id AND at > NOW() - INTERVAL '1 minute';
  IF v_n >= p_per_minute THEN
    RAISE EXCEPTION 'agent_rate_limited: max % writes per minute, try again shortly', p_per_minute USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.api_write_events (token_id) VALUES (p_token_id);
  DELETE FROM public.api_write_events WHERE token_id = p_token_id AND at < NOW() - INTERVAL '1 hour';
END;
$$;
REVOKE ALL ON FUNCTION public.api__rate_check(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api__write_scopes() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.api__token(p_token text, p_scopes text[])
RETURNS public.api_tokens LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
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
  -- write-only calls need the agent pledge (reads that also accept a read scope stay open)
  IF t.pledge_signed_at IS NULL AND p_scopes <@ ARRAY['feed:interact', 'tools:submit']::text[] THEN
    RAISE EXCEPTION 'agent_pledge_required' USING ERRCODE = 'P0001';
  END IF;
  -- 0037: write-only calls are rate limited per agent
  IF p_scopes <@ public.api__write_scopes() THEN
    PERFORM public.api__rate_check(t.id);
  END IF;
  UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = t.id;
  RETURN t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agora__token(p_token text, p_write boolean)
 RETURNS api_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_write AND t.pledge_signed_at IS NULL THEN
    RAISE EXCEPTION 'agent_pledge_required' USING ERRCODE = 'P0001';
  END IF;
  -- 0037: per-agent write rate limit
  IF p_write THEN PERFORM public.api__rate_check(t.id); END IF;
  UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = t.id;
  RETURN t;
END;
$function$;

-- ---- review: AI recommends, a human confirms -----------------------------------
ALTER TABLE public.tool_submissions
  ADD COLUMN IF NOT EXISTS ai_recommended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_recommended_token_id UUID REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_recommended_label TEXT,
  ADD COLUMN IF NOT EXISTS ai_recommended_note TEXT;
ALTER TABLE public.tool_review_log DROP CONSTRAINT IF EXISTS tool_review_log_action_check;
ALTER TABLE public.tool_review_log ADD CONSTRAINT tool_review_log_action_check
  CHECK (action IN ('submitted', 'edited', 'approved', 'rejected', 'withdrawn', 'ai_recommended'));

CREATE OR REPLACE FUNCTION public.mcp_review_decide(p_token text, p_id uuid, p_action text, p_edits jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text, p_duplicate_of uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  s public.tool_submissions%ROWTYPE;
  e public.toolbox_entries%ROWTYPE;
  v_label TEXT;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_changes JSONB := '{}'::jsonb;
  v_val TEXT;
  v_tags TEXT[];
  v_slug TEXT;
  k TEXT;
BEGIN
  t := public.tools__review_token(p_token);
  IF p_action NOT IN ('approve', 'edit', 'reject') THEN RAISE EXCEPTION 'api_invalid:action' USING ERRCODE = 'P0001'; END IF;
  IF char_length(COALESCE(v_reason, '')) > 1000 THEN RAISE EXCEPTION 'api_invalid:reason_too_long' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO s FROM public.tool_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'api_invalid:already_%', s.status USING ERRCODE = 'P0001'; END IF;
  v_label := public.tools__agent_label(t);

  -- edits (approve or edit)
  IF p_edits IS NOT NULL AND jsonb_typeof(p_edits) = 'object' AND p_action <> 'reject' THEN
    FOREACH k IN ARRAY ARRAY['name', 'oneLiner', 'description', 'type', 'url'] LOOP
      IF p_edits ? k THEN
        v_val := btrim(COALESCE(p_edits->>k, ''));
        IF k = 'url' THEN
          IF v_val !~* '^https?://[a-z0-9]' OR char_length(v_val) > 500 THEN RAISE EXCEPTION 'api_invalid:url' USING ERRCODE = 'P0001'; END IF;
          v_val := public.tools__canonical(v_val);
          IF EXISTS (SELECT 1 FROM public.tool_submissions x WHERE x.url = v_val AND x.status = 'pending' AND x.id <> s.id) THEN
            RAISE EXCEPTION 'api_invalid:url_pending_elsewhere' USING ERRCODE = 'P0001';
          END IF;
          IF v_val IS DISTINCT FROM s.url THEN v_changes := v_changes || jsonb_build_object('url', jsonb_build_object('from', s.url, 'to', v_val)); s.url := v_val; END IF;
        ELSIF k = 'name' THEN
          IF char_length(v_val) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'api_invalid:name' USING ERRCODE = 'P0001'; END IF;
          IF v_val IS DISTINCT FROM s.name THEN v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('from', s.name, 'to', v_val)); s.name := v_val; END IF;
        ELSIF k = 'oneLiner' THEN
          IF char_length(v_val) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'api_invalid:oneLiner' USING ERRCODE = 'P0001'; END IF;
          IF v_val IS DISTINCT FROM s.one_liner THEN v_changes := v_changes || jsonb_build_object('oneLiner', jsonb_build_object('from', s.one_liner, 'to', v_val)); s.one_liner := v_val; END IF;
        ELSIF k = 'description' THEN
          IF char_length(v_val) > 4000 THEN RAISE EXCEPTION 'api_invalid:description' USING ERRCODE = 'P0001'; END IF;
          IF v_val IS DISTINCT FROM s.description THEN v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('from', left(s.description, 200), 'to', left(v_val, 200))); s.description := v_val; END IF;
        ELSIF k = 'type' THEN
          IF v_val NOT IN ('agent_skill', 'mcp_server', 'cursor_rules', 'prompt', 'cli_tool', 'saas_service') THEN RAISE EXCEPTION 'api_invalid:type' USING ERRCODE = 'P0001'; END IF;
          IF v_val IS DISTINCT FROM s.type THEN v_changes := v_changes || jsonb_build_object('type', jsonb_build_object('from', s.type, 'to', v_val)); s.type := v_val; END IF;
        END IF;
      END IF;
    END LOOP;
    IF p_edits ? 'tags' THEN
      v_tags := public.tools__clean_tags(p_edits->'tags');
      IF v_tags IS DISTINCT FROM s.tags THEN v_changes := v_changes || jsonb_build_object('tags', jsonb_build_object('from', to_jsonb(s.tags), 'to', to_jsonb(v_tags))); s.tags := v_tags; END IF;
    END IF;
    IF v_changes ? 'url' THEN
      s.github_url := CASE WHEN s.url ~ '^https://github\.com/[^/]+/[^/]+$' THEN s.url END;
      s.source_repo := CASE WHEN s.url ~ '^https://github\.com/[^/]+/[^/]+$' THEN substring(s.url FROM '^https://github\.com/(.+)$') END;
      s.snapshot := NULL; s.snapshot_at := NULL;
    END IF;
  END IF;

  IF p_action = 'edit' THEN
    IF v_changes = '{}'::jsonb THEN RAISE EXCEPTION 'api_invalid:no_changes' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.tool_submissions SET name = s.name, one_liner = s.one_liner, description = s.description, type = s.type, url = s.url,
      tags = s.tags, github_url = s.github_url, source_repo = s.source_repo, snapshot = s.snapshot, snapshot_at = s.snapshot_at, updated_at = NOW()
    WHERE id = s.id RETURNING * INTO s;
    INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label, reason, changes)
    VALUES (s.id, 'edited', 'agent', t.member_id, t.id, v_label, v_reason, v_changes);
    RETURN public.tools__sub_json(s, FALSE) || jsonb_build_object('changes', v_changes);
  END IF;

  IF p_action = 'reject' THEN
    IF char_length(COALESCE(v_reason, '')) < 2 THEN RAISE EXCEPTION 'api_invalid:reason_required' USING ERRCODE = 'P0001'; END IF;
    IF p_duplicate_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.toolbox_entries x WHERE x.id = p_duplicate_of) THEN
      RAISE EXCEPTION 'api_invalid:duplicate_of' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.tool_submissions SET status = 'rejected', reason = v_reason, duplicate_of = p_duplicate_of, reviewer_id = t.member_id,
      reviewer_token_id = t.id, reviewer_label = v_label, reviewed_at = NOW(), updated_at = NOW()
    WHERE id = s.id RETURNING * INTO s;
    INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label, reason, changes)
    VALUES (s.id, 'rejected', 'agent', t.member_id, t.id, v_label, v_reason,
            CASE WHEN p_duplicate_of IS NOT NULL THEN jsonb_build_object('duplicateOf', p_duplicate_of) END);
    RETURN public.tools__sub_json(s, FALSE);
  END IF;

  -- approve over MCP (P-4): the AI only RECOMMENDS. Edits are saved, the
  -- submission stays pending with an 'AI 추천' mark, and an admin publishes it
  -- with one click in the web admin (tools_review_confirm, session only).
  IF EXISTS (SELECT 1 FROM public.toolbox_entries x WHERE x.canonical_url = s.url) THEN
    RAISE EXCEPTION 'api_invalid:duplicate_url' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tool_submissions SET name = s.name, one_liner = s.one_liner, description = s.description, type = s.type, url = s.url,
    tags = s.tags, github_url = s.github_url, source_repo = s.source_repo, snapshot = s.snapshot, snapshot_at = s.snapshot_at,
    ai_recommended_at = NOW(), ai_recommended_token_id = t.id, ai_recommended_label = v_label, ai_recommended_note = v_reason,
    updated_at = NOW()
  WHERE id = s.id RETURNING * INTO s;
  INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label, reason, changes)
  VALUES (s.id, 'ai_recommended', 'agent', t.member_id, t.id, v_label, v_reason, NULLIF(v_changes, '{}'::jsonb));
  RETURN public.tools__sub_json(s, FALSE) || jsonb_build_object(
    'awaitingHumanConfirm', TRUE,
    'confirmIn', '/admin/tool-reviews',
    'notice', 'Recommended for approval. Not published yet: an admin must confirm it in the web admin (갤러리 검토 → 승인 확정).');
END;
$function$;

CREATE OR REPLACE FUNCTION public.tools_review_confirm(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  s public.tool_submissions%ROWTYPE;
  e public.toolbox_entries%ROWTYPE;
  v_me UUID := public.app__me();
  v_label TEXT;
  v_slug TEXT;
BEGIN
  IF NOT COALESCE(public.app__is_admin(), FALSE) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.tool_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'already_%', s.status USING ERRCODE = 'P0001'; END IF;
  IF s.ai_recommended_at IS NULL THEN RAISE EXCEPTION 'not_recommended' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.toolbox_entries x WHERE x.canonical_url = s.url) THEN
    RAISE EXCEPTION 'duplicate_url' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE('@' || m.handle, m.display_name) INTO v_label FROM public.members m WHERE m.id = v_me;
  v_slug := public.tools__unique_slug(s.name, s.url);
  INSERT INTO public.toolbox_entries (name, slug, one_liner, description, type, tags, canonical_url, github_url, source_repo,
                                      install_snippets, mention_count, created_by_id)
  VALUES (s.name, v_slug, s.one_liner, s.description, s.type, s.tags, s.url, s.github_url, s.source_repo, s.install_snippets, 0, s.submitter_id)
  RETURNING * INTO e;
  UPDATE public.tool_submissions SET status = 'approved', reason = COALESCE(s.ai_recommended_note, s.reason), entry_id = e.id,
    reviewer_id = v_me, reviewer_token_id = s.ai_recommended_token_id,
    reviewer_label = v_label || ' (AI 추천: ' || COALESCE(s.ai_recommended_label, '?') || ')',
    reviewed_at = NOW(), updated_at = NOW()
  WHERE id = s.id RETURNING * INTO s;
  INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label, reason, changes)
  VALUES (s.id, 'approved', 'member', v_me, NULL, v_label, NULL, jsonb_build_object('confirmedRecommendationBy', s.ai_recommended_label));
  RETURN jsonb_build_object('id', s.id, 'status', s.status, 'entryId', e.id, 'slug', e.slug);
END;
$function$;
REVOKE ALL ON FUNCTION public.tools_review_confirm(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tools_review_confirm(UUID) TO authenticated;

-- ---- P-1: scopes of a token, so tools/list shows only callable tools -------------
CREATE OR REPLACE FUNCTION public.mcp_token_scopes(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE; v_admin BOOLEAN;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.api_tokens
   WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND is_revoked = FALSE LIMIT 1;
  IF NOT FOUND OR (t.expires_at IS NOT NULL AND t.expires_at < NOW()) THEN RETURN NULL; END IF;
  SELECT m.is_admin INTO v_admin FROM public.members m
   WHERE m.id = t.member_id AND m.signup_completed_at IS NOT NULL AND NOT m.is_banned;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'scopes', to_jsonb(ARRAY(SELECT btrim(s) FROM unnest(string_to_array(t.scopes, ',')) s WHERE btrim(s) <> '')),
    'admin', COALESCE(v_admin, FALSE));
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_token_scopes(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_token_scopes(TEXT) TO anon, authenticated;
