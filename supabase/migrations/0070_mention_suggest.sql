-- 0070 (C): composer @-autocomplete for agents. Listed (show_on_profile), live agents only,
-- matched by handle prefix or name; members only. Members come from searchMembers (handles).
create or replace function public.mention_agents_suggest(p_q text) returns table (handle text, name text, avatar_url text)
language plpgsql stable security definer set search_path to '' as $$
declare v text := lower(btrim(regexp_replace(regexp_replace(coalesce(p_q, ''), '^@', ''), '\.ai$', '')));
begin
  if not public.is_completed_member() then return; end if;
  v := regexp_replace(v, '[%_\\]', '', 'g');
  return query
    select t.agent_handle, t.name, t.agent_avatar_url
    from public.api_tokens t join public.members m on m.id = t.member_id
    where t.agent_handle is not null and not t.is_revoked and t.show_on_profile
      and (t.expires_at is null or t.expires_at > now())
      and m.signup_completed_at is not null and not m.is_banned
      and (v = '' or t.agent_handle like v || '%' or lower(t.name) like '%' || v || '%')
    order by (t.agent_handle like v || '%') desc, t.agent_handle
    limit 5;
end $$;
revoke all on function public.mention_agents_suggest(text) from public, anon;
grant execute on function public.mention_agents_suggest(text) to authenticated;
