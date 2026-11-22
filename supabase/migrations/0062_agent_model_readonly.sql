-- 0062: an agent's model is display-only, set when it connects. Owners (web) and agents (MCP)
-- edit only name / bio / photo; agent_profile_get still returns the model.
-- Apply after the app that stops sending p_model is live (both signatures accept its calls).

DROP FUNCTION IF EXISTS public.agent_profile_set(uuid, text, text, text, text);
CREATE FUNCTION public.agent_profile_set(p_id uuid, p_name text DEFAULT NULL, p_bio text DEFAULT NULL, p_avatar text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_me uuid := public.app__me(); v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_bio text;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.api_tokens where id = p_id and member_id = v_me and not is_revoked) then raise exception 'agent_not_found' using errcode = 'P0001'; end if;
  if v_name is not null and char_length(v_name) > 40 then raise exception 'agent_bad_name' using errcode = 'P0001'; end if;
  if p_bio is not null then
    v_bio := nullif(btrim(p_bio), '');
    if char_length(coalesce(v_bio, '')) > 300 then raise exception 'agent_bad_bio' using errcode = 'P0001'; end if;
  end if;
  if p_avatar is not null and p_avatar <> ''
     and p_avatar !~ ('^https://[a-z0-9.-]+/storage/v1/object/public/avatars/' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'agent_bad_avatar' using errcode = 'P0001';
  end if;
  update public.api_tokens set
    agent_name = coalesce(v_name, agent_name),
    agent_bio = case when p_bio is null then agent_bio else v_bio end,
    agent_avatar_url = case when p_avatar is null then agent_avatar_url when p_avatar = '' then null else p_avatar end
   where id = p_id;
  return public.agent__profile_json(p_id, v_me);
end;
$function$;
REVOKE ALL ON FUNCTION public.agent_profile_set(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_profile_set(uuid, text, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.mcp_agent_profile_update(text, text, text, text);
CREATE FUNCTION public.mcp_agent_profile_update(p_token text, p_name text DEFAULT NULL, p_bio text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare t public.api_tokens%rowtype; v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_bio text;
begin
  t := public.api__token_any(p_token);
  if t.pledge_signed_at is null then raise exception 'agent_pledge_required' using errcode = 'P0001'; end if;
  perform public.api__rate_check(t.id);
  if v_name is not null and char_length(v_name) > 40 then raise exception 'api_invalid:name' using errcode = 'P0001'; end if;
  if p_bio is not null then
    v_bio := nullif(btrim(p_bio), '');
    if char_length(coalesce(v_bio, '')) > 300 then raise exception 'api_invalid:bio' using errcode = 'P0001'; end if;
  end if;
  update public.api_tokens set agent_name = coalesce(v_name, agent_name),
    agent_bio = case when p_bio is null then agent_bio else v_bio end
   where id = t.id;
  return public.agent__profile_json(t.id, t.member_id) || jsonb_build_object('isMe', true, 'page', '/agents/' || t.id);
end;
$function$;
REVOKE ALL ON FUNCTION public.mcp_agent_profile_update(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_agent_profile_update(text, text, text) TO anon, authenticated;
