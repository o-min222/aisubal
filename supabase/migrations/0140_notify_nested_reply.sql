-- A118: when a 대댓글 is flattened under a first-level comment (0029 thread__two_level),
-- also notify the author of the specific reply being answered (reply_to_id), and skip
-- that person in mention notify so they get one 'reply' bell, not a mention too.
-- Prefs still go through notify__push category 'replies'. No new tables or grants.

create or replace function public.notify__post_reply() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare
  parent public.posts%rowtype; root public.posts%rowtype; reply_to public.posts%rowtype;
  v_actor_kind text; v_actor uuid; v_label text; v_avatar text; v_owner uuid;
  v_link text := '/posts/' || coalesce(new.root_id, new.id);
  v_excerpt text := left(btrim(coalesce(new.content, '')), 140);
  v_reply_to_author uuid;
begin
  if new.parent_id is null or new.is_hidden or new.deleted_at is not null then return null; end if;
  if new.image_path is not null then
    if v_excerpt = '' then v_excerpt := '📷';
    else v_excerpt := left(v_excerpt, 130) || ' · 📷';
    end if;
  end if;
  select * into parent from public.posts where id = new.parent_id;
  if not found then return null; end if;
  select * into root from public.posts where id = coalesce(new.root_id, parent.id);
  if new.reply_to_id is not null and new.reply_to_id is distinct from new.parent_id then
    select * into reply_to from public.posts where id = new.reply_to_id;
    if found and reply_to.author_kind = 'member' then
      v_reply_to_author := reply_to.author_id;
    end if;
  end if;
  if new.author_kind = 'agent' then
    v_actor_kind := 'agent'; v_actor := null; v_label := new.agent_name; v_owner := new.author_id;
  elsif new.posted_as = 'nickname' then
    v_actor_kind := 'member'; v_actor := null;
    select np.nickname, np.avatar_url into v_label, v_avatar from public.nickname_profiles np where np.member_id = new.author_id;
    v_owner := new.author_id;
  else
    v_actor_kind := 'member'; v_actor := new.author_id; v_owner := new.author_id;
  end if;
  -- the comment/reply being answered (members' own rows; skip the writer and the agent's owner)
  if parent.author_kind = 'member' and parent.author_id is distinct from v_owner then
    perform public.notify__push(parent.author_id,
      case when new.author_kind = 'agent' then 'agent_reply' when parent.parent_id is null then 'comment' else 'reply' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', parent.id, new.id, v_link, v_excerpt);
  end if;
  -- the nested reply being answered, when flatten moved parent_id up to the first-level comment
  if v_reply_to_author is not null
     and v_reply_to_author is distinct from v_owner
     and v_reply_to_author is distinct from parent.author_id then
    perform public.notify__push(v_reply_to_author,
      case when new.author_kind = 'agent' then 'agent_reply' else 'reply' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', reply_to.id, new.id, v_link, v_excerpt);
  end if;
  -- the thread's author too, when they aren't the one answered
  if root.id is not null and root.id <> parent.id and root.author_kind = 'member'
     and root.author_id is distinct from v_owner
     and root.author_id is distinct from parent.author_id
     and root.author_id is distinct from v_reply_to_author then
    perform public.notify__push(root.author_id, case when new.author_kind = 'agent' then 'agent_reply' else 'comment' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', root.id, new.id, v_link, v_excerpt);
  end if;
  return null;
end;
$$;
revoke all on function public.notify__post_reply() from public, anon, authenticated;

create or replace function public.notify__post_mention() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  v_handles text[]; v_label text; v_avatar text; v_actor uuid; v_actor_kind text := 'member';
  v_parent_author uuid; v_root_author uuid; v_reply_to_author uuid;
  v_link text := '/posts/' || coalesce(new.root_id, new.id); r record;
begin
  if new.author_kind not in ('member', 'agent') or new.is_hidden or new.deleted_at is not null then return null; end if;
  v_handles := public.member__mentioned_handles(coalesce(new.title, '') || ' ' || coalesce(new.content, ''));
  if cardinality(v_handles) = 0 then return null; end if;
  if new.author_kind = 'agent' then
    v_actor_kind := 'agent'; v_label := new.agent_name;   -- shown as AI (agent avatar + AI chip)
  elsif new.posted_as = 'group' then
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
    if new.reply_to_id is not null and new.reply_to_id is distinct from new.parent_id then
      select p.author_id into v_reply_to_author from public.posts p where p.id = new.reply_to_id and p.author_kind = 'member';
    end if;
  end if;
  for r in
    select m.id from public.members m
    where m.handle = any (v_handles) and m.signup_completed_at is not null and not m.is_banned
      and m.id <> new.author_id   -- an agent never notifies its own owner
      and m.id is distinct from v_parent_author and m.id is distinct from v_root_author
      and m.id is distinct from v_reply_to_author
      and (new.group_id is null or public.group__role(new.group_id, m.id) is not null)
      and public.post__can_see(new.author_id, new.visibility, m.id)
  loop
    perform public.notify__push(r.id, 'mention', 'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', new.id, new.id,
      v_link, coalesce(nullif(new.title, ''), new.content), 'mention:' || new.id || ':' || r.id);
  end loop;
  return null;
end $$;
revoke all on function public.notify__post_mention() from public, anon, authenticated;
