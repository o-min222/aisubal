-- 0069 (C): @handle mentions notify the mentioned member ('mention', under 답글 prefs).
-- Member-written feed posts only (agents can't ping members). The actor shown is the post's
-- public identity: real name, 부캐 label, or the group — never the writer behind a 부캐/group.
-- Group-timeline posts only notify that group's members. Max 5 per post; no self pings; no
-- double ping for the parent/thread author already notified by notify__post_reply.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array['comment', 'reply', 'like', 'follow',
  'friend_request', 'friend_accept', 'invite_joined', 'agent_reply', 'agent_like', 'gallery_recommended', 'gallery_approved',
  'gallery_confirmed', 'gallery_rejected', 'follow_post', 'agent_mention', 'mention']));

-- @handle in a text → distinct member handles (max 5). '@x.ai' is an agent and never matches.
create or replace function public.member__mentioned_handles(p_text text) returns text[]
language sql immutable set search_path to '' as $$
  select coalesce(array_agg(h order by first_pos), '{}') from (
    select lower(m[1]) as h, min(ord) as first_pos
    from regexp_matches(coalesce(p_text, ''), '(?<![A-Za-z0-9_@가-힣])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_]|\.[0-9A-Za-z_가-힣])', 'g') with ordinality as r(m, ord)
    group by lower(m[1]) order by min(ord) limit 5
  ) s;
$$;

create or replace function public.notify__post_mention() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  v_handles text[]; v_label text; v_avatar text; v_actor uuid; v_parent_author uuid; v_root_author uuid;
  v_link text := '/posts/' || coalesce(new.root_id, new.id); r record;
begin
  if new.author_kind <> 'member' or new.is_hidden or new.deleted_at is not null then return null; end if;
  v_handles := public.member__mentioned_handles(coalesce(new.title, '') || ' ' || coalesce(new.content, ''));
  if cardinality(v_handles) = 0 then return null; end if;
  if new.posted_as = 'group' then
    select g.name into v_label from public.groups g where g.id = new.as_group_id;
    v_label := coalesce(v_label, '그룹');
  elsif new.posted_as = 'nickname' then
    select np.nickname, np.avatar_url into v_label, v_avatar from public.nickname_profiles np where np.member_id = new.author_id;
  else
    v_actor := new.author_id;
  end if;
  if new.parent_id is not null then
    select p.author_id into v_parent_author from public.posts p where p.id = new.parent_id and p.author_kind = 'member';
    select p.author_id into v_root_author from public.posts p where p.id = coalesce(new.root_id, new.parent_id) and p.author_kind = 'member';
  end if;
  for r in
    select m.id from public.members m
    where m.handle = any (v_handles) and m.signup_completed_at is not null and not m.is_banned
      and m.id <> new.author_id
      and m.id is distinct from v_parent_author and m.id is distinct from v_root_author
      and (new.group_id is null or public.group__role(new.group_id, m.id) is not null)
  loop
    perform public.notify__push(r.id, 'mention', 'replies', 'member', v_actor, v_label, v_avatar, 'post', new.id, new.id,
      v_link, coalesce(nullif(new.title, ''), new.content), 'mention:' || new.id || ':' || r.id);
  end loop;
  return null;
end $$;
revoke all on function public.notify__post_mention() from public, anon, authenticated;

drop trigger if exists posts_notify_mention on public.posts;
create trigger posts_notify_mention after insert on public.posts for each row execute function public.notify__post_mention();
