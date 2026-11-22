-- 0031: 갤러리 = MCP / 스킬 / CLI / 서비스, and members can register services they made.
--
--  * toolbox_entries.kind ('tool' | 'service') is derived from type, so it can't drift:
--    saas_service and product (the former 런치) are services; everything else is a tool.
--  * toolbox_entries.maker_ids / is_own: who made it. Launches already had makers; an approved
--    "내가 만든 서비스예요" submission adds the submitter. is_own drives the 제작자 badge.
--  * tool_submissions gets kind / is_own / maker_note. Own services go through the review queue
--    too: the direct product insert policy is dropped.
--  * An approved own service gets a products row (upvotes, screenshots, updates, links) that its
--    makers edit inline on the service page; products_sync_tool (0006) links it to the entry.
--  * list_tools categories: mcp | skill | cli | service. Old ids still work:
--    prompt / rules → skill, launch → service. The type values themselves are unchanged.

ALTER TABLE public.toolbox_entries ADD COLUMN IF NOT EXISTS maker_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE public.toolbox_entries ADD COLUMN IF NOT EXISTS kind TEXT
  GENERATED ALWAYS AS (CASE WHEN type IN ('saas_service', 'product') THEN 'service' ELSE 'tool' END) STORED;
ALTER TABLE public.toolbox_entries ADD COLUMN IF NOT EXISTS is_own BOOLEAN
  GENERATED ALWAYS AS (cardinality(maker_ids) > 0) STORED;
CREATE INDEX IF NOT EXISTS idx_toolbox_entries_kind ON public.toolbox_entries(kind);

UPDATE public.toolbox_entries e SET maker_ids = p.maker_ids
FROM public.products p WHERE p.id = e.product_id AND e.maker_ids = '{}' AND cardinality(p.maker_ids) > 0;

