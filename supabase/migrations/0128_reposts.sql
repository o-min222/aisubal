-- A95 (Colin t331u): Threads-style repost.
-- * post_reposts(post_id, member_id): one repost per member per post; posts.repost_count is the counter.
-- * Repostable = a root, real-name (not 부캐), non-group post that anyone signed in can read
--   (visibility 'members'), not hidden or deleted, and not your own. Restricted posts (followers /
--   friends / private) can never be reposted, so a repost can't carry a post past its audience.
--   The guard trigger enforces it; a post that is restricted later simply drops out of feeds because
--   the feed reads the post under its RLS (posts_select) like any other row.
-- * Feed: followers (scope 팔로잉) and friends (scope 친구) see the repost in the reposter's name
--   (read in the app: post_reposts joined to posts, newest repost first).
-- * Notification: kind 'repost' (category 'likes') to the author, deduped per (post, reposter),
--   removed again when the repost is undone. source_id = the post so notifications_list can still
--   check the viewer may see it.
-- No anon access; the table has RLS and only authenticated members can read, add or remove their own.

alter table public.posts add column if not exists repost_count integer not null default 0;
grant select (repost_count) on public.posts to authenticated;

create table if not exists public.post_reposts (
  id uuid not null default gen_random_uuid() unique,
  post_id uuid not null references public.posts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, member_id)
);
create index if not exists post_reposts_member_idx on public.post_reposts (member_id, created_at desc);
create index if not exists post_reposts_recent_idx on public.post_reposts (created_at desc);

alter table public.post_reposts enable row level security;
revoke all on public.post_reposts from public, anon, authenticated;
drop policy if exists post_reposts_select on public.post_reposts;
create policy post_reposts_select on public.post_reposts for select to authenticated using ((select public.is_completed_member()));
drop policy if exists post_reposts_insert on public.post_reposts;
create policy post_reposts_insert on public.post_reposts for insert to authenticated
  with check (member_id = (select public.current_member_id()) and (select public.is_completed_member()));
drop policy if exists post_reposts_delete on public.post_reposts;
create policy post_reposts_delete on public.post_reposts for delete to authenticated
  using (member_id = (select public.current_member_id()));
grant select, insert, delete on public.post_reposts to authenticated;

-- who may repost what (SECURITY DEFINER: reads the post whatever its RLS says, then decides)
create or replace function public.post_reposts__guard() returns trigger
language plpgsql security definer set search_path to '' as $$
declare p public.posts%rowtype;
begin
  select * into p from public.posts where id = new.post_id;
  if not found or p.parent_id is not null or p.group_id is not null or p.as_group_id is not null
     or p.posted_as <> 'real' or p.is_hidden or p.deleted_at is not null
     or coalesce(p.visibility, 'members') <> 'members' or p.author_id = new.member_id then
    raise exception 'repost_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.post_reposts__guard() from public, anon, authenticated;
drop trigger if exists post_reposts_guard on public.post_reposts;
create trigger post_reposts_guard before insert on public.post_reposts for each row execute function public.post_reposts__guard();

create or replace function public.post_reposts__count() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set repost_count = repost_count + 1 where id = new.post_id;
  else
    update public.posts set repost_count = greatest(repost_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
revoke all on function public.post_reposts__count() from public, anon, authenticated;
drop trigger if exists post_reposts_count on public.post_reposts;
create trigger post_reposts_count after insert or delete on public.post_reposts for each row execute function public.post_reposts__count();

-- notifications
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','first_post','digest','digest_hot','digest_pick','digest_nudge','question','repost']));

create or replace function public.notify__post_repost() returns trigger
language plpgsql security definer set search_path to '' as $$
declare p public.posts%rowtype;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where kind = 'repost' and dedupe_key = 'repost:' || old.post_id || ':' || old.member_id;
    return null;
  end if;
  select * into p from public.posts where id = new.post_id;
  if not found or p.deleted_at is not null then return null; end if;
  perform public.notify__push(p.author_id, 'repost', 'likes', 'member', new.member_id, null, null, 'post', p.id, p.id,
    '/posts/' || p.id, coalesce(nullif(p.title, ''), p.content), 'repost:' || p.id || ':' || new.member_id);
  return null;
end $$;
revoke all on function public.notify__post_repost() from public, anon, authenticated;
drop trigger if exists post_reposts_notify on public.post_reposts;
create trigger post_reposts_notify after insert or delete on public.post_reposts for each row execute function public.notify__post_repost();
