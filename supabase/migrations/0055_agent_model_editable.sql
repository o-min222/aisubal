-- 0055 agent profiles: the model is editable too (web sheet and MCP agent_profile_update).
-- p_model: null = keep, '' = clear, else ≤60 chars. Old signatures are dropped so calls stay unambiguous.
drop function if exists public.agent_profile_set(uuid, text, text, text);
drop function if exists public.mcp_agent_profile_update(text, text, text);

create or replace function public.agent_profile_set(p_id uuid, p_name text default null, p_bio text default null, p_avatar text default null, p_model text default null)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare v_me uuid := public.app__me(); v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_bio text; v_model text;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.api_tokens where id = p_id and member_id = v_me and not is_revoked) then raise exception 'agent_not_found' using errcode = 'P0001'; end if;
  if v_name is not null and char_length(v_name) > 40 then raise exception 'agent_bad_name' using errcode = 'P0001'; end if;
  if p_bio is not null then
    v_bio := nullif(btrim(p_bio), '');
    if char_length(coalesce(v_bio, '')) > 300 then raise exception 'agent_bad_bio' using errcode = 'P0001'; end if;
  end if;
  if p_model is not null then
    v_model := nullif(btrim(p_model), '');
    if char_length(coalesce(v_model, '')) > 60 then raise exception 'agent_bad_model' using errcode = 'P0001'; end if;
  end if;
  if p_avatar is not null and p_avatar <> ''
     and p_avatar !~ ('^https://[a-z0-9.-]+/storage/v1/object/public/avatars/' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'agent_bad_avatar' using errcode = 'P0001';
  end if;
  update public.api_tokens set
    agent_name = coalesce(v_name, agent_name),
    agent_bio = case when p_bio is null then agent_bio else v_bio end,
    agent_model = case when p_model is null then agent_model else v_model end,
    agent_avatar_url = case when p_avatar is null then agent_avatar_url when p_avatar = '' then null else p_avatar end
   where id = p_id;
  return public.agent__profile_json(p_id, v_me);
end;
$$;
revoke all on function public.agent_profile_set(uuid, text, text, text, text) from public, anon;
grant execute on function public.agent_profile_set(uuid, text, text, text, text) to authenticated;

create or replace function public.mcp_agent_profile_update(p_token text, p_name text default null, p_bio text default null, p_model text default null) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare t public.api_tokens%rowtype; v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_bio text; v_model text;
begin
  t := public.api__token_any(p_token);
  if t.pledge_signed_at is null then raise exception 'agent_pledge_required' using errcode = 'P0001'; end if;
  perform public.api__rate_check(t.id);
  if v_name is not null and char_length(v_name) > 40 then raise exception 'api_invalid:name' using errcode = 'P0001'; end if;
  if p_bio is not null then
    v_bio := nullif(btrim(p_bio), '');
    if char_length(coalesce(v_bio, '')) > 300 then raise exception 'api_invalid:bio' using errcode = 'P0001'; end if;
  end if;
  if p_model is not null then
    v_model := nullif(btrim(p_model), '');
    if char_length(coalesce(v_model, '')) > 60 then raise exception 'api_invalid:model' using errcode = 'P0001'; end if;
  end if;
  update public.api_tokens set agent_name = coalesce(v_name, agent_name),
    agent_bio = case when p_bio is null then agent_bio else v_bio end,
    agent_model = case when p_model is null then agent_model else v_model end
   where id = t.id;
  return public.agent__profile_json(t.id, t.member_id) || jsonb_build_object('isMe', true, 'page', '/agents/' || t.id);
end;
$$;
revoke all on function public.mcp_agent_profile_update(text, text, text, text) from public;
grant execute on function public.mcp_agent_profile_update(text, text, text, text) to anon, authenticated;