ALTER TABLE public.tool_submissions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'tool';
ALTER TABLE public.tool_submissions ADD COLUMN IF NOT EXISTS is_own BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.tool_submissions ADD COLUMN IF NOT EXISTS maker_note TEXT NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE public.tool_submissions ADD CONSTRAINT tool_submissions_kind_chk CHECK (kind IN ('tool', 'service'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.tool_submissions ADD CONSTRAINT tool_submissions_maker_note_chk CHECK (char_length(maker_note) <= 300);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE public.tool_submissions SET kind = 'service' WHERE type = 'saas_service' AND kind <> 'service';

-- kind follows type on every write (a review edit can change type)
CREATE OR REPLACE FUNCTION public.tool_submissions_kind()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.kind := CASE WHEN NEW.type = 'saas_service' THEN 'service' ELSE 'tool' END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tool_submissions_kind ON public.tool_submissions;
CREATE TRIGGER tool_submissions_kind BEFORE INSERT OR UPDATE OF type ON public.tool_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tool_submissions_kind();

-- humans can't rewrite maker_ids through the entry update policy
CREATE OR REPLACE FUNCTION public.toolbox_entries_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.product_id := NULL; NEW.launched_at := NULL; NEW.user_count := 0; NEW.upvote_count := 0;
      NEW.ai_rating_avg := 0; NEW.ai_rating_count := 0; NEW.maker_ids := '{}';
      IF NEW.type = 'product' THEN NEW.type := 'saas_service'; END IF;
    ELSE
      NEW.product_id := OLD.product_id; NEW.launched_at := OLD.launched_at; NEW.user_count := OLD.user_count;
      NEW.upvote_count := OLD.upvote_count; NEW.ai_rating_avg := OLD.ai_rating_avg; NEW.ai_rating_count := OLD.ai_rating_count;
      NEW.maker_ids := OLD.maker_ids;
      IF NEW.type = 'product' AND OLD.type <> 'product' THEN NEW.type := OLD.type; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- product makers flow onto the linked entry (insert, attach and update)
CREATE OR REPLACE FUNCTION public.tools__sync_product(p public.products)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_url TEXT := COALESCE(public.tools__canonical(p.website_url), public.tools__canonical(p.github_url),
                         public.tools__canonical(p.app_store_url));
  v_slug TEXT;
  e public.toolbox_entries%ROWTYPE;
BEGIN
  SELECT id INTO v_id FROM public.toolbox_entries WHERE product_id = p.id;
  IF v_id IS NOT NULL THEN
    UPDATE public.toolbox_entries SET
      name = left(p.name, 80), one_liner = left(p.tagline, 200), description = p.description,
      tags = p.tags, icon_url = COALESCE(p.logo_url, icon_url), homepage_url = COALESCE(p.website_url, homepage_url),
      github_url = COALESCE(p.github_url, github_url), featured = featured OR p.featured,
      maker_ids = ARRAY(SELECT DISTINCT x FROM unnest(maker_ids || p.maker_ids) x), updated_at = NOW()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- same URL already in the gallery → attach the product to that entry
  IF v_url IS NOT NULL THEN
    SELECT * INTO e FROM public.toolbox_entries WHERE canonical_url = v_url;
    IF FOUND AND e.product_id IS NULL THEN
      UPDATE public.toolbox_entries SET product_id = p.id, launched_at = p.launched_at,
        icon_url = COALESCE(icon_url, p.logo_url), tags = ARRAY(SELECT DISTINCT unnest(tags || p.tags)),
        maker_ids = ARRAY(SELECT DISTINCT x FROM unnest(maker_ids || p.maker_ids) x), updated_at = NOW()
      WHERE id = e.id;
      RETURN e.id;
    ELSIF FOUND THEN
      v_url := NULL;
    END IF;
  END IF;

  v_slug := trim(BOTH '-' FROM lower(regexp_replace(p.name, '[^a-zA-Z0-9가-힣]+', '-', 'g')));
  IF v_slug = '' THEN v_slug := 'service'; END IF;
  v_slug := left(v_slug, 60);
  IF EXISTS (SELECT 1 FROM public.toolbox_entries WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(replace(p.id::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.toolbox_entries (name, slug, one_liner, description, type, tags, icon_url, canonical_url,
    github_url, homepage_url, install_snippets, created_by_id, featured, product_id, launched_at, created_at, maker_ids)
  VALUES (left(p.name, 80), v_slug, left(p.tagline, 200), p.description, 'product', p.tags, p.logo_url,
    COALESCE(v_url, 'https://aisubal.vercel.app/launch/' || p.id), p.github_url, p.website_url,
    jsonb_build_object('generic', 'Visit ' || COALESCE(p.website_url, p.github_url, p.app_store_url, 'https://aisubal.vercel.app/gallery')),
    p.maker_ids[1], p.featured, p.id, p.launched_at, p.created_at, p.maker_ids)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tools__sync_product(public.products) FROM PUBLIC, anon, authenticated;

-- New services come through the review queue; makers still edit their own product rows.
DROP POLICY IF EXISTS products_insert ON public.products;

-- An approved "내가 만든 서비스예요" credits the submitter as maker and opens the maker extras.
CREATE OR REPLACE FUNCTION public.tool_submissions_on_approve()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE e public.toolbox_entries%ROWTYPE;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' OR NOT NEW.is_own OR NEW.entry_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.toolbox_entries SET maker_ids = ARRAY(SELECT DISTINCT x FROM unnest(maker_ids || ARRAY[NEW.submitter_id]) x)
  WHERE id = NEW.entry_id RETURNING * INTO e;
  IF e.kind = 'service' AND e.product_id IS NULL THEN
    INSERT INTO public.products (name, tagline, description, website_url, github_url, tags, maker_ids, featured, launched_at)
    VALUES (left(e.name, 80), left(e.one_liner, 140), COALESCE(NULLIF(e.description, ''), e.one_liner),
            e.canonical_url, e.github_url, e.tags[1:8], ARRAY[NEW.submitter_id], FALSE, NOW());
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tool_submissions_on_approve() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tool_submissions_on_approve ON public.tool_submissions;
CREATE TRIGGER tool_submissions_on_approve AFTER UPDATE OF status ON public.tool_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tool_submissions_on_approve();

-- ------------------------------------------------------------------ JSON
CREATE OR REPLACE FUNCTION public.tools__sub_json(s public.tool_submissions, p_full BOOLEAN)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'name', s.name, 'oneLiner', s.one_liner, 'url', s.url, 'type', s.type, 'kind', s.kind,
    'isOwn', s.is_own, 'maker', NULLIF(s.maker_note, ''), 'tags', to_jsonb(s.tags),
    'status', s.status, 'submittedBy', s.agent_label, 'createdAt', s.created_at,
    'reviewedBy', s.reviewer_label, 'reviewedAt', s.reviewed_at, 'reason', s.reason,
    'entry', (SELECT jsonb_build_object('id', e.id, 'slug', e.slug, 'href', '/gallery/' || e.slug) FROM public.toolbox_entries e WHERE e.id = s.entry_id),
    'duplicateOf', (SELECT jsonb_build_object('id', e.id, 'slug', e.slug, 'name', e.name, 'href', '/gallery/' || e.slug) FROM public.toolbox_entries e WHERE e.id = s.duplicate_of),
    'statusUrl', '/gallery/submissions?open=' || s.id
  ) || CASE WHEN p_full THEN jsonb_build_object(
    'description', s.description, 'note', s.note, 'githubUrl', s.github_url, 'sourceRepo', s.source_repo,
    'installSnippets', s.install_snippets, 'snapshot', s.snapshot, 'snapshotAt', s.snapshot_at, 'updatedAt', s.updated_at
  ) ELSE '{}'::jsonb END
$$;

-- ------------------------------------------------------------------ MCP
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
    CASE WHEN v_url ~ '^https://github\.com/[^/]+/[^/]+$' THEN v_url END,
    CASE WHEN v_url ~ '^https://github\.com/[^/]+/[^/]+$' THEN substring(v_url FROM '^https://github\.com/(.+)$') END,
    v_snip, v_note, v_own, CASE WHEN v_own THEN v_maker ELSE '' END)
  RETURNING * INTO s;
  INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label)
  VALUES (s.id, 'submitted', 'agent', t.member_id, t.id, s.agent_label);
  RETURN public.tools__sub_json(s, FALSE) || jsonb_build_object('message', '등록 요청을 받았어요. 관리자 검토 후 공개돼요.');
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_tools_list(
  p_token TEXT, p_category TEXT DEFAULT NULL, p_tag TEXT DEFAULT NULL, p_query TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'popular', p_mine BOOLEAN DEFAULT FALSE, p_limit INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_types TEXT[] := CASE lower(COALESCE(p_category, ''))
    WHEN '' THEN NULL WHEN 'all' THEN NULL
    WHEN 'mcp' THEN ARRAY['mcp_server']
    -- 스킬 covers rules and prompts (old category ids still accepted)
    WHEN 'skill' THEN ARRAY['agent_skill', 'cursor_rules', 'prompt'] WHEN 'prompt' THEN ARRAY['agent_skill', 'cursor_rules', 'prompt']
    WHEN 'rules' THEN ARRAY['agent_skill', 'cursor_rules', 'prompt'] WHEN 'cli' THEN ARRAY['cli_tool']
    -- 서비스 includes member launches (former 'launch' category)
    WHEN 'service' THEN ARRAY['saas_service', 'product'] WHEN 'launch' THEN ARRAY['saas_service', 'product']
    WHEN 'own' THEN NULL
    ELSE ARRAY[p_category] END;
BEGIN
  t := public.api__token(p_token, ARRAY['toolbox_read', 'toolbox_write', 'products_read', 'products_write']);
  RETURN COALESCE((
    SELECT jsonb_agg(public.tools__json(x) || jsonb_build_object('used_by_me',
             EXISTS (SELECT 1 FROM public.tool_users u WHERE u.entry_id = x.id AND u.member_id = t.member_id)) ORDER BY s.rk)
    FROM (
      SELECT e.id, row_number() OVER (ORDER BY
        CASE p_sort
          WHEN 'newest' THEN extract(epoch FROM COALESCE(e.launched_at, e.created_at))
          WHEN 'ai' THEN e.ai_rating_avg * 1000 + e.ai_rating_count
          WHEN 'rated' THEN e.avg_rating * 1000 + e.rating_count
          WHEN 'users' THEN e.user_count
          WHEN 'upvotes' THEN e.upvote_count
          ELSE e.user_count * 3 + e.mention_count * 2 + e.install_count + e.upvote_count * 2
               + e.avg_rating * e.rating_count + CASE WHEN e.featured THEN 5 ELSE 0 END
        END DESC, e.created_at DESC) rk
      FROM public.toolbox_entries e
      WHERE (v_types IS NULL OR e.type = ANY (v_types))
        AND (p_tag IS NULL OR p_tag = '' OR lower(p_tag) = ANY (SELECT lower(x) FROM unnest(e.tags) x))
        AND (p_query IS NULL OR p_query = '' OR concat_ws(' ', e.name, e.one_liner, e.description, array_to_string(e.tags, ' '))
             ILIKE '%' || p_query || '%')
        AND (lower(COALESCE(p_category, '')) <> 'own' OR e.is_own)
        AND (NOT COALESCE(p_mine, FALSE) OR EXISTS (SELECT 1 FROM public.tool_users u WHERE u.entry_id = e.id AND u.member_id = t.member_id))
      ORDER BY rk
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
    ) s JOIN public.toolbox_entries x ON x.id = s.id
  ), '[]'::jsonb);
END;
$$;
