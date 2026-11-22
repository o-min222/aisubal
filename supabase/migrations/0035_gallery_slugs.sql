-- 0035: gallery slugs come from the entry name (fallback: the URL's last path segment), unique-suffixed.
-- Before, approval used owner/repo, so monorepo skills got the repo's slug (pstack → 'cursor-plugins').
-- Old slugs keep working through toolbox_slug_redirects (/gallery/<old> → /gallery/<new>).

CREATE OR REPLACE FUNCTION public.tools__slug_base(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT left(btrim(lower(regexp_replace(COALESCE(p_text, ''), '[^a-zA-Z0-9]+', '-', 'g')), '-'), 60) $$;

CREATE OR REPLACE FUNCTION public.tools__unique_slug(p_name TEXT, p_url TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_base TEXT := public.tools__slug_base(p_name);
  v_slug TEXT;
  i INT := 2;
BEGIN
  IF v_base = '' THEN   -- e.g. a Korean-only name: the URL's last path segment (…/tree/main/pstack → pstack)
    v_base := public.tools__slug_base(substring(regexp_replace(COALESCE(p_url, ''), '[?#].*$|/+$', '', 'g') FROM '([^/]+)$'));
  END IF;
  IF v_base = '' OR v_base ~ '^(new|launch|submissions)$' THEN   -- route names under /gallery
    v_base := CASE WHEN v_base = '' THEN 'tool-' || substr(md5(COALESCE(p_url, p_name, '')), 1, 6) ELSE v_base || '-tool' END;
  END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.toolbox_entries x WHERE x.slug = v_slug)
     OR EXISTS (SELECT 1 FROM public.toolbox_slug_redirects r WHERE r.old_slug = v_slug) LOOP
    v_slug := left(v_base, 56) || '-' || i;
    i := i + 1;
  END LOOP;
  RETURN v_slug;
END;
$$;

CREATE TABLE IF NOT EXISTS public.toolbox_slug_redirects (
  old_slug TEXT PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.toolbox_entries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.toolbox_slug_redirects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.toolbox_slug_redirects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.toolbox_slug_redirects TO authenticated;
DROP POLICY IF EXISTS toolbox_slug_redirects_select ON public.toolbox_slug_redirects;
CREATE POLICY toolbox_slug_redirects_select ON public.toolbox_slug_redirects FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()));

-- any slug change leaves a redirect behind (and a reused slug drops its stale redirect)
CREATE OR REPLACE FUNCTION public.toolbox_entries__slug_redirect()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    INSERT INTO public.toolbox_slug_redirects (old_slug, entry_id) VALUES (OLD.slug, NEW.id)
      ON CONFLICT (old_slug) DO UPDATE SET entry_id = EXCLUDED.entry_id, created_at = NOW();
    DELETE FROM public.toolbox_slug_redirects WHERE old_slug = NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.toolbox_entries__slug_redirect() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS toolbox_entries_slug_redirect ON public.toolbox_entries;
CREATE TRIGGER toolbox_entries_slug_redirect AFTER UPDATE OF slug ON public.toolbox_entries
  FOR EACH ROW EXECUTE FUNCTION public.toolbox_entries__slug_redirect();

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

  -- approve: publish as a toolbox entry credited to the submitter
  IF EXISTS (SELECT 1 FROM public.toolbox_entries x WHERE x.canonical_url = s.url) THEN
    RAISE EXCEPTION 'api_invalid:duplicate_url' USING ERRCODE = 'P0001';
  END IF;
  v_slug := public.tools__unique_slug(s.name, s.url);   -- 0035: from the name, not owner/repo
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
$function$;

-- pstack (approved from github.com/cursor/plugins/tree/main/pstack) got 'cursor-plugins'
UPDATE public.toolbox_entries SET slug = 'pstack', updated_at = NOW()
 WHERE id = '640c579a-703f-450d-9673-12913fe701d9' AND slug = 'cursor-plugins'
   AND NOT EXISTS (SELECT 1 FROM public.toolbox_entries x WHERE x.slug = 'pstack');
