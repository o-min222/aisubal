-- 0019: UI language preference (i18n). The cookie is the primary store; this
-- column carries the choice to a member's other devices. Not granted to clients
-- directly: read through get_my_member() (own row), written through the RPC.
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS locale text;
DO $$ BEGIN
  ALTER TABLE public.members ADD CONSTRAINT members_locale_chk
    CHECK (locale IS NULL OR locale ~ '^[a-z]{2}(-[A-Z]{2})?$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The app validates against its supported list (src/i18n/config.ts); the DB only
-- checks the shape so adding a language needs no migration.
CREATE OR REPLACE FUNCTION public.member_set_locale(p_locale text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF p_locale IS NULL OR p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN
    RAISE EXCEPTION 'invalid_locale' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.members SET locale = p_locale WHERE id = v_me;
  RETURN jsonb_build_object('ok', true, 'locale', p_locale);
END;
$$;
REVOKE ALL ON FUNCTION public.member_set_locale(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_set_locale(text) TO authenticated;
