-- 0013: agent-only tool submissions + admin subscription-AI review queue.
--
--  * No server-side LLM and no API key. Members' own AIs submit tools with a
--    `tools:submit` token. Submissions go into a review queue instead of being
--    published directly.
--  * An admin's own subscription AI (Claude, ChatGPT, …) pulls the queue over MCP
--    with a `tools:review` token. Only admins can issue that token (0011 trigger),
--    and admin status is re-checked on every call, so a demoted admin's token stops
--    working.
--  * Every step is logged with attribution '{name}님의 {agent}'. Submitters see
--    their own status; admins see everything.
--  * Humans can no longer insert toolbox_entries directly (agent-only). Product
--    launches still sync through the SECURITY DEFINER trigger from 0006.

CREATE OR REPLACE FUNCTION public.tools__norm_name(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT regexp_replace(lower(coalesce(p, '')), '[^a-z0-9가-힣]+', '', 'g') $$;

CREATE OR REPLACE FUNCTION public.tools__host(p_url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT lower(split_part(regexp_replace(coalesce(p_url, ''), '^https?://(www\.)?', '', 'i'), '/', 1)) $$;

-- ------------------------------------------------------------------ tables
CREATE TABLE IF NOT EXISTS public.tool_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_id UUID REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  agent_label TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  one_liner TEXT NOT NULL CHECK (char_length(one_liner) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  url TEXT NOT NULL CHECK (url ~ '^https://[^/]+' AND char_length(url) <= 500),
  type TEXT NOT NULL CHECK (type IN ('agent_skill', 'mcp_server', 'cursor_rules', 'prompt', 'cli_tool', 'saas_service')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  github_url TEXT,
  source_repo TEXT,
  install_snippets JSONB NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  duplicate_of UUID REFERENCES public.toolbox_entries(id) ON DELETE SET NULL,
  entry_id UUID REFERENCES public.toolbox_entries(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  reviewer_token_id UUID REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  reviewer_label TEXT,
  reviewed_at TIMESTAMPTZ,
  snapshot JSONB,
  snapshot_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_sub_status ON public.tool_submissions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_sub_submitter ON public.tool_submissions(submitter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_sub_url ON public.tool_submissions(url);
CREATE INDEX IF NOT EXISTS idx_tool_sub_token ON public.tool_submissions(token_id);
CREATE INDEX IF NOT EXISTS idx_tool_sub_reviewer ON public.tool_submissions(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_tool_sub_reviewer_token ON public.tool_submissions(reviewer_token_id);
CREATE INDEX IF NOT EXISTS idx_tool_sub_dup ON public.tool_submissions(duplicate_of);
CREATE INDEX IF NOT EXISTS idx_tool_sub_entry ON public.tool_submissions(entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tool_sub_pending_url ON public.tool_submissions(url) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.tool_review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.tool_submissions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'edited', 'approved', 'rejected', 'withdrawn')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('agent', 'member')),
  actor_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  actor_token_id UUID REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  reason TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_log_sub ON public.tool_review_log(submission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_log_actor ON public.tool_review_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_tool_log_token ON public.tool_review_log(actor_token_id);

ALTER TABLE public.tool_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_review_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tool_review_log FROM PUBLIC, anon, authenticated;
-- Read-only for clients (own rows, or everything for admins). All writes go through the RPCs below.
GRANT SELECT ON public.tool_submissions TO authenticated;
GRANT SELECT ON public.tool_review_log TO authenticated;
DROP POLICY IF EXISTS tool_submissions_read ON public.tool_submissions;
CREATE POLICY tool_submissions_read ON public.tool_submissions FOR SELECT TO authenticated
  USING (submitter_id = (SELECT public.current_member_id()) OR (SELECT public.app__is_admin()));
DROP POLICY IF EXISTS tool_review_log_read ON public.tool_review_log;
CREATE POLICY tool_review_log_read ON public.tool_review_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tool_submissions s WHERE s.id = submission_id
    AND (s.submitter_id = (SELECT public.current_member_id()) OR (SELECT public.app__is_admin()))));

-- Agent-only: no direct human inserts into the tool list.
DROP POLICY IF EXISTS toolbox_entries_insert ON public.toolbox_entries;

-- ------------------------------------------------------------------ helpers
CREATE OR REPLACE FUNCTION public.tools__agent_label(t public.api_tokens)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT m.display_name || '님의 ' || COALESCE(NULLIF(btrim(t.agent_name), ''), t.name)
  FROM public.members m WHERE m.id = t.member_id
$$;

-- tools:review token AND currently an admin (re-checked on every call).
CREATE OR REPLACE FUNCTION public.tools__review_token(p_token TEXT)
RETURNS public.api_tokens LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['tools:review']);
  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = t.member_id AND m.is_admin) THEN
    RAISE EXCEPTION 'api_forbidden:admin_only' USING ERRCODE = 'P0001';
  END IF;
  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.tools__sub_json(s public.tool_submissions, p_full BOOLEAN)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'name', s.name, 'oneLiner', s.one_liner, 'url', s.url, 'type', s.type, 'tags', to_jsonb(s.tags),
    'status', s.status, 'submittedBy', s.agent_label, 'createdAt', s.created_at,
    'reviewedBy', s.reviewer_label, 'reviewedAt', s.reviewed_at, 'reason', s.reason,
    'entry', (SELECT jsonb_build_object('id', e.id, 'slug', e.slug, 'href', '/tools/' || e.slug) FROM public.toolbox_entries e WHERE e.id = s.entry_id),
    'duplicateOf', (SELECT jsonb_build_object('id', e.id, 'slug', e.slug, 'name', e.name, 'href', '/tools/' || e.slug) FROM public.toolbox_entries e WHERE e.id = s.duplicate_of),
    'statusUrl', '/tools/submissions?open=' || s.id
  ) || CASE WHEN p_full THEN jsonb_build_object(
    'description', s.description, 'note', s.note, 'githubUrl', s.github_url, 'sourceRepo', s.source_repo,
    'installSnippets', s.install_snippets, 'snapshot', s.snapshot, 'snapshotAt', s.snapshot_at, 'updatedAt', s.updated_at
  ) ELSE '{}'::jsonb END
$$;

-- Duplicate candidates: existing tools and other submissions.
CREATE OR REPLACE FUNCTION public.tools__duplicates(p_id UUID, p_url TEXT, p_name TEXT, p_repo TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH n AS (SELECT public.tools__norm_name(p_name) AS nm, public.tools__host(p_url) AS host, lower(NULLIF(p_repo, '')) AS repo),
  e AS (
    SELECT 'entry'::text AS kind, x.id, x.slug, x.name, x.canonical_url AS url, NULL::text AS status,
      CASE
        WHEN x.canonical_url = p_url OR public.tools__canonical(x.homepage_url) = p_url OR public.tools__canonical(x.github_url) = p_url THEN 'same_url'
        WHEN n.repo IS NOT NULL AND lower(x.source_repo) = n.repo THEN 'same_repo'
        WHEN public.tools__norm_name(x.name) = n.nm AND n.nm <> '' THEN 'same_name'
        WHEN n.host NOT IN ('github.com', 'gitlab.com', 'npmjs.com', 'www.npmjs.com', 'pypi.org', 'huggingface.co', 'chromewebstore.google.com', 'marketplace.visualstudio.com')
             AND public.tools__host(x.canonical_url) = n.host THEN 'same_domain'
        WHEN char_length(n.nm) >= 4 AND (strpos(public.tools__norm_name(x.name), n.nm) > 0 OR strpos(n.nm, public.tools__norm_name(x.name)) > 0)
             AND char_length(public.tools__norm_name(x.name)) >= 4 THEN 'similar_name'
      END AS reason
    FROM public.toolbox_entries x, n
  ),
  s AS (
    SELECT 'submission'::text AS kind, y.id, NULL::text AS slug, y.name, y.url, y.status,
      CASE WHEN y.url = p_url THEN 'same_url'
           WHEN public.tools__norm_name(y.name) = n.nm AND n.nm <> '' THEN 'same_name' END AS reason
    FROM public.tool_submissions y, n
    WHERE y.id IS DISTINCT FROM p_id AND y.status IN ('pending', 'approved', 'rejected')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'slug', slug, 'name', name, 'url', url, 'status', status, 'reason', reason)
    ORDER BY rnk, name), '[]'::jsonb)
  FROM (
    SELECT u.*, array_position(ARRAY['same_url', 'same_repo', 'same_name', 'same_domain', 'similar_name'], u.reason) AS rnk
    FROM (SELECT * FROM e WHERE reason IS NOT NULL UNION ALL SELECT * FROM s WHERE reason IS NOT NULL) u
    ORDER BY rnk, u.name LIMIT 12
  ) d
$$;

CREATE OR REPLACE FUNCTION public.tools__clean_tags(p JSONB)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT COALESCE(ARRAY(SELECT DISTINCT left(lower(btrim(x)), 30) FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) x WHERE btrim(x) <> '' LIMIT 10), '{}')
$$;

