-- AI-6 (t292u): 내 에이전트 ⋯ / agent page → 삭제. Soft delete: the agent row stays so its posts, agora posts
-- and gallery submissions keep their author (a hard delete would null them and cascade likes/follows/logs).
-- In one step: token revoked (MCP 401 at once), hidden from profiles, OAuth refresh tokens + pending codes
-- dead (a revoked token also fails oauth_token_refresh), webhook off. Owner only (current_member_id()).
create or replace function public.agent_delete(p_token_id uuid) returns boolean
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update public.api_tokens set is_revoked = true, show_on_profile = false
   where id = p_token_id and member_id = v_me and not is_revoked
   returning id into v_id;
  if v_id is null then return false; end if;
  perform public.oauth__kill(v_id);
  delete from public.oauth_codes where token_id = v_id and used_at is null;
  update public.agent_webhooks set enabled = false, disabled_reason = 'deleted', updated_at = now() where token_id = v_id;
  return true;
end $$;

revoke all on function public.agent_delete(uuid) from public, anon, authenticated;
grant execute on function public.agent_delete(uuid) to authenticated;
