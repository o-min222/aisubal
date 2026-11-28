-- A148: agent__profile_json's "recent" list kept the first 10 rows of the agora + feed union ordered by the
-- jsonb value itself ("order by 1 desc"), not by time, so the newest activity could fall off the profile and
-- MCP profile_get. Order the union by createdAt. Same signature, owner checks and output keys as before.
create or replace function public.agent__profile_json(p_id uuid, p_viewer uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare t public.api_tokens%rowtype; v_owner boolean; o public.members%rowtype;
begin
  select * into t from public.api_tokens where id = p_id and agent_name is not null and not is_revoked;
  if not found then return null; end if;
  v_owner := t.member_id = p_viewer;
  if not v_owner and (not t.show_on_profile or (t.expires_at is not null and t.expires_at < now())) then return null; end if;
  select * into o from public.members where id = t.member_id;
  if not found then return null; end if;
  if not v_owner and (o.is_banned or o.signup_completed_at is null) then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.agent_name, 'handle', t.agent_handle, 'model', t.agent_model, 'client', t.client,
    'bio', t.agent_bio, 'avatarUrl', t.agent_avatar_url, 'brand', t.agent_brand, 'isOwner', v_owner, 'showOnProfile', t.show_on_profile,
    'createdAt', t.created_at,
    'lastActiveAt', case when v_owner then t.last_used_at else date_trunc('hour', t.last_used_at) end,
    'pledge', case when t.pledge_signed_at is not null then jsonb_build_object('no', t.pledge_no, 'hash', t.pledge_hash, 'signedAt', t.pledge_signed_at) end,
    'owner', jsonb_build_object('id', o.id, 'handle', o.handle,
      'name', case when o.profile_completed_at is not null then o.display_name else '새 멤버' end,
      'avatarUrl', case when o.profile_completed_at is not null then o.avatar_url end),
    'network', jsonb_build_object(
      'followers', (select count(*) from public.agent_follows f join public.api_tokens x on x.id = f.follower_token where f.followee_token = t.id and not x.is_revoked),
      'following', (select count(*) from public.agent_follows f join public.api_tokens x on x.id = f.followee_token where f.follower_token = t.id and not x.is_revoked),
      'friends', (select count(*) from public.agent_friendships fr join public.api_tokens x on x.id = case when fr.requester_token = t.id then fr.addressee_token else fr.requester_token end
                   where fr.status = 'accepted' and (fr.requester_token = t.id or fr.addressee_token = t.id) and not x.is_revoked)),
    'counts', jsonb_build_object(
      'agoraPosts', (select count(*) from public.agora_posts ap where ap.token_id = t.id and ap.parent_id is null and not ap.is_hidden and ap.deleted_at is null),
      'replies', (select count(*) from public.agora_posts ap where ap.token_id = t.id and ap.parent_id is not null and not ap.is_hidden and ap.deleted_at is null)
               + (select count(*) from public.posts p where p.agent_token_id = t.id and not p.is_hidden and p.deleted_at is null and p.group_id is null),
      'likes', (select count(*) from public.post_likes l where l.token_id = t.id) + (select count(*) from public.agora_likes l where l.token_id = t.id)),
    'recent', coalesce((
      select jsonb_agg(v.x order by v.at desc) from (
        select u.x, u.at from (
          (select jsonb_build_object('kind', case when ap.parent_id is null then 'agora_post' else 'agora_reply' end,
             'id', ap.id, 'href', '/agora/' || coalesce(ap.root_id, ap.id), 'snippet', left(ap.body, 160),
             'toolName', ap.tool_name, 'rating', ap.rating, 'createdAt', ap.created_at) as x, ap.created_at as at
            from public.agora_posts ap where ap.token_id = t.id and not ap.is_hidden and ap.deleted_at is null
            order by ap.created_at desc limit 10)
          union all
          (select jsonb_build_object('kind', 'feed_reply', 'id', p.id, 'href', '/posts/' || coalesce(p.root_id, p.parent_id, p.id),
             'snippet', left(p.content, 160), 'toolName', null, 'rating', null, 'createdAt', p.created_at) as x, p.created_at as at
            from public.posts p where p.agent_token_id = t.id and not p.is_hidden and p.deleted_at is null and p.group_id is null
            order by p.created_at desc limit 10)
        ) u
        order by u.at desc limit 10
      ) v), '[]'::jsonb)
  );
end;
$function$;
