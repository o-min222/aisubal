-- Notifications: bell + /notifications + per-member toggles (server-side; replaces the
-- device-only settings). Rows are written ONLY by triggers (SECURITY DEFINER); members
-- read their own through notifications_list / _unread / _mark_read.
-- Privacy: 익명 actors are stored as their per-thread alias; nickname (부캐) actors are
-- stored as the nickname snapshot with NO member id; agents as their agent name.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('comment', 'reply', 'like', 'follow', 'friend_request', 'friend_accept', 'invite_joined', 'agent_reply', 'agent_like')),
  category text not null check (category in ('replies', 'likes', 'social', 'invites', 'agents')),
  actor_kind text not null default 'member' check (actor_kind in ('member', 'agent', 'anon', 'someone')),
  actor_member_id uuid references public.members(id) on delete cascade,
  actor_label text,
  actor_avatar_url text,
  target_kind text check (target_kind in ('post', 'agora', 'anon', 'member')),
  target_id uuid,           -- the post the notification is about (root or the comment answered)
  source_id uuid,           -- the reply / like row that caused it (live-checked: deleted or hidden → dropped)
  link text not null,       -- where tapping goes
  excerpt text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(recipient_id) where read_at is null;
create unique index if not exists notifications_dedupe_uniq on public.notifications(recipient_id, dedupe_key) where dedupe_key is not null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

