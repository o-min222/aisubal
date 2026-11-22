-- 0058 MCP install_tool fix.
-- 1) install_tool demanded toolbox_write, which no connect preset issues → hidden / api_scope_missing
--    for every agent. It now works with any gallery read scope (the same as get_install_instructions).
-- 2) every call added +1 to install_count (an agent could inflate it in a loop). Installs are now
--    counted once per member per tool (MCP and web share the ledger); repeats only touch last_at.
CREATE TABLE IF NOT EXISTS public.toolbox_installs (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.toolbox_entries(id) ON DELETE CASCADE,
  via text NOT NULL DEFAULT 'web' CHECK (via IN ('web', 'mcp')),
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, entry_id)
);
ALTER TABLE public.toolbox_installs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.toolbox_installs FROM anon, authenticated;

-- true when this was the member's first install of the entry (and the counter moved)
CREATE OR REPLACE FUNCTION public.toolbox__install_once(p_member uuid, p_entry uuid, p_via text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_new boolean;
BEGIN
  INSERT INTO public.toolbox_installs (member_id, entry_id, via) VALUES (p_member, p_entry, p_via)
  ON CONFLICT (member_id, entry_id) DO UPDATE SET last_at = now()
  RETURNING (xmax = 0) INTO v_new;
  IF v_new THEN
    UPDATE public.toolbox_entries SET install_count = COALESCE(install_count, 0) + 1 WHERE id = p_entry;
  END IF;
  RETURN v_new;
END $fn$;
REVOKE ALL ON FUNCTION public.toolbox__install_once(uuid, uuid, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.toolbox__record_install(p_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_me uuid := public.app__me();
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.toolbox_entries WHERE id = p_entry_id) THEN RETURN; END IF;
  PERFORM public.toolbox__install_once(v_me, p_entry_id, 'web');
END $fn$;
REVOKE ALL ON FUNCTION public.toolbox__record_install(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.toolbox__record_install(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_toolbox_get(p_token text, p_entry text, p_record_install boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  t public.api_tokens%ROWTYPE;
  e public.toolbox_entries%ROWTYPE;
  p public.products%ROWTYPE;
  v_first boolean := false;
BEGIN
  t := public.api__token(p_token, ARRAY['toolbox_read', 'toolbox_write', 'products_read', 'products_write']);
  SELECT * INTO e FROM public.toolbox_entries
  WHERE slug = p_entry OR id::text = p_entry OR product_id::text = p_entry LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'api_not_found' USING ERRCODE = 'P0001'; END IF;
  IF p_record_install THEN
    PERFORM public.api__rate_check(t.id);
    v_first := public.toolbox__install_once(t.member_id, e.id, 'mcp');
    SELECT * INTO e FROM public.toolbox_entries WHERE id = e.id;
  END IF;
  IF e.product_id IS NOT NULL THEN SELECT * INTO p FROM public.products WHERE id = e.product_id; END IF;
  RETURN (to_jsonb(e) - 'created_by_id')
    || jsonb_build_object(
      'used_by_me', EXISTS (SELECT 1 FROM public.tool_users u WHERE u.entry_id = e.id AND u.member_id = t.member_id),
      'install_recorded', CASE WHEN p_record_install THEN CASE WHEN v_first THEN 'first' ELSE 'repeat' END END,
      'users', COALESCE((SELECT jsonb_agg(public.api__author_json(u.member_id, 'real') ORDER BY u.created_at DESC)
                         FROM (SELECT * FROM public.tool_users WHERE entry_id = e.id ORDER BY created_at DESC LIMIT 12) u), '[]'::jsonb),
      'launch', CASE WHEN p.id IS NULL THEN NULL ELSE public.product__json(p, NULL) END);
END $fn$;
