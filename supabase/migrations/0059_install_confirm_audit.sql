-- 0059 admin install-confirm screen (/admin/installs).
-- tools_confirm_install: the NOT FOUND check ran after a PERFORM (which resets FOUND), so an
-- unknown id returned {id: null} instead of not_found. Also records who confirmed and when, and
-- adds the admin list RPC the screen uses.
ALTER TABLE public.toolbox_entries
  ADD COLUMN IF NOT EXISTS install_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS install_verified_by uuid REFERENCES public.members(id) ON DELETE SET NULL;
REVOKE SELECT (install_verified_by) ON public.toolbox_entries FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.tools_confirm_install(p_entry uuid, p_snippets jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE k TEXT; v JSONB; e public.toolbox_entries%ROWTYPE; v_found boolean;
BEGIN
  IF NOT COALESCE(public.app__is_admin(), FALSE) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_snippets IS NULL OR jsonb_typeof(p_snippets) <> 'object' OR octet_length(p_snippets::text) > 20000 THEN RAISE EXCEPTION 'install_invalid' USING ERRCODE = 'P0001'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_snippets) LOOP
    IF k NOT IN ('generic', 'claude_code', 'claude_desktop', 'cursor', 'codex_cli', 'gemini_cli', 'chatgpt')
       OR jsonb_typeof(v) <> 'string' OR char_length(v #>> '{}') > 4000 THEN
      RAISE EXCEPTION 'install_invalid' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  -- blank snippets don't count
  p_snippets := COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(p_snippets) WHERE btrim(value #>> '{}') <> ''), '{}'::jsonb);
  PERFORM set_config('app.install_verified', 'on', TRUE);
  UPDATE public.toolbox_entries SET install_snippets = p_snippets, install_verified = (p_snippets <> '{}'::jsonb),
         install_verified_at = CASE WHEN p_snippets <> '{}'::jsonb THEN NOW() END,
         install_verified_by = CASE WHEN p_snippets <> '{}'::jsonb THEN public.app__me() END,
         updated_at = NOW()
   WHERE id = p_entry RETURNING * INTO e;
  v_found := FOUND;
  PERFORM set_config('app.install_verified', '', TRUE);
  IF NOT v_found THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('id', e.id, 'slug', e.slug, 'installVerified', e.install_verified, 'verifiedAt', e.install_verified_at);
END $fn$;
REVOKE ALL ON FUNCTION public.tools_confirm_install(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tools_confirm_install(uuid, jsonb) TO authenticated;

-- admin list: every gallery entry with its install state (who confirmed is shown by name)
CREATE OR REPLACE FUNCTION public.tools_install_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NOT COALESCE(public.app__is_admin(), FALSE) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'name', e.name, 'type', e.type, 'oneLiner', e.one_liner,
      'canonicalUrl', e.canonical_url, 'homepageUrl', e.homepage_url, 'githubUrl', e.github_url,
      'sourceRepo', e.source_repo, 'license', e.license, 'lastCommitAt', e.last_commit_at,
      'verified', COALESCE(e.install_verified, false), 'snippets', COALESCE(e.install_snippets, '{}'::jsonb),
      'verifiedAt', e.install_verified_at, 'verifiedBy', m.display_name,
      'installCount', COALESCE(e.install_count, 0), 'createdAt', e.created_at, 'updatedAt', e.updated_at)
      ORDER BY COALESCE(e.install_verified, false), e.created_at DESC)
    FROM public.toolbox_entries e LEFT JOIN public.members m ON m.id = e.install_verified_by), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.tools_install_queue() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tools_install_queue() TO authenticated;
