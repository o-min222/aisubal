-- 0028: color theme preference (System / Light / Dark). Like locale (0019): the
-- cookie is primary; this column carries the choice to the member's other devices.
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS theme text;
DO $$ BEGIN
  ALTER TABLE public.members ADD CONSTRAINT members_theme_chk CHECK (theme IS NULL OR theme IN ('system', 'light', 'dark'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.member_set_theme(p_theme text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF p_theme IS NULL OR p_theme NOT IN ('system', 'light', 'dark') THEN
    RAISE EXCEPTION 'invalid_theme' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.members SET theme = p_theme WHERE id = v_me;
  RETURN jsonb_build_object('ok', true, 'theme', p_theme);
END;
$$;
REVOKE ALL ON FUNCTION public.member_set_theme(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_set_theme(text) TO authenticated;
