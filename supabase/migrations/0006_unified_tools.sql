-- 0006: 툴박스 + 프로덕트 → one '툴' section
--
--  * toolbox_entries is the single list. Product launches become entries of
--    type 'product' linked by product_id (products/upvotes/comments/updates
--    stay as the launch detail tables, nothing is dropped).
--  * New counters kept by SECURITY DEFINER triggers: user_count (사용 중),
--    upvote_count (launch upvotes), ai_rating_avg/count (Agora AI 평가),
--    and avg_rating/rating_count now recomputed on every review.
--  * tool_users: members mark tools they use ('사용 중').

-- ------------------------------------------------------------------ columns
ALTER TABLE public.toolbox_entries DROP CONSTRAINT IF EXISTS toolbox_entries_type_check;
ALTER TABLE public.toolbox_entries ADD CONSTRAINT toolbox_entries_type_check CHECK (type IN (
  'agent_skill', 'mcp_server', 'cursor_rules', 'prompt', 'cli_tool', 'saas_service', 'product'));

ALTER TABLE public.toolbox_entries
  ADD COLUMN IF NOT EXISTS product_id UUID UNIQUE REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upvote_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_rating_avg NUMERIC(3, 1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_rating_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_toolbox_created ON public.toolbox_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_toolbox_ai ON public.toolbox_entries(ai_rating_avg DESC, ai_rating_count DESC);

-- Clients can never forge counters or the product link.
CREATE OR REPLACE FUNCTION public.toolbox_entries_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.product_id := NULL; NEW.launched_at := NULL; NEW.user_count := 0; NEW.upvote_count := 0;
      NEW.ai_rating_avg := 0; NEW.ai_rating_count := 0;
      IF NEW.type = 'product' THEN NEW.type := 'saas_service'; END IF;
    ELSE
      NEW.product_id := OLD.product_id; NEW.launched_at := OLD.launched_at; NEW.user_count := OLD.user_count;
      NEW.upvote_count := OLD.upvote_count; NEW.ai_rating_avg := OLD.ai_rating_avg; NEW.ai_rating_count := OLD.ai_rating_count;
      IF NEW.type = 'product' AND OLD.type <> 'product' THEN NEW.type := OLD.type; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS toolbox_entries_guard ON public.toolbox_entries;
CREATE TRIGGER toolbox_entries_guard BEFORE INSERT OR UPDATE ON public.toolbox_entries
  FOR EACH ROW EXECUTE FUNCTION public.toolbox_entries_guard();

-- ------------------------------------------------------------------ 사용 중
CREATE TABLE IF NOT EXISTS public.tool_users (
  entry_id UUID NOT NULL REFERENCES public.toolbox_entries(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_tool_users_member ON public.tool_users(member_id, created_at DESC);

ALTER TABLE public.tool_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_users FROM anon;
GRANT SELECT, INSERT, DELETE ON public.tool_users TO authenticated;
DROP POLICY IF EXISTS tool_users_select ON public.tool_users;
CREATE POLICY tool_users_select ON public.tool_users FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()));
DROP POLICY IF EXISTS tool_users_insert ON public.tool_users;
CREATE POLICY tool_users_insert ON public.tool_users FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_completed_member()) AND member_id = (SELECT public.current_member_id()));
DROP POLICY IF EXISTS tool_users_delete ON public.tool_users;
CREATE POLICY tool_users_delete ON public.tool_users FOR DELETE TO authenticated
  USING (member_id = (SELECT public.current_member_id()));

CREATE OR REPLACE FUNCTION public.tool_users_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v UUID := COALESCE(NEW.entry_id, OLD.entry_id);
BEGIN
  UPDATE public.toolbox_entries SET user_count = (SELECT count(*) FROM public.tool_users WHERE entry_id = v) WHERE id = v;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS tool_users_counter ON public.tool_users;
CREATE TRIGGER tool_users_counter AFTER INSERT OR DELETE ON public.tool_users
  FOR EACH ROW EXECUTE FUNCTION public.tool_users_counter();

-- ------------------------------------------------------------------ reviews → avg_rating
CREATE OR REPLACE FUNCTION public.toolbox_reviews_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v UUID := COALESCE(NEW.entry_id, OLD.entry_id);
BEGIN
  UPDATE public.toolbox_entries e SET
    avg_rating = COALESCE((SELECT round(avg(r.rating)::numeric, 1) FROM public.toolbox_reviews r WHERE r.entry_id = v), 0),
    rating_count = (SELECT count(*) FROM public.toolbox_reviews r WHERE r.entry_id = v)
  WHERE e.id = v;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS toolbox_reviews_counter ON public.toolbox_reviews;
CREATE TRIGGER toolbox_reviews_counter AFTER INSERT OR UPDATE OR DELETE ON public.toolbox_reviews
  FOR EACH ROW EXECUTE FUNCTION public.toolbox_reviews_counter();