create table if not exists public.notification_prefs (
  member_id uuid primary key references public.members(id) on delete cascade,
  replies boolean not null default true,
  likes boolean not null default true,
  social boolean not null default true,
  invites boolean not null default true,
  agents boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;

-- ---------------------------------------------------------------- writer
create or replace function public.notify__push(
  p_recipient uuid, p_kind text, p_category text, p_actor_kind text, p_actor_member uuid,
  p_actor_label text, p_actor_avatar text, p_target_kind text, p_target uuid, p_source uuid,
  p_link text, p_excerpt text, p_dedupe text default null
) returns void
language plpgsql security definer set search_path to ''
as $$
declare v_on boolean;
begin
  if p_recipient is null or p_recipient = p_actor_member then return; end if;
  if not exists (select 1 from public.members m where m.id = p_recipient and m.signup_completed_at is not null and not m.is_banned) then return; end if;
  execute format('select coalesce((select %I from public.notification_prefs where member_id = $1), true)', p_category) into v_on using p_recipient;
  if not v_on then return; end if;
  insert into public.notifications(recipient_id, kind, category, actor_kind, actor_member_id, actor_label, actor_avatar_url, target_kind, target_id, source_id, link, excerpt, dedupe_key)
  values (p_recipient, p_kind, p_category, p_actor_kind, p_actor_member, p_actor_label, p_actor_avatar, p_target_kind, p_target, p_source, p_link, left(p_excerpt, 140), p_dedupe)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;
revoke all on function public.notify__push(uuid, text, text, text, uuid, text, text, text, uuid, uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- feed replies (posts)
create or replace function public.notify__post_reply() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare
  parent public.posts%rowtype; root public.posts%rowtype;
  v_actor_kind text; v_actor uuid; v_label text; v_avatar text; v_owner uuid;
  v_link text := '/posts/' || coalesce(new.root_id, new.id);
begin
  if new.parent_id is null or new.is_hidden or new.deleted_at is not null then return null; end if;
  select * into parent from public.posts where id = new.parent_id;
  if not found then return null; end if;
  select * into root from public.posts where id = coalesce(new.root_id, parent.id);
  if new.author_kind = 'agent' then
    v_actor_kind := 'agent'; v_actor := null; v_label := new.agent_name; v_owner := new.author_id;
  elsif new.posted_as = 'nickname' then
    v_actor_kind := 'member'; v_actor := null;
    select m.nickname, m.nickname_avatar_url into v_label, v_avatar from public.members m where m.id = new.author_id;
    v_owner := new.author_id;
  else
    v_actor_kind := 'member'; v_actor := new.author_id; v_owner := new.author_id;
  end if;
  -- the comment/reply being answered (members' own rows; skip the writer and the agent's owner)
  if parent.author_kind = 'member' and parent.author_id is distinct from v_owner then
    perform public.notify__push(parent.author_id,
      case when new.author_kind = 'agent' then 'agent_reply' when parent.parent_id is null then 'comment' else 'reply' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', parent.id, new.id, v_link, new.content);
  end if;
  -- the thread's author too, when they aren't the one answered
  if root.id is not null and root.id <> parent.id and root.author_kind = 'member'
     and root.author_id is distinct from v_owner and root.author_id is distinct from parent.author_id then
    perform public.notify__push(root.author_id, case when new.author_kind = 'agent' then 'agent_reply' else 'comment' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', root.id, new.id, v_link, new.content);
  end if;
  return null;
end;
$$;
drop trigger if exists posts_notify_reply on public.posts;
create trigger posts_notify_reply after insert on public.posts for each row execute function public.notify__post_reply();

-- ---------------------------------------------------------------- feed likes
create or replace function public.notify__post_like() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare p public.posts%rowtype; v_key text;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where source_id = old.id and kind in ('like', 'agent_like');
    return null;
  end if;
  select * into p from public.posts where id = new.post_id;
  if not found or p.deleted_at is not null then return null; end if;
  v_key := 'like:' || new.post_id || ':' || coalesce(new.member_id::text, new.token_id::text);
  if new.liker_type = 'agent' then
    perform public.notify__push(p.author_id, 'agent_like', 'likes', 'agent', null, new.agent_name, null, 'post', p.id, new.id,
      '/posts/' || coalesce(p.root_id, p.id), coalesce(nullif(p.title, ''), p.content), v_key);
  else
    perform public.notify__push(p.author_id, 'like', 'likes', 'member', new.member_id, null, null, 'post', p.id, new.id,
      '/posts/' || coalesce(p.root_id, p.id), coalesce(nullif(p.title, ''), p.content), v_key);
  end if;
  return null;
end;
$$;
drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify after insert or delete on public.post_likes for each row execute function public.notify__post_like();

-- ---------------------------------------------------------------- follows / friends
create or replace function public.notify__follow() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where recipient_id = old.followee_id and dedupe_key = 'follow:' || old.follower_id;
    return null;
  end if;
  perform public.notify__push(new.followee_id, 'follow', 'social', 'member', new.follower_id, null, null, 'member', new.follower_id, null,
    '/members/' || new.follower_id, null, 'follow:' || new.follower_id);
  return null;
end;
$$;
drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert or delete on public.follows for each row execute function public.notify__follow();

create or replace function public.notify__friendship() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where source_id = old.id and kind in ('friend_request', 'friend_accept');
    return null;
  end if;
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    delete from public.notifications where source_id = new.id and kind = 'friend_request';
    perform public.notify__push(new.addressee_id, 'friend_request', 'social', 'member', new.requester_id, null, null, 'member', new.requester_id, new.id,
      '/me?tab=network&view=requests', null);
  elsif new.status = 'accepted' and tg_op = 'UPDATE' and old.status is distinct from 'accepted' then
    delete from public.notifications where source_id = new.id and kind = 'friend_request';
    perform public.notify__push(new.requester_id, 'friend_accept', 'social', 'member', new.addressee_id, null, null, 'member', new.addressee_id, new.id,
      '/members/' || new.addressee_id, null);
  elsif new.status = 'declined' then
    delete from public.notifications where source_id = new.id and kind = 'friend_request';
  end if;
  return null;
end;
$$;
drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify after insert or update of status or delete on public.friendships for each row execute function public.notify__friendship();

-- ---------------------------------------------------------------- invites
create or replace function public.notify__invite_used() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if new.used_by_id is not null and old.used_by_id is null then
    perform public.notify__push(new.created_by_id, 'invite_joined', 'invites', 'member', new.used_by_id, null, null, 'member', new.used_by_id, new.id,
      '/me?tab=network', null, 'invite:' || new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists invite_codes_notify on public.invite_codes;
create trigger invite_codes_notify after update of used_by_id on public.invite_codes for each row execute function public.notify__invite_used();

-- ---------------------------------------------------------------- 익명 replies + likes (alias only, never who)
create or replace function public.notify__anon_reply() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare r public.anon_posts%rowtype; parent public.anon_posts%rowtype; v_parent_author uuid; v_root_author uuid;
begin
  if not new.is_reply then return null; end if;
  select * into r from public.anon_posts where id = new.post_id;
  if not found then return null; end if;
  select * into parent from public.anon_posts where id = coalesce(r.reply_to_id, r.parent_id);
  select a.member_id into v_parent_author from anon_private.post_authors a where a.post_id = parent.id;
  select a.member_id into v_root_author from anon_private.post_authors a where a.post_id = new.root_id;
  if v_parent_author is not null and v_parent_author <> new.member_id then
    perform public.notify__push(v_parent_author, case when parent.parent_id is null then 'comment' else 'reply' end, 'replies', 'anon', null, r.alias, null,
      'anon', parent.id, r.id, '/anon/' || new.root_id, r.body);
  end if;
  if v_root_author is not null and v_root_author <> new.member_id and v_root_author is distinct from v_parent_author then
    perform public.notify__push(v_root_author, 'comment', 'replies', 'anon', null, r.alias, null, 'anon', new.root_id, r.id, '/anon/' || new.root_id, r.body);
  end if;
  return null;
end;
$$;
drop trigger if exists anon_post_authors_notify on anon_private.post_authors;
create trigger anon_post_authors_notify after insert on anon_private.post_authors for each row execute function public.notify__anon_reply();

create or replace function public.notify__anon_like() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare v_author uuid; r public.anon_posts%rowtype;
begin
  if tg_op = 'DELETE' then
    select a.member_id into v_author from anon_private.post_authors a where a.post_id = old.post_id;
    delete from public.notifications where recipient_id = v_author and dedupe_key = 'anonlike:' || old.post_id || ':' || md5(old.member_id::text);
    return null;
  end if;
  select * into r from public.anon_posts where id = new.post_id;
  select a.member_id into v_author from anon_private.post_authors a where a.post_id = new.post_id;
  if v_author is null or v_author = new.member_id then return null; end if;
  perform public.notify__push(v_author, 'like', 'likes', 'someone', null, null, null, 'anon', r.id, null,
    '/anon/' || coalesce(r.root_id, r.id), r.body, 'anonlike:' || new.post_id || ':' || md5(new.member_id::text));
  return null;
end;
$$;
drop trigger if exists anon_likes_notify on anon_private.likes;
create trigger anon_likes_notify after insert or delete on anon_private.likes for each row execute function public.notify__anon_like();

-- ---------------------------------------------------------------- 아고라: my agents' posts
create or replace function public.notify__agora_reply() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare parent public.agora_posts%rowtype;
begin
  if new.parent_id is null then return null; end if;
  select * into parent from public.agora_posts where id = coalesce(new.reply_to_id, new.parent_id);
  if not found or parent.owner_member_id = new.owner_member_id then return null; end if;
  perform public.notify__push(parent.owner_member_id, 'agent_reply', 'agents', 'agent', null, new.agent_name, null, 'agora', parent.id, new.id,
    '/agora/' || coalesce(new.root_id, new.parent_id), new.body);
  return null;
end;
$$;
drop trigger if exists agora_posts_notify on public.agora_posts;
create trigger agora_posts_notify after insert on public.agora_posts for each row execute function public.notify__agora_reply();

create or replace function public.notify__agora_like() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare p public.agora_posts%rowtype; v_key text;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where source_id = old.id and kind = 'like' and target_kind = 'agora';
    return null;
  end if;
  select * into p from public.agora_posts where id = new.post_id;
  if not found or p.deleted_at is not null then return null; end if;
  v_key := 'agoralike:' || new.post_id || ':' || coalesce(new.member_id::text, new.token_id::text);
  perform public.notify__push(p.owner_member_id, 'like', 'agents',
    case when new.liker_type = 'agent' then 'agent' else 'member' end,
    case when new.liker_type = 'agent' then null else new.member_id end,
    case when new.liker_type = 'agent' then new.agent_name end, null,
    'agora', p.id, new.id, '/agora/' || coalesce(p.root_id, p.id), p.body, v_key);
  return null;
end;
$$;
drop trigger if exists agora_likes_notify on public.agora_likes;
create trigger agora_likes_notify after insert or delete on public.agora_likes for each row execute function public.notify__agora_like();

-- ---------------------------------------------------------------- reader RPCs
-- Likes on the same post collapse into one row ('A님 외 N명'); sources that were deleted or
-- hidden since are dropped live; member actors resolve to their current self-made profile.
create or replace function public.notifications_list(p_category text default null, p_offset integer default 0, p_limit integer default 20)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare v_me uuid := public.current_member_id(); v_lim int := least(greatest(coalesce(p_limit, 20), 1), 50); v_off int := least(greatest(coalesce(p_offset, 0), 0), 5000);
  v_items jsonb; v_total int; v_unread int;
begin
  if v_me is null then return jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'unread', 0); end if;
  with live as (
    select n.* from public.notifications n
    where n.recipient_id = v_me
      and (p_category is null or n.category = p_category)
      and n.created_at > now() - interval '90 days'
      and (n.source_id is null or n.target_kind not in ('post', 'anon', 'agora') or n.kind in ('like', 'agent_like') or case n.target_kind
        when 'post' then exists (select 1 from public.posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden)
        when 'anon' then exists (select 1 from public.anon_posts s where s.id = n.source_id and not s.is_deleted and not s.is_hidden)
        when 'agora' then exists (select 1 from public.agora_posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden)
        else true end)
  ), grouped as (
    select
      case when kind in ('like', 'agent_like') then 'g:' || target_kind || ':' || target_id else id::text end as gid,
      (array_agg(id order by created_at desc))[1] as id,
      (array_agg(kind order by created_at desc))[1] as kind,
      min(category) as category,
      (array_agg(actor_kind order by created_at desc))[1] as actor_kind,
      (array_agg(actor_member_id order by created_at desc))[1] as actor_member_id,
      (array_agg(actor_label order by created_at desc))[1] as actor_label,
      (array_agg(actor_avatar_url order by created_at desc))[1] as actor_avatar_url,
      min(target_kind) as target_kind,
      (array_agg(link order by created_at desc))[1] as link,
      (array_agg(excerpt order by created_at desc))[1] as excerpt,
      count(*)::int as actor_count,
      max(created_at) as created_at,
      bool_or(read_at is null) as unread
    from live
    group by 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'kind', g.kind, 'category', g.category, 'link', g.link, 'excerpt', g.excerpt,
      'targetKind', g.target_kind, 'count', g.actor_count, 'createdAt', g.created_at, 'unread', g.unread,
      'actor', case
        when g.actor_kind = 'member' and g.actor_member_id is not null then (
          select jsonb_build_object('kind', 'member', 'id', m.id,
            'name', case when m.profile_completed_at is not null then m.display_name else '새 멤버' end,
            'avatarUrl', case when m.profile_completed_at is not null then m.avatar_url end)
          from public.members m where m.id = g.actor_member_id)
        else jsonb_build_object('kind', g.actor_kind, 'id', null, 'name', g.actor_label, 'avatarUrl', g.actor_avatar_url) end
    ) order by g.created_at desc) filter (where g.rn > v_off and g.rn <= v_off + v_lim), '[]'::jsonb),
    count(*)::int
  into v_items, v_total
  from (select grouped.*, row_number() over (order by created_at desc) rn from grouped) g;
  select count(*)::int into v_unread from public.notifications where recipient_id = v_me and read_at is null;
  return jsonb_build_object('items', v_items, 'total', v_total, 'unread', v_unread);
end;
$$;
revoke all on function public.notifications_list(text, integer, integer) from public, anon;
grant execute on function public.notifications_list(text, integer, integer) to authenticated;

create or replace function public.notifications_unread() returns integer
language sql stable security definer set search_path to ''
as $$ select count(*)::int from public.notifications where recipient_id = public.current_member_id() and read_at is null $$;
revoke all on function public.notifications_unread() from public, anon;
grant execute on function public.notifications_unread() to authenticated;

-- p_category null = everything
create or replace function public.notifications_mark_read(p_category text default null) returns integer
language plpgsql security definer set search_path to ''
as $$
declare v_n int;
begin
  update public.notifications set read_at = now()
   where recipient_id = public.current_member_id() and read_at is null and (p_category is null or category = p_category);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.notifications_mark_read(text) from public, anon;
grant execute on function public.notifications_mark_read(text) to authenticated;

create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path to ''
as $$
  select coalesce((select jsonb_build_object('replies', p.replies, 'likes', p.likes, 'social', p.social, 'invites', p.invites, 'agents', p.agents)
    from public.notification_prefs p where p.member_id = public.current_member_id()),
    jsonb_build_object('replies', true, 'likes', true, 'social', true, 'invites', true, 'agents', true))
$$;
revoke all on function public.notification_prefs_get() from public, anon;
grant execute on function public.notification_prefs_get() to authenticated;

create or replace function public.notification_prefs_set(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_key not in ('replies', 'likes', 'social', 'invites', 'agents') then raise exception 'bad_pref' using errcode = 'P0001'; end if;
  insert into public.notification_prefs(member_id) values (v_me) on conflict (member_id) do nothing;
  execute format('update public.notification_prefs set %I = $1, updated_at = now() where member_id = $2', p_key) using coalesce(p_on, true), v_me;
  return public.notification_prefs_get();
end;
$$;
revoke all on function public.notification_prefs_set(text, boolean) from public, anon;
grant execute on function public.notification_prefs_set(text, boolean) to authenticated;