-- ------------------------------------------------------------------ submit (members' agents)
CREATE OR REPLACE FUNCTION public.mcp_tool_submit(p_token TEXT, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  s public.tool_submissions%ROWTYPE;
  v_raw TEXT := btrim(COALESCE(p_payload->>'url', p_payload->>'canonical_url', ''));
  v_url TEXT;
  v_name TEXT := btrim(COALESCE(p_payload->>'name', ''));
  v_one TEXT := btrim(COALESCE(p_payload->>'oneLiner', p_payload->>'one_liner', ''));
  v_desc TEXT := btrim(COALESCE(p_payload->>'description', ''));
  v_note TEXT := btrim(COALESCE(p_payload->>'note', ''));
  v_type TEXT := COALESCE(NULLIF(p_payload->>'type', ''), 'saas_service');
  v_snip JSONB := CASE WHEN jsonb_typeof(p_payload->'install_snippets') = 'object' AND octet_length((p_payload->'install_snippets')::text) <= 8000
                       THEN p_payload->'install_snippets' ELSE '{}'::jsonb END;
  v_entry RECORD;
BEGIN
  t := public.api__token(p_token, ARRAY['tools:submit']);
  IF v_raw !~* '^https?://[a-z0-9]' OR char_length(v_raw) > 500 THEN RAISE EXCEPTION 'api_invalid:url' USING ERRCODE = 'P0001'; END IF;
  v_url := public.tools__canonical(v_raw);
  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'api_invalid:name' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_one) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'api_invalid:oneLiner' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_desc) > 4000 OR char_length(v_note) > 1000 THEN RAISE EXCEPTION 'api_invalid:too_long' USING ERRCODE = 'P0001'; END IF;
  IF v_type NOT IN ('agent_skill', 'mcp_server', 'cursor_rules', 'prompt', 'cli_tool', 'saas_service') THEN
    RAISE EXCEPTION 'api_invalid:type' USING ERRCODE = 'P0001';
  END IF;

  SELECT e.id, e.slug, e.name INTO v_entry FROM public.toolbox_entries e WHERE e.canonical_url = v_url LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'exists', 'entry', jsonb_build_object('id', v_entry.id, 'slug', v_entry.slug, 'name', v_entry.name, 'href', '/tools/' || v_entry.slug),
      'message', '이미 등록된 툴이에요. set_tool_usage로 사용 중 표시를 하거나 아고라에 리뷰를 남겨주세요.');
  END IF;
  SELECT * INTO s FROM public.tool_submissions x WHERE x.url = v_url AND x.status = 'pending';
  IF FOUND THEN
    IF s.submitter_id = t.member_id THEN
      RETURN public.tools__sub_json(s, FALSE) || jsonb_build_object('deduped', TRUE);
    END IF;
    RETURN jsonb_build_object('status', 'already_submitted', 'message', '다른 멤버가 이미 같은 툴을 등록 요청했어요. 검토가 끝나면 툴 목록에 올라와요.');
  END IF;
  IF (SELECT count(*) FROM public.tool_submissions x WHERE x.submitter_id = t.member_id AND x.status = 'pending') >= 10 THEN
    RAISE EXCEPTION 'api_rate_limited:pending' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.tool_submissions x WHERE x.submitter_id = t.member_id AND x.created_at > NOW() - INTERVAL '1 day') >= 20 THEN
    RAISE EXCEPTION 'api_rate_limited:daily' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tool_submissions (submitter_id, token_id, agent_label, name, one_liner, description, url, type, tags,
    github_url, source_repo, install_snippets, note)
  VALUES (t.member_id, t.id, public.tools__agent_label(t), v_name, v_one, v_desc, v_url, v_type, public.tools__clean_tags(p_payload->'tags'),
    CASE WHEN v_url ~ '^https://github\.com/[^/]+/[^/]+$' THEN v_url END,
    CASE WHEN v_url ~ '^https://github\.com/[^/]+/[^/]+$' THEN substring(v_url FROM '^https://github\.com/(.+)$') END,
    v_snip, v_note)
  RETURNING * INTO s;
  INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label)
  VALUES (s.id, 'submitted', 'agent', t.member_id, t.id, s.agent_label);
  RETURN public.tools__sub_json(s, FALSE) || jsonb_build_object('message', '등록 요청을 받았어요. 관리자 검토 후 공개돼요.');
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_tool_submissions_mine(p_token TEXT, p_limit INTEGER DEFAULT 20)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['tools:submit']);
  RETURN jsonb_build_object('submissions', COALESCE((
    SELECT jsonb_agg(public.tools__sub_json(x, FALSE) ORDER BY x.created_at DESC)
    FROM (SELECT * FROM public.tool_submissions s WHERE s.submitter_id = t.member_id
          ORDER BY s.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)) x), '[]'::jsonb));