-- ------------------------------------------------------------------ Agora → AI 평가
CREATE OR REPLACE FUNCTION public.toolbox__recompute_ai(p_entry UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.toolbox_entries e SET
    ai_rating_avg = COALESCE((SELECT round(avg(a.rating)::numeric, 1) FROM public.agora_posts a
                              WHERE a.toolbox_entry_id = p_entry AND a.rating IS NOT NULL AND NOT a.is_hidden), 0),
    ai_rating_count = (SELECT count(*) FROM public.agora_posts a
                       WHERE a.toolbox_entry_id = p_entry AND a.rating IS NOT NULL AND NOT a.is_hidden)
  WHERE e.id = p_entry;
$$;

CREATE OR REPLACE FUNCTION public.agora_ai_rating_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.toolbox_entry_id IS NOT NULL THEN PERFORM public.toolbox__recompute_ai(OLD.toolbox_entry_id); END IF;
  IF TG_OP <> 'DELETE' AND NEW.toolbox_entry_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.toolbox_entry_id IS DISTINCT FROM OLD.toolbox_entry_id
          OR NEW.rating IS DISTINCT FROM OLD.rating OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden) THEN
    PERFORM public.toolbox__recompute_ai(NEW.toolbox_entry_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS agora_ai_rating_counter ON public.agora_posts;
CREATE TRIGGER agora_ai_rating_counter AFTER INSERT OR UPDATE OR DELETE ON public.agora_posts
  FOR EACH ROW EXECUTE FUNCTION public.agora_ai_rating_counter();

-- ------------------------------------------------------------------ products → tools
CREATE OR REPLACE FUNCTION public.tools__canonical(p_url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  -- mirrors canonicalUrl() in src/lib/toolbox-rules.ts (scheme/www/query/hash/trailing slash)
  SELECT CASE WHEN p_url IS NULL OR btrim(p_url) = '' THEN NULL ELSE
    CASE WHEN lower(p_url) ~ '^https?://(www\.)?github\.com/[^/]+/[^/?#]+'
      THEN 'https://github.com/' || lower(substring(p_url FROM '(?i)github\.com/([^/]+/[^/?#]+)'))
      ELSE 'https://' || lower(regexp_replace(regexp_replace(regexp_replace(btrim(p_url), '^https?://(www\.)?', '', 'i'), '[?#].*$', ''), '/+$', ''))
    END
  END;
$$;

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
      github_url = COALESCE(p.github_url, github_url), featured = featured OR p.featured, updated_at = NOW()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- same URL already in the directory → attach the launch to that tool
  IF v_url IS NOT NULL THEN
    SELECT * INTO e FROM public.toolbox_entries WHERE canonical_url = v_url;
    IF FOUND AND e.product_id IS NULL THEN
      UPDATE public.toolbox_entries SET product_id = p.id, launched_at = p.launched_at,
        icon_url = COALESCE(icon_url, p.logo_url), tags = ARRAY(SELECT DISTINCT unnest(tags || p.tags)), updated_at = NOW()
      WHERE id = e.id;
      RETURN e.id;
    ELSIF FOUND THEN
      v_url := NULL;
    END IF;
  END IF;

  v_slug := trim(BOTH '-' FROM lower(regexp_replace(p.name, '[^a-zA-Z0-9가-힣]+', '-', 'g')));
  IF v_slug = '' THEN v_slug := 'launch'; END IF;
  v_slug := left(v_slug, 60);
  IF EXISTS (SELECT 1 FROM public.toolbox_entries WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(replace(p.id::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.toolbox_entries (name, slug, one_liner, description, type, tags, icon_url, canonical_url,
    github_url, homepage_url, install_snippets, created_by_id, featured, product_id, launched_at, created_at)
  VALUES (left(p.name, 80), v_slug, left(p.tagline, 200), p.description, 'product', p.tags, p.logo_url,
    COALESCE(v_url, 'https://aisubal.vercel.app/launch/' || p.id), p.github_url, p.website_url,
    jsonb_build_object('generic', 'Visit ' || COALESCE(p.website_url, p.github_url, p.app_store_url, 'https://aisubal.vercel.app/tools')),
    p.maker_ids[1], p.featured, p.id, p.launched_at, p.created_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.products_sync_tool()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.tools__sync_product(NEW);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS products_sync_tool ON public.products;
CREATE TRIGGER products_sync_tool AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_sync_tool();

CREATE OR REPLACE FUNCTION public.product_upvotes_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v UUID := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE public.toolbox_entries SET upvote_count = (SELECT count(*) FROM public.product_upvotes WHERE product_id = v)
  WHERE product_id = v;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS product_upvotes_counter ON public.product_upvotes;
CREATE TRIGGER product_upvotes_counter AFTER INSERT OR DELETE ON public.product_upvotes
  FOR EACH ROW EXECUTE FUNCTION public.product_upvotes_counter();

-- ------------------------------------------------------------------ backfill
DO $$
DECLARE p public.products%ROWTYPE;
BEGIN
  FOR p IN SELECT * FROM public.products ORDER BY created_at LOOP
    PERFORM public.tools__sync_product(p);
  END LOOP;
END $$;
UPDATE public.toolbox_entries e SET upvote_count = (SELECT count(*) FROM public.product_upvotes u WHERE u.product_id = e.product_id)
  WHERE e.product_id IS NOT NULL;
UPDATE public.toolbox_entries e SET
  avg_rating = COALESCE((SELECT round(avg(r.rating)::numeric, 1) FROM public.toolbox_reviews r WHERE r.entry_id = e.id), 0),
  rating_count = (SELECT count(*) FROM public.toolbox_reviews r WHERE r.entry_id = e.id)
  WHERE EXISTS (SELECT 1 FROM public.toolbox_reviews r WHERE r.entry_id = e.id);
SELECT public.toolbox__recompute_ai(id) FROM public.toolbox_entries
  WHERE id IN (SELECT DISTINCT toolbox_entry_id FROM public.agora_posts WHERE toolbox_entry_id IS NOT NULL);

-- ------------------------------------------------------------------ MCP (token RPCs)
CREATE OR REPLACE FUNCTION public.tools__json(e public.toolbox_entries)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (to_jsonb(e) - 'created_by_id' - 'install_snippets');
$$;

DROP FUNCTION IF EXISTS public.mcp_toolbox_list(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.mcp_tools_list(
  p_token TEXT, p_category TEXT DEFAULT NULL, p_tag TEXT DEFAULT NULL, p_query TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'popular', p_mine BOOLEAN DEFAULT FALSE, p_limit INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  v_types TEXT[] := CASE lower(COALESCE(p_category, ''))
    WHEN '' THEN NULL WHEN 'all' THEN NULL
    WHEN 'mcp' THEN ARRAY['mcp_server'] WHEN 'skill' THEN ARRAY['agent_skill'] WHEN 'prompt' THEN ARRAY['prompt']
    WHEN 'rules' THEN ARRAY['cursor_rules'] WHEN 'cli' THEN ARRAY['cli_tool']
    WHEN 'service' THEN ARRAY['saas_service', 'product'] WHEN 'launch' THEN ARRAY['product']
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
        AND (NOT COALESCE(p_mine, FALSE) OR EXISTS (SELECT 1 FROM public.tool_users u WHERE u.entry_id = e.id AND u.member_id = t.member_id))
      ORDER BY rk
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
    ) s JOIN public.toolbox_entries x ON x.id = s.id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_toolbox_get(p_token TEXT, p_entry TEXT, p_record_install BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.api_tokens%ROWTYPE;
  e public.toolbox_entries%ROWTYPE;
  p public.products%ROWTYPE;
BEGIN
  IF p_record_install THEN
    t := public.api__token(p_token, ARRAY['toolbox_write']);
  ELSE
    t := public.api__token(p_token, ARRAY['toolbox_read', 'toolbox_write', 'products_read', 'products_write']);
  END IF;
  SELECT * INTO e FROM public.toolbox_entries
  WHERE slug = p_entry OR id::text = p_entry OR product_id::text = p_entry LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  IF p_record_install THEN
    UPDATE public.toolbox_entries SET install_count = COALESCE(install_count, 0) + 1 WHERE id = e.id RETURNING * INTO e;
  END IF;
  IF e.product_id IS NOT NULL THEN SELECT * INTO p FROM public.products WHERE id = e.product_id; END IF;
  RETURN (to_jsonb(e) - 'created_by_id')
    || jsonb_build_object(
      'used_by_me', EXISTS (SELECT 1 FROM public.tool_users u WHERE u.entry_id = e.id AND u.member_id = t.member_id),
      'users', COALESCE((SELECT jsonb_agg(public.api__author_json(u.member_id, 'real') ORDER BY u.created_at DESC)
                         FROM (SELECT * FROM public.tool_users WHERE entry_id = e.id ORDER BY created_at DESC LIMIT 12) u), '[]'::jsonb),
      'launch', CASE WHEN p.id IS NULL THEN NULL ELSE public.product__json(p, NULL) END);
END;
$$;

-- '사용 중' for the token owner (the agent acts for its member).
CREATE OR REPLACE FUNCTION public.mcp_tool_usage(p_token TEXT, p_entry TEXT, p_using BOOLEAN DEFAULT TRUE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t public.api_tokens%ROWTYPE; v UUID; n INTEGER;
BEGIN
  t := public.api__token(p_token, ARRAY['toolbox_write']);
  SELECT id INTO v FROM public.toolbox_entries WHERE slug = p_entry OR id::text = p_entry LIMIT 1;
  IF v IS NULL THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  IF p_using THEN
    INSERT INTO public.tool_users(entry_id, member_id) VALUES (v, t.member_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.tool_users WHERE entry_id = v AND member_id = t.member_id;
  END IF;
  SELECT user_count INTO n FROM public.toolbox_entries WHERE id = v;
  RETURN jsonb_build_object('entryId', v, 'using', p_using, 'userCount', n);
END;
$$;

-- ------------------------------------------------------------------ grants
REVOKE ALL ON FUNCTION public.tools__json(public.toolbox_entries) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tools__sync_product(public.products) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toolbox__recompute_ai(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tool_users_counter() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toolbox_reviews_counter() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agora_ai_rating_counter() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.products_sync_tool() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_upvotes_counter() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toolbox_entries_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tools_list(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_toolbox_get(TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tool_usage(TEXT, TEXT, BOOLEAN) TO anon, authenticated;
