-- 0077 G1 '나도 써요': who sees my usage marks, and installs reconciled into usage.
--  * tool_users was readable by every member, ignoring privacy. Each member now picks who sees
--    their marks (member_stack_settings.usage_vis: members / friends / private, default members).
--    RLS applies it to every client read (gallery stacks, detail list, profile, co-usage recs);
--    the counter (toolbox_entries.user_count) still counts everyone, so totals stay honest
--    without naming anyone. Marks belong to the real-name profile only (never a 부캐).
--  * The SECURITY DEFINER MCP read (mcp_toolbox_get) lists users with the same rule, seen from
--    the token owner.
--  * Reconcile with installs: when a member's own agent installs a tool for them through MCP
--    (install_tool, first time), that is the member using it, so it also marks '나도 써요'.
--    Web snippet copies stay an install signal only. The member can unmark any time.

ALTER TABLE public.member_stack_settings
  ADD COLUMN IF NOT EXISTS usage_vis text NOT NULL DEFAULT 'members' CHECK (usage_vis IN ('members', 'friends', 'private'));

CREATE OR REPLACE FUNCTION public.tool_usage__visible_to(p_viewer uuid, p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_viewer IS NOT NULL AND (
    p_member = p_viewer
    OR (SELECT CASE COALESCE((SELECT s.usage_vis FROM public.member_stack_settings s WHERE s.member_id = p_member), 'members')
          WHEN 'members' THEN true
          WHEN 'friends' THEN public.social__friend_state(p_viewer, p_member) = 'friends'
          ELSE false END))
$$;
REVOKE ALL ON FUNCTION public.tool_usage__visible_to(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tool_usage__visible_to(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS tool_users_select ON public.tool_users;
CREATE POLICY tool_users_select ON public.tool_users FOR SELECT TO authenticated
  USING ((SELECT public.is_completed_member()) AND public.tool_usage__visible_to((SELECT public.current_member_id()), member_id));

CREATE OR REPLACE FUNCTION public.tool_usage_visibility() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT usage_vis FROM public.member_stack_settings WHERE member_id = public.app__me()), 'members')
$$;
REVOKE ALL ON FUNCTION public.tool_usage_visibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tool_usage_visibility() TO authenticated;

CREATE OR REPLACE FUNCTION public.tool_usage_set_visibility(p_vis text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_me uuid := public.app__me();
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF p_vis IS NULL OR p_vis NOT IN ('members', 'friends', 'private') THEN RAISE EXCEPTION 'usage_vis_invalid' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.member_stack_settings (member_id, usage_vis) VALUES (v_me, p_vis)
  ON CONFLICT (member_id) DO UPDATE SET usage_vis = excluded.usage_vis, updated_at = now();
  RETURN p_vis;
END $$;
REVOKE ALL ON FUNCTION public.tool_usage_set_visibility(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tool_usage_set_visibility(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.toolbox__install_once(p_member uuid, p_entry uuid, p_via text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_new boolean;
BEGIN
  INSERT INTO public.toolbox_installs (member_id, entry_id, via) VALUES (p_member, p_entry, p_via)
  ON CONFLICT (member_id, entry_id) DO UPDATE SET last_at = now()
  RETURNING (xmax = 0) INTO v_new;
  IF v_new THEN
    UPDATE public.toolbox_entries SET install_count = COALESCE(install_count, 0) + 1 WHERE id = p_entry;
    IF p_via = 'mcp' THEN
      INSERT INTO public.tool_users (entry_id, member_id) VALUES (p_entry, p_member) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN v_new;
END $fn$;
REVOKE ALL ON FUNCTION public.toolbox__install_once(uuid, uuid, text) FROM public, anon, authenticated;

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
                         FROM (SELECT * FROM public.tool_users x WHERE x.entry_id = e.id
                                 AND public.tool_usage__visible_to(t.member_id, x.member_id)
                               ORDER BY x.created_at DESC LIMIT 12) u), '[]'::jsonb),
      'launch', CASE WHEN p.id IS NULL THEN NULL ELSE public.product__json(p, NULL) END);
END $fn$;
GRANT EXECUTE ON FUNCTION public.mcp_toolbox_get(text, text, boolean) TO anon, authenticated;
