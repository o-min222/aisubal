-- 0016: profile "stack" + 내 에이전트 (shown on the unified profile card).
--
--  * 활용하는 AI / 구독 중인 서비스 / 사용하는 스킬·플러그인·MCP: each group is a
--    list of labels, optionally linked to a 툴 catalog entry, with its own
--    visibility (members / friends / private). For the skills group, catalog
--    tools come from tool_users ('사용 중', the single source of truth); this
--    table only keeps free-text extras that are not in the catalog.
--  * member_agents: agents the member uses or runs, connected to AI쓰발 or not
--    (name, platform, model, short role, optional https link, visibility).
--    Matching token-connected agents is done in the app via profile_agents(),
--    which already respects each token's show_on_profile.
--  * No client table access at all: reads/writes go through SECURITY DEFINER
--    RPCs that apply visibility for the viewer.

CREATE TABLE IF NOT EXISTS public.member_stack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  grp text NOT NULL CHECK (grp IN ('ai', 'subs', 'skills')),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
  entry_id uuid REFERENCES public.toolbox_entries(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_stack_items_member ON public.member_stack_items(member_id, grp, position);
CREATE INDEX IF NOT EXISTS idx_member_stack_items_entry ON public.member_stack_items(entry_id) WHERE entry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.member_stack_settings (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  ai_vis text NOT NULL DEFAULT 'members' CHECK (ai_vis IN ('members', 'friends', 'private')),
  subs_vis text NOT NULL DEFAULT 'members' CHECK (subs_vis IN ('members', 'friends', 'private')),
  skills_vis text NOT NULL DEFAULT 'members' CHECK (skills_vis IN ('members', 'friends', 'private')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.member_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  platform text NOT NULL CHECK (platform IN ('grok_bot', 'claude_code', 'custom_gpt', 'n8n', 'own_build', 'cursor', 'codex', 'chatgpt', 'claude', 'gemini', 'other')),
  model text CHECK (model IS NULL OR char_length(model) <= 60),
  role text CHECK (role IS NULL OR char_length(role) <= 80),
  url text CHECK (url IS NULL OR (url ~ '^https://' AND char_length(url) <= 300)),
  visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('members', 'friends', 'private')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_agents_member ON public.member_agents(member_id, position);

ALTER TABLE public.member_stack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_stack_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_agents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_stack_items, public.member_stack_settings, public.member_agents FROM PUBLIC, anon, authenticated;

-- can the current member see something with this visibility on p_member's profile?
CREATE OR REPLACE FUNCTION public.profile__can_see(p_member uuid, p_vis text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.app__me() IS NOT NULL AND (
    p_member = public.app__me()
    OR p_vis = 'members'
    OR (p_vis = 'friends' AND public.social__friend_state(public.app__me(), p_member) = 'friends'));
$$;
REVOKE ALL ON FUNCTION public.profile__can_see(uuid, text) FROM PUBLIC, anon, authenticated;

-- replace-all save of the three groups + their visibility (≤ 20 per group)
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
      INSERT INTO public.member_stack_items (member_id, grp, label, entry_id, position)
      VALUES (v_me, g, btrim(x ->> 'label'), v_entry, i);
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

-- replace-all save of 내 에이전트 (≤ 12)
CREATE OR REPLACE FUNCTION public.member_agents_save(p jsonb)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me uuid := public.app__me(); x jsonb; i integer := 0;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 12 THEN RAISE EXCEPTION 'agents_invalid' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.member_agents WHERE member_id = v_me;
  FOR x IN SELECT * FROM jsonb_array_elements(p) LOOP
    INSERT INTO public.member_agents (member_id, name, platform, model, role, url, visibility, position)
    VALUES (
      v_me,
      btrim(x ->> 'name'),
      COALESCE(NULLIF(x ->> 'platform', ''), 'other'),
      NULLIF(btrim(COALESCE(x ->> 'model', '')), ''),
      NULLIF(btrim(COALESCE(x ->> 'role', '')), ''),
      NULLIF(btrim(COALESCE(x ->> 'url', '')), ''),
      COALESCE(NULLIF(x ->> 'visibility', ''), 'members'),
      i);
    i := i + 1;
  END LOOP;
  RETURN i;
END;
$$;
REVOKE ALL ON FUNCTION public.member_agents_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_agents_save(jsonb) TO authenticated;

-- what the viewer may see of p_member's stack + agents (owner sees everything,
-- with visibility values; others get hidden groups as null and no visibility).
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
            'entry', CASE WHEN e.id IS NOT NULL THEN jsonb_build_object('id', e.id, 'slug', e.slug, 'name', e.name, 'iconUrl', e.icon_url, 'type', e.type) END
          ) ORDER BY i.position)
          FROM public.member_stack_items i
          LEFT JOIN public.toolbox_entries e ON e.id = i.entry_id
          WHERE i.member_id = p_member AND i.grp = g), '[]'::jsonb)));
    ELSE
      v_out := v_out || jsonb_build_object(g, NULL);
    END IF;
  END LOOP;
  v_out := v_out || jsonb_build_object('agents', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'platform', a.platform, 'model', a.model, 'role', a.role, 'url', a.url,
      'visibility', CASE WHEN v_owner THEN a.visibility END
    ) ORDER BY a.position)
    FROM public.member_agents a
    WHERE a.member_id = p_member AND public.profile__can_see(p_member, a.visibility)), '[]'::jsonb));
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.profile_stack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_stack(uuid) TO authenticated;
