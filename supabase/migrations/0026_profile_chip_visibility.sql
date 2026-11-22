-- 0026: profile edit redesign.
--  * Per-chip visibility ('lock' in the chip menu): member_stack_items.visibility,
--    NULL = follow the group's visibility. A chip can only be narrower than its group.
--  * 내 에이전트 is the single place for agents: the self-registered member_agents
--    list is gone (0 rows at migration time). Profile agents = connected agents with
--    show_on_profile (profile_agents()).

ALTER TABLE public.member_stack_items
  ADD COLUMN IF NOT EXISTS visibility text CHECK (visibility IS NULL OR visibility IN ('members', 'friends', 'private'));

CREATE OR REPLACE FUNCTION public.profile_stack_save(p jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
  g text;
  x jsonb;
  i integer;
  v_entry uuid;
  v_vis jsonb := COALESCE(p -> 'vis', '{}'::jsonb);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'stack_invalid' USING ERRCODE = 'P0001'; END IF;
  FOREACH g IN ARRAY ARRAY['ai', 'subs', 'skills'] LOOP
    IF p ? g AND (jsonb_typeof(p -> g) <> 'array' OR jsonb_array_length(p -> g) > 20) THEN
      RAISE EXCEPTION 'stack_invalid:%', g USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  FOREACH g IN ARRAY ARRAY['ai', 'subs', 'skills'] LOOP
    CONTINUE WHEN NOT p ? g;
    DELETE FROM public.member_stack_items WHERE member_id = v_me AND grp = g;
    i := 0;
    FOR x IN SELECT * FROM jsonb_array_elements(p -> g) LOOP
      v_entry := NULL;
      IF x ->> 'entryId' ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT e.id INTO v_entry FROM public.toolbox_entries e WHERE e.id = (x ->> 'entryId')::uuid;
      END IF;
      IF char_length(btrim(COALESCE(x ->> 'label', ''))) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'stack_invalid_label' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO public.member_stack_items (member_id, grp, label, entry_id, position, visibility)
      VALUES (v_me, g, btrim(x ->> 'label'), v_entry, i,
        CASE WHEN x ->> 'visibility' IN ('members', 'friends', 'private') THEN x ->> 'visibility' END);
      i := i + 1;
    END LOOP;
  END LOOP;
  INSERT INTO public.member_stack_settings AS s (member_id, ai_vis, subs_vis, skills_vis)
  VALUES (
    v_me,
    CASE WHEN v_vis ->> 'ai' IN ('members', 'friends', 'private') THEN v_vis ->> 'ai' ELSE 'members' END,
    CASE WHEN v_vis ->> 'subs' IN ('members', 'friends', 'private') THEN v_vis ->> 'subs' ELSE 'members' END,
    CASE WHEN v_vis ->> 'skills' IN ('members', 'friends', 'private') THEN v_vis ->> 'skills' ELSE 'members' END)
  ON CONFLICT (member_id) DO UPDATE SET
    ai_vis = CASE WHEN v_vis ? 'ai' THEN EXCLUDED.ai_vis ELSE s.ai_vis END,
    subs_vis = CASE WHEN v_vis ? 'subs' THEN EXCLUDED.subs_vis ELSE s.subs_vis END,
    skills_vis = CASE WHEN v_vis ? 'skills' THEN EXCLUDED.skills_vis ELSE s.skills_vis END,
    updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.profile_stack_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_stack_save(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.profile_stack(p_member uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
  v_owner boolean := p_member = v_me;
  s public.member_stack_settings%ROWTYPE;
  v_out jsonb := '{}'::jsonb;
  g text;
  v_vis text;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.member_stack_settings WHERE member_id = p_member;
  FOREACH g IN ARRAY ARRAY['ai', 'subs', 'skills'] LOOP
    v_vis := COALESCE(CASE g WHEN 'ai' THEN s.ai_vis WHEN 'subs' THEN s.subs_vis ELSE s.skills_vis END, 'members');
    IF public.profile__can_see(p_member, v_vis) THEN
      v_out := v_out || jsonb_build_object(g, jsonb_build_object(
        'visibility', CASE WHEN v_owner THEN v_vis END,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'label', i.label,
            'entry', CASE WHEN e.id IS NOT NULL THEN jsonb_build_object('id', e.id, 'slug', e.slug, 'name', e.name, 'iconUrl', e.icon_url, 'type', e.type) END,
            'visibility', CASE WHEN v_owner THEN i.visibility END
          ) ORDER BY i.position)
          FROM public.member_stack_items i
          LEFT JOIN public.toolbox_entries e ON e.id = i.entry_id
          WHERE i.member_id = p_member AND i.grp = g
            -- per-chip lock: an item's own visibility can only narrow its group's
            AND (i.visibility IS NULL OR public.profile__can_see(p_member, i.visibility))), '[]'::jsonb)));
    ELSE
      v_out := v_out || jsonb_build_object(g, NULL);
    END IF;
  END LOOP;
  -- agents on the profile now come only from connected agents (profile_agents); kept for old clients
  v_out := v_out || jsonb_build_object('agents', '[]'::jsonb);
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.profile_stack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_stack(uuid) TO authenticated;

-- self-registered agents: move nothing (empty), then drop
DROP FUNCTION IF EXISTS public.member_agents_save(jsonb);
DROP TABLE IF EXISTS public.member_agents;
