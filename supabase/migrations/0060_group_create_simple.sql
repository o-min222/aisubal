-- 0060 simpler 그룹 만들기: name + 소개 only.
-- * the address (slug) is generated here when none is given: latin words from the name, else
--   'group', always made unique with a short random suffix when taken;
-- * the owner can change it later in group settings (group_set_slug); old addresses redirect;
-- * join policy / hidden keep their defaults (누구나 가입 · 공개) and are changed in settings.
CREATE TABLE IF NOT EXISTS public.group_slug_redirects (
  old_slug text PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.group_slug_redirects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_slug_redirects FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.group__slug_from(p_name text) RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $fn$
DECLARE base text; cand text; i int := 0;
BEGIN
  base := regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g');
  base := left(btrim(base, '-'), 30);
  base := btrim(base, '-');
  IF base !~ '^[a-z0-9][a-z0-9-]{1,39}$' THEN base := 'group'; END IF;
  cand := base;
  WHILE cand = 'group' OR cand IN ('new', 'admin', 'settings')
        OR EXISTS (SELECT 1 FROM public.groups g WHERE g.slug = cand)
        OR EXISTS (SELECT 1 FROM public.group_slug_redirects r WHERE r.old_slug = cand) LOOP
    i := i + 1;
    IF i > 20 THEN RAISE EXCEPTION 'group_slug_taken' USING ERRCODE = 'P0001'; END IF;
    cand := base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, CASE WHEN i < 10 THEN 4 ELSE 8 END);
  END LOOP;
  RETURN cand;
END $fn$;
REVOKE ALL ON FUNCTION public.group__slug_from(text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.group_create(p_name text, p_slug text DEFAULT NULL, p_description text DEFAULT NULL, p_emoji text DEFAULT NULL, p_join_policy text DEFAULT 'open', p_hidden boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_me UUID := public.app__me();
  v_slug TEXT := lower(btrim(COALESCE(p_slug, '')));
  g public.groups%ROWTYPE;
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 2 AND 40 THEN
    RAISE EXCEPTION 'group_invalid_name' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(p_join_policy, 'open') NOT IN ('open', 'approval') THEN
    RAISE EXCEPTION 'group_invalid_policy' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.groups x WHERE x.created_by = v_me AND x.created_at > NOW() - INTERVAL '24 hours') >= 5 THEN
    RAISE EXCEPTION 'group_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  IF v_slug = '' THEN
    v_slug := public.group__slug_from(p_name);
  ELSE
    IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,39}$' THEN RAISE EXCEPTION 'group_invalid_slug' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.groups x WHERE x.slug = v_slug) OR EXISTS (SELECT 1 FROM public.group_slug_redirects r WHERE r.old_slug = v_slug) THEN
      RAISE EXCEPTION 'group_slug_taken' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.groups (slug, name, description, emoji, join_policy, is_hidden, created_by)
  VALUES (v_slug, btrim(p_name), left(btrim(COALESCE(p_description, '')), 500),
          NULLIF(left(btrim(COALESCE(p_emoji, '')), 8), ''), COALESCE(p_join_policy, 'open'),
          COALESCE(p_hidden, FALSE), v_me)
  RETURNING * INTO g;
  INSERT INTO public.group_members (group_id, member_id, role, status) VALUES (g.id, v_me, 'owner', 'active');
  SELECT * INTO g FROM public.groups WHERE id = g.id;
  RETURN public.group__json(g, v_me);
END $fn$;
REVOKE ALL ON FUNCTION public.group_create(text, text, text, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.group_create(text, text, text, text, text, boolean) TO authenticated;

-- owner changes the address; the old one keeps working as a redirect
CREATE OR REPLACE FUNCTION public.group_set_slug(p_group uuid, p_slug text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_me UUID := public.app__me(); v_slug text := lower(btrim(coalesce(p_slug, ''))); g public.groups%ROWTYPE;
BEGIN
  IF public.group__role(p_group, v_me) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'group_forbidden' USING ERRCODE = 'P0001'; END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,39}$' OR v_slug IN ('new', 'admin', 'settings') THEN RAISE EXCEPTION 'group_invalid_slug' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO g FROM public.groups WHERE id = p_group;
  IF g.slug = v_slug THEN RETURN public.group__json(g, v_me); END IF;
  IF EXISTS (SELECT 1 FROM public.groups x WHERE x.slug = v_slug)
     OR EXISTS (SELECT 1 FROM public.group_slug_redirects r WHERE r.old_slug = v_slug AND r.group_id <> p_group) THEN
    RAISE EXCEPTION 'group_slug_taken' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.group_slug_redirects (old_slug, group_id) VALUES (g.slug, g.id)
    ON CONFLICT (old_slug) DO UPDATE SET group_id = EXCLUDED.group_id, created_at = now();
  DELETE FROM public.group_slug_redirects WHERE old_slug = v_slug;
  UPDATE public.groups SET slug = v_slug, updated_at = now() WHERE id = p_group RETURNING * INTO g;
  RETURN public.group__json(g, v_me);
END $fn$;
REVOKE ALL ON FUNCTION public.group_set_slug(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.group_set_slug(uuid, text) TO authenticated;

-- old address → current slug (only when the viewer can see the group; RLS on groups applies)
CREATE OR REPLACE FUNCTION public.group__redirect_target(p_slug text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT r.group_id FROM public.group_slug_redirects r WHERE r.old_slug = p_slug
$fn$;
CREATE OR REPLACE FUNCTION public.group_resolve_slug(p_slug text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT g.slug FROM public.groups g
   WHERE g.id = (SELECT public.group__redirect_target(lower(p_slug)))
$fn$;
REVOKE ALL ON FUNCTION public.group__redirect_target(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.group__redirect_target(text) TO authenticated;
REVOKE ALL ON FUNCTION public.group_resolve_slug(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.group_resolve_slug(text) TO authenticated;
