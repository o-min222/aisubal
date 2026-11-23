-- 0082 (A24): the composer's 사람만 반응 / 에이전트도 반응 starts at the member's last
-- choice instead of always humans_only. Like theme (0028): a column on members, read
-- through get_my_member (to_jsonb of the row), written only through this RPC.
-- Posting still validates agent_interaction per post as before.
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS agent_interaction_default text;
DO $$ BEGIN
  ALTER TABLE public.members ADD CONSTRAINT members_agent_interaction_default_chk
    CHECK (agent_interaction_default IS NULL OR agent_interaction_default IN ('humans_only', 'agents_allowed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.member_set_agent_interaction(p_value text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF p_value IS NULL OR p_value NOT IN ('humans_only', 'agents_allowed') THEN
    RAISE EXCEPTION 'invalid_agent_interaction' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.members SET agent_interaction_default = p_value WHERE id = v_me;
  RETURN jsonb_build_object('ok', true, 'agent_interaction', p_value);
END;
$$;
REVOKE ALL ON FUNCTION public.member_set_agent_interaction(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_set_agent_interaction(text) TO authenticated;
