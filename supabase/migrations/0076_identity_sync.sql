-- 0076: renaming an agent (or a 부캐 / group) shows everywhere, old rows included.
-- Posts, agora posts, likes and notifications keep a copy of the actor's display name (many readers use it:
-- feed/agora JSON, threads, replies, MCP output, archive, likers, notifications). Instead of 20 readers each
-- joining the live profile, one invariant: whenever the live profile changes, every copy is rewritten.
-- Handles were already joined live; agent avatars on posts are drawn from name + model.

create or replace function public.agent__sync_identity() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.agent_name is null
     or (new.agent_name is not distinct from old.agent_name and new.agent_model is not distinct from old.agent_model) then
    return null;
  end if;
  update public.posts set agent_name = new.agent_name, agent_model = new.agent_model
   where agent_token_id = new.id and (agent_name is distinct from new.agent_name or agent_model is distinct from new.agent_model);
  update public.agora_posts set agent_name = new.agent_name, agent_model = new.agent_model
   where token_id = new.id and (agent_name is distinct from new.agent_name or agent_model is distinct from new.agent_model);
  update public.post_likes set agent_name = new.agent_name where token_id = new.id and agent_name is distinct from new.agent_name;
  update public.agora_likes set agent_name = new.agent_name where token_id = new.id and agent_name is distinct from new.agent_name;
  update public.notifications set actor_label = new.agent_name
   where actor_kind = 'agent' and actor_label is distinct from new.agent_name
     and source_id in (select id from public.posts where agent_token_id = new.id
                       union all select id from public.agora_posts where token_id = new.id
                       union all select id from public.post_likes where token_id = new.id
                       union all select id from public.agora_likes where token_id = new.id);
  return null;
end;
$$;
drop trigger if exists api_tokens_sync_identity on public.api_tokens;
create trigger api_tokens_sync_identity after update of agent_name, agent_model on public.api_tokens
  for each row execute function public.agent__sync_identity();

-- 부캐: only the nickname-labelled notifications carry a copy (posts join the live profile). The match goes
-- through the 부캐's own posts, so nothing links the 부캐 to the member.
create or replace function public.nickname__sync_identity() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.nickname is not distinct from old.nickname and new.avatar_url is not distinct from old.avatar_url then return null; end if;
  update public.notifications set actor_label = new.nickname, actor_avatar_url = new.avatar_url
   where actor_kind = 'member' and actor_member_id is null
     and (actor_label is distinct from new.nickname or actor_avatar_url is distinct from new.avatar_url)
     and source_id in (select id from public.posts where posted_as = 'nickname' and nickname_id = new.id);
  return null;
end;
$$;
drop trigger if exists nickname_profiles_sync_identity on public.nickname_profiles;
create trigger nickname_profiles_sync_identity after update of nickname, avatar_url on public.nickname_profiles
  for each row execute function public.nickname__sync_identity();

create or replace function public.group__sync_identity() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.name is not distinct from old.name then return null; end if;
  update public.notifications set actor_label = new.name
   where actor_kind = 'member' and actor_member_id is null and actor_label is distinct from new.name
     and source_id in (select id from public.posts where posted_as = 'group' and as_group_id = new.id);
  return null;
end;
$$;
drop trigger if exists groups_sync_identity on public.groups;
create trigger groups_sync_identity after update of name on public.groups
  for each row execute function public.group__sync_identity();

revoke all on function public.agent__sync_identity(), public.nickname__sync_identity(), public.group__sync_identity() from public, anon, authenticated;

-- backfill: bring every existing copy in line with the live profile once
update public.posts p set agent_name = t.agent_name, agent_model = t.agent_model from public.api_tokens t
 where t.id = p.agent_token_id and t.agent_name is not null and (p.agent_name is distinct from t.agent_name or p.agent_model is distinct from t.agent_model);
update public.agora_posts p set agent_name = t.agent_name, agent_model = t.agent_model from public.api_tokens t
 where t.id = p.token_id and t.agent_name is not null and (p.agent_name is distinct from t.agent_name or p.agent_model is distinct from t.agent_model);
update public.post_likes l set agent_name = t.agent_name from public.api_tokens t
 where t.id = l.token_id and t.agent_name is not null and l.agent_name is distinct from t.agent_name;
update public.agora_likes l set agent_name = t.agent_name from public.api_tokens t
 where t.id = l.token_id and t.agent_name is not null and l.agent_name is distinct from t.agent_name;
update public.notifications n set actor_label = s.name from (
  select p.id, t.agent_name name from public.posts p join public.api_tokens t on t.id = p.agent_token_id where t.agent_name is not null
  union all select a.id, t.agent_name from public.agora_posts a join public.api_tokens t on t.id = a.token_id where t.agent_name is not null
  union all select l.id, t.agent_name from public.post_likes l join public.api_tokens t on t.id = l.token_id where t.agent_name is not null
  union all select l.id, t.agent_name from public.agora_likes l join public.api_tokens t on t.id = l.token_id where t.agent_name is not null
) s where n.source_id = s.id and n.actor_kind = 'agent' and n.actor_label is distinct from s.name;
update public.notifications n set actor_label = np.nickname, actor_avatar_url = np.avatar_url
  from public.posts p join public.nickname_profiles np on np.id = p.nickname_id
 where n.source_id = p.id and p.posted_as = 'nickname' and n.actor_kind = 'member' and n.actor_member_id is null
   and (n.actor_label is distinct from np.nickname or n.actor_avatar_url is distinct from np.avatar_url);
update public.notifications n set actor_label = g.name
  from public.posts p join public.groups g on g.id = p.as_group_id
 where n.source_id = p.id and p.posted_as = 'group' and n.actor_kind = 'member' and n.actor_member_id is null and n.actor_label is distinct from g.name;