END;
$$;

-- Legacy create_tool / mcp_toolbox_create now go through the review queue too.
CREATE OR REPLACE FUNCTION public.mcp_toolbox_create(p_token TEXT, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN RETURN public.mcp_tool_submit(p_token, p_payload); END; $$;

-- ------------------------------------------------------------------ review (admin's AI)
CREATE OR REPLACE FUNCTION public.mcp_review_queue_list(p_token TEXT, p_status TEXT DEFAULT 'pending', p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_status TEXT := CASE WHEN p_status IN ('pending', 'approved', 'rejected', 'withdrawn', 'all') THEN p_status ELSE 'pending' END;
  v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_off INTEGER := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
BEGIN
  t := public.tools__review_token(p_token);
  RETURN jsonb_build_object(
    'status', v_status,
    'pendingCount', (SELECT count(*) FROM public.tool_submissions WHERE status = 'pending'),
    'total', (SELECT count(*) FROM public.tool_submissions WHERE v_status = 'all' OR status = v_status),
    'items', COALESCE((
      SELECT jsonb_agg(public.tools__sub_json(x, FALSE) || jsonb_build_object(
        'possibleDuplicates', jsonb_array_length(public.tools__duplicates(x.id, x.url, x.name, x.source_repo)),
        'hasSnapshot', x.snapshot IS NOT NULL) ORDER BY x.created_at)
      FROM (SELECT * FROM public.tool_submissions s WHERE v_status = 'all' OR s.status = v_status
            ORDER BY s.created_at OFFSET v_off LIMIT v_lim) x), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_review_get(p_token TEXT, p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE; s public.tool_submissions%ROWTYPE;
BEGIN
  t := public.tools__review_token(p_token);
  SELECT * INTO s FROM public.tool_submissions WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN public.tools__sub_json(s, TRUE) || jsonb_build_object(
    'submitter', (SELECT jsonb_build_object('displayName', m.display_name, 'handle', m.handle,
                    'approvedBefore', (SELECT count(*) FROM public.tool_submissions z WHERE z.submitter_id = m.id AND z.status = 'approved'),
                    'rejectedBefore', (SELECT count(*) FROM public.tool_submissions z WHERE z.submitter_id = m.id AND z.status = 'rejected'))
                  FROM public.members m WHERE m.id = s.submitter_id),
    'duplicates', public.tools__duplicates(s.id, s.url, s.name, s.source_repo),
    'log', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', l.action, 'by', l.actor_label, 'reason', l.reason, 'changes', l.changes, 'at', l.created_at) ORDER BY l.created_at)
                     FROM public.tool_review_log l WHERE l.submission_id = s.id), '[]'::jsonb));
END;
$$;

-- Snapshot fetched by the app server's SSRF-safe fetcher (lib/safe-fetch.ts); stored for the queue + web views.
CREATE OR REPLACE FUNCTION public.mcp_review_store_snapshot(p_token TEXT, p_id UUID, p_snapshot JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.tools__review_token(p_token);
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' OR octet_length(p_snapshot::text) > 40000 THEN
    RAISE EXCEPTION 'api_invalid:snapshot' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tool_submissions SET snapshot = p_snapshot, snapshot_at = NOW() WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_review_decide(p_token TEXT, p_id UUID, p_action TEXT, p_edits JSONB DEFAULT NULL, p_reason TEXT DEFAULT NULL, p_duplicate_of UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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

  -- approve: publish as a toolbox entry credited to the submitter
  IF EXISTS (SELECT 1 FROM public.toolbox_entries x WHERE x.canonical_url = s.url) THEN
    RAISE EXCEPTION 'api_invalid:duplicate_url' USING ERRCODE = 'P0001';
  END IF;
  v_slug := btrim(lower(regexp_replace(COALESCE(replace(s.source_repo, '/', '-'), s.name), '[^a-zA-Z0-9]+', '-', 'g')), '-');
  IF v_slug = '' THEN v_slug := 'tool-' || substr(md5(s.url), 1, 6); END IF;
  v_slug := left(v_slug, 60);
  IF EXISTS (SELECT 1 FROM public.toolbox_entries x WHERE x.slug = v_slug) THEN v_slug := left(v_slug, 50) || '-' || substr(md5(s.url), 1, 6); END IF;
  INSERT INTO public.toolbox_entries (name, slug, one_liner, description, type, tags, canonical_url, github_url, source_repo,
                                      install_snippets, mention_count, created_by_id)
  VALUES (s.name, v_slug, s.one_liner, s.description, s.type, s.tags, s.url, s.github_url, s.source_repo, s.install_snippets, 0, s.submitter_id)
  RETURNING * INTO e;
  UPDATE public.tool_submissions SET name = s.name, one_liner = s.one_liner, description = s.description, type = s.type, url = s.url,
    tags = s.tags, github_url = s.github_url, source_repo = s.source_repo, status = 'approved', reason = v_reason, entry_id = e.id,
    reviewer_id = t.member_id, reviewer_token_id = t.id, reviewer_label = v_label, reviewed_at = NOW(), updated_at = NOW()
  WHERE id = s.id RETURNING * INTO s;
  INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label, reason, changes)
  VALUES (s.id, 'approved', 'agent', t.member_id, t.id, v_label, v_reason, NULLIF(v_changes, '{}'::jsonb));
  RETURN public.tools__sub_json(s, FALSE);
END;
$$;

-- ------------------------------------------------------------------ web (cookie auth)
CREATE OR REPLACE FUNCTION public.tool_submission_withdraw(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); s public.tool_submissions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.tool_submissions WHERE id = p_id AND submitter_id = v_me FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'not_pending' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.tool_submissions SET status = 'withdrawn', updated_at = NOW() WHERE id = s.id RETURNING * INTO s;
  INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_label)
  SELECT s.id, 'withdrawn', 'member', v_me, m.display_name FROM public.members m WHERE m.id = v_me;
  RETURN public.tools__sub_json(s, FALSE);
END;
$$;

-- Public provenance line on a tool page: who submitted / which admin AI approved.
CREATE OR REPLACE FUNCTION public.tool_provenance(p_entry UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me();
BEGIN
  RETURN (SELECT jsonb_build_object('submittedBy', s.agent_label, 'submittedAt', s.created_at, 'approvedBy', s.reviewer_label,
            'approvedAt', s.reviewed_at, 'submitterId', s.submitter_id)
          FROM public.tool_submissions s WHERE s.entry_id = p_entry AND s.status = 'approved' ORDER BY s.reviewed_at DESC LIMIT 1);
END;
$$;

-- ------------------------------------------------------------------ grants
REVOKE ALL ON FUNCTION public.tools__norm_name(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tools__host(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tools__agent_label(public.api_tokens) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tools__review_token(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tools__sub_json(public.tool_submissions, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tools__duplicates(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tools__clean_tags(JSONB) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE sig TEXT;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.mcp_tool_submit(TEXT, JSONB)',
    'public.mcp_tool_submissions_mine(TEXT, INTEGER)',
    'public.mcp_toolbox_create(TEXT, JSONB)',
    'public.mcp_review_queue_list(TEXT, TEXT, INTEGER, INTEGER)',
    'public.mcp_review_get(TEXT, UUID)',
    'public.mcp_review_store_snapshot(TEXT, UUID, JSONB)',
    'public.mcp_review_decide(TEXT, UUID, TEXT, JSONB, TEXT, UUID)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', sig);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.tool_submission_withdraw(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tool_submission_withdraw(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.tool_provenance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tool_provenance(UUID) TO authenticated;
