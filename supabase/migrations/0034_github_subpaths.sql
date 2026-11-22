-- 0034: GitHub URLs keep /tree/<branch>/<path> and /blob/<branch>/<path> (monorepos host many skills).
-- Dedupe (toolbox_entries.canonical_url UNIQUE, pending submissions) runs on the full normalized path.
-- Mirrors canonicalUrl() in src/lib/toolbox-rules.ts. Depends on 0031 (tool_submissions.is_own / maker_note).

CREATE OR REPLACE FUNCTION public.tools__canonical(p_url TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE
  v TEXT;
  m TEXT[];
BEGIN
  IF p_url IS NULL OR btrim(p_url) = '' THEN RETURN NULL; END IF;
  v := regexp_replace(btrim(p_url), '[?#].*$', '');
  -- owner/repo are case-insensitive on GitHub; branch and path are not
  m := regexp_match(v, '^https?://(?:www\.)?github\.com/([^/]+)/([^/]+)/(tree|blob)/([^/]+)/(.*[^/])/*$', 'i');
  IF m IS NOT NULL THEN
    RETURN 'https://github.com/' || lower(m[1]) || '/' || regexp_replace(lower(m[2]), '\.git$', '') || '/' || lower(m[3]) || '/' || m[4] || '/' || m[5];
  END IF;
  -- repo root, or another repo page (issues, releases, tree/<branch> without a path …) → the repo
  m := regexp_match(v, '^https?://(?:www\.)?github\.com/([^/]+)/([^/]+)', 'i');
  IF m IS NOT NULL THEN
    RETURN 'https://github.com/' || lower(m[1]) || '/' || regexp_replace(lower(m[2]), '\.git$', '');
  END IF;
  RETURN 'https://' || lower(regexp_replace(regexp_replace(v, '^https?://(www\.)?', '', 'i'), '/+$', ''));
END;
$$;

-- 'owner/repo' of a canonical GitHub URL (with or without a subpath)
CREATE OR REPLACE FUNCTION public.tools__github_repo(p_url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT substring(p_url FROM '^https://github\.com/([^/]+/[^/]+)') $$;

CREATE OR REPLACE FUNCTION public.mcp_tool_submit(p_token text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  s public.tool_submissions%ROWTYPE;
  v_raw TEXT := btrim(COALESCE(p_payload->>'url', p_payload->>'canonical_url', ''));
  v_url TEXT;
  v_name TEXT := btrim(COALESCE(p_payload->>'name', ''));
  v_one TEXT := btrim(COALESCE(p_payload->>'oneLiner', p_payload->>'one_liner', ''));
  v_desc TEXT := btrim(COALESCE(p_payload->>'description', ''));
  v_note TEXT := btrim(COALESCE(p_payload->>'note', ''));
  v_kind TEXT := lower(btrim(COALESCE(p_payload->>'kind', '')));
  v_type TEXT := NULLIF(p_payload->>'type', '');
  v_own BOOLEAN := COALESCE(p_payload->>'isOwn', p_payload->>'is_own', p_payload->>'own', 'false') IN ('true', 't', '1', 'yes');
  v_maker TEXT := btrim(COALESCE(p_payload->>'maker', p_payload->>'makerNote', p_payload->>'maker_note', ''));
  v_snip JSONB := CASE WHEN jsonb_typeof(p_payload->'install_snippets') = 'object' AND octet_length((p_payload->'install_snippets')::text) <= 8000
                       THEN p_payload->'install_snippets' ELSE '{}'::jsonb END;
  v_entry RECORD;
BEGIN
  -- a maker's own service: the old launch_product scope (products_write) still works
  t := public.api__token(p_token, CASE WHEN v_own THEN ARRAY['tools:submit', 'products_write'] ELSE ARRAY['tools:submit'] END);
  IF v_kind NOT IN ('', 'tool', 'service') THEN RAISE EXCEPTION 'api_invalid:kind' USING ERRCODE = 'P0001'; END IF;
  -- product (런치) is not a submittable type any more: it is a service
  IF v_type = 'product' THEN v_type := 'saas_service'; END IF;
  v_type := COALESCE(v_type, CASE WHEN v_kind = 'tool' THEN 'mcp_server' ELSE 'saas_service' END);
  IF v_kind = 'service' AND v_type <> 'saas_service' THEN RAISE EXCEPTION 'api_invalid:kind_type_mismatch' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_maker) > 300 THEN RAISE EXCEPTION 'api_invalid:maker' USING ERRCODE = 'P0001'; END IF;
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
    RETURN jsonb_build_object('status', 'exists', 'entry', jsonb_build_object('id', v_entry.id, 'slug', v_entry.slug, 'name', v_entry.name, 'href', '/gallery/' || v_entry.slug),
      'message', '이미 갤러리에 있어요. set_tool_usage로 사용 중 표시를 하거나 아고라에 리뷰를 남겨주세요.');
  END IF;
  SELECT * INTO s FROM public.tool_submissions x WHERE x.url = v_url AND x.status = 'pending';
  IF FOUND THEN
    IF s.submitter_id = t.member_id THEN
      RETURN public.tools__sub_json(s, FALSE) || jsonb_build_object('deduped', TRUE);
    END IF;
    RETURN jsonb_build_object('status', 'already_submitted', 'message', '다른 멤버가 이미 같은 항목을 등록 요청했어요. 검토가 끝나면 갤러리에 올라와요.');
  END IF;
  IF (SELECT count(*) FROM public.tool_submissions x WHERE x.submitter_id = t.member_id AND x.status = 'pending') >= 10 THEN
    RAISE EXCEPTION 'api_rate_limited:pending' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.tool_submissions x WHERE x.submitter_id = t.member_id AND x.created_at > NOW() - INTERVAL '1 day') >= 20 THEN
    RAISE EXCEPTION 'api_rate_limited:daily' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tool_submissions (submitter_id, token_id, agent_label, name, one_liner, description, url, type, tags,
    github_url, source_repo, install_snippets, note, is_own, maker_note)
  VALUES (t.member_id, t.id, public.tools__agent_label(t), v_name, v_one, v_desc, v_url, v_type, public.tools__clean_tags(p_payload->'tags'),
    CASE WHEN v_url ~ '^https://github\.com/[^/]+/[^/]+' THEN v_url END,
    public.tools__github_repo(v_url),
    v_snip, v_note, v_own, CASE WHEN v_own THEN v_maker ELSE '' END)
  RETURNING * INTO s;
  INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label)
  VALUES (s.id, 'submitted', 'agent', t.member_id, t.id, s.agent_label);
  RETURN public.tools__sub_json(s, FALSE) || jsonb_build_object('message', '등록 요청을 받았어요. 관리자 검토 후 공개돼요.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.tools__duplicates(p_id uuid, p_url text, p_name text, p_repo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH n AS (SELECT public.tools__norm_name(p_name) AS nm, public.tools__host(p_url) AS host, lower(NULLIF(p_repo, '')) AS repo),
  e AS (
    SELECT 'entry'::text AS kind, x.id, x.slug, x.name, x.canonical_url AS url, NULL::text AS status,
      CASE
        WHEN x.canonical_url = p_url OR public.tools__canonical(x.homepage_url) = p_url OR public.tools__canonical(x.github_url) = p_url THEN 'same_url'
        -- monorepos host many skills: same repo only counts when both point at the repo itself
        WHEN n.repo IS NOT NULL AND lower(x.source_repo) = n.repo
             AND x.canonical_url = 'https://github.com/' || n.repo AND p_url = 'https://github.com/' || n.repo THEN 'same_repo'
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
$function$;

-- the pstack submission was stored at the repo root (cursor/plugins); restore its full path
UPDATE public.tool_submissions
   SET url = 'https://github.com/cursor/plugins/tree/main/pstack',
       github_url = 'https://github.com/cursor/plugins/tree/main/pstack',
       updated_at = NOW()
 WHERE id = '06b8715c-01e0-46b7-a28a-72ded78c44d8' AND url = 'https://github.com/cursor/plugins';
