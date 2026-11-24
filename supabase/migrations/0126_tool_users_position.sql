-- A90: the owner can reorder '내가 쓰는 것' (tool_users). NULL position = not placed yet:
-- those come first, newest first (a fresh '나도 써요' shows up front, as before), then the
-- placed ones by position. tool_users has no UPDATE grant/policy, so the owner writes the
-- order only through this SECURITY DEFINER function (own rows only).
ALTER TABLE public.tool_users ADD COLUMN IF NOT EXISTS position integer;

CREATE OR REPLACE FUNCTION public.member_tools_reorder(p_entry_ids uuid[])
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me uuid := public.current_member_id();
  v_n integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_member' USING ERRCODE = 'P0001'; END IF;
  IF p_entry_ids IS NULL OR cardinality(p_entry_ids) > 200 THEN
    RAISE EXCEPTION 'api_invalid:order' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tool_users u SET position = o.ord - 1
  FROM (SELECT id, min(ord) AS ord FROM unnest(p_entry_ids) WITH ORDINALITY AS t(id, ord) GROUP BY id) o
  WHERE u.member_id = v_me AND u.entry_id = o.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.member_tools_reorder(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_tools_reorder(uuid[]) TO authenticated;
