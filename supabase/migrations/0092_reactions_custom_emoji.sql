-- A39: Slack-style emoji reactions on feed posts and comments, plus member-made custom emoji.
--  * 👍 IS the existing like: post_likes stays its storage, so like_count, badges, agent likes
--    (feed_agent_like) and their notifications keep working and every existing like is a 👍.
--  * every other emoji lives in post_reactions (members only; self-reactions allowed).
--  * custom emoji: custom_emojis(shortcode) + a public 'emoji' bucket; uploader or admin deletes.
--  * ranking: posts.reaction_count (non-👍) and posts.engage_count = like_count + reaction_count.
--  * notifications: kind 'reaction', one per reactor per post (shares the like's dedupe key, so
--    👍 + 🎉 from the same person is one notification).

-- ---- custom emoji ----------------------------------------------------------------------
create table if not exists public.custom_emojis (
  shortcode text primary key check (shortcode ~ '^[a-z0-9_]{2,32}$'),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[a-z0-9_]{2,32}-[a-z0-9]{4,16}\.(png|gif|webp|jpg)$'),
  created_by uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.custom_emojis enable row level security;
drop policy if exists custom_emojis_select on public.custom_emojis;
create policy custom_emojis_select on public.custom_emojis for select to authenticated using ((select public.is_completed_member()));
drop policy if exists custom_emojis_insert on public.custom_emojis;
create policy custom_emojis_insert on public.custom_emojis for insert to authenticated
  with check (created_by = (select public.current_member_id()) and (select public.is_completed_member())
              and split_part(storage_path, '/', 1) = (select auth.uid())::text);
drop policy if exists custom_emojis_delete on public.custom_emojis;
create policy custom_emojis_delete on public.custom_emojis for delete to authenticated
  using (created_by = (select public.current_member_id()) or (select public.app__is_admin()));
grant select, insert, delete on public.custom_emojis to authenticated;

create or replace function public.custom_emojis__limit() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if (select count(*) from public.custom_emojis where created_by = new.created_by) >= 50 then
    raise exception 'emoji_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.custom_emojis__limit() from public, anon, authenticated;
drop trigger if exists custom_emojis_limit on public.custom_emojis;
create trigger custom_emojis_limit before insert on public.custom_emojis for each row execute function public.custom_emojis__limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emoji', 'emoji', true, 262144, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = 262144, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists emoji_insert_own on storage.objects;
create policy emoji_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'emoji' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_completed_member()));
drop policy if exists emoji_delete_own_or_admin on storage.objects;
create policy emoji_delete_own_or_admin on storage.objects for delete to authenticated
  using (bucket_id = 'emoji' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.app__is_admin())));

-- ---- reactions -------------------------------------------------------------------------
create table if not exists public.post_reactions (
  id uuid not null default gen_random_uuid() unique,
  post_id uuid not null references public.posts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text not null check (
    char_length(emoji) between 1 and 34 and emoji <> '👍'
    and (emoji ~ '^:[a-z0-9_]{2,32}:$' or emoji !~ '[A-Za-z[:space:]<>&"''`\\]')
  ),
  created_at timestamptz not null default now(),
  primary key (post_id, member_id, emoji)
);
create index if not exists post_reactions_post on public.post_reactions (post_id);
alter table public.post_reactions enable row level security;
drop policy if exists post_reactions_select on public.post_reactions;
create policy post_reactions_select on public.post_reactions for select to authenticated using ((select public.is_completed_member()));
drop policy if exists post_reactions_insert on public.post_reactions;
create policy post_reactions_insert on public.post_reactions for insert to authenticated
  with check (member_id = (select public.current_member_id()) and (select public.is_completed_member()));
drop policy if exists post_reactions_delete on public.post_reactions;
create policy post_reactions_delete on public.post_reactions for delete to authenticated
  using (member_id = (select public.current_member_id()));
grant select, insert, delete on public.post_reactions to authenticated;

-- custom shortcodes must exist; at most 20 different reactions per member per post
create or replace function public.post_reactions__guard() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.emoji ~ '^:[a-z0-9_]{2,32}:$' and not exists (select 1 from public.custom_emojis c where ':' || c.shortcode || ':' = new.emoji) then
    raise exception 'reaction_unknown_emoji' using errcode = 'P0001';
  end if;
  if (select count(*) from public.post_reactions r where r.post_id = new.post_id and r.member_id = new.member_id) >= 20 then
    raise exception 'reaction_limit' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.posts p where p.id = new.post_id and p.deleted_at is null) then
    raise exception 'reaction_post_gone' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.post_reactions__guard() from public, anon, authenticated;
drop trigger if exists post_reactions_guard on public.post_reactions;
create trigger post_reactions_guard before insert on public.post_reactions for each row execute function public.post_reactions__guard();

-- deleting a custom emoji removes its reactions
create or replace function public.custom_emojis__on_delete() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  delete from public.post_reactions where emoji = ':' || old.shortcode || ':';
  return null;
end $$;
revoke all on function public.custom_emojis__on_delete() from public, anon, authenticated;
drop trigger if exists custom_emojis_on_delete on public.custom_emojis;
create trigger custom_emojis_on_delete after delete on public.custom_emojis for each row execute function public.custom_emojis__on_delete();

-- ---- counters + ranking ------------------------------------------------------------------
alter table public.posts add column if not exists reaction_count integer not null default 0;
alter table public.posts add column if not exists engage_count integer generated always as (coalesce(like_count, 0) + coalesce(reaction_count, 0)) stored;
create index if not exists posts_engage_created on public.posts (engage_count desc, created_at desc);

create or replace function public.post_reactions__count() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reaction_count = reaction_count + 1 where id = new.post_id;
  else
    update public.posts set reaction_count = greatest(reaction_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
revoke all on function public.post_reactions__count() from public, anon, authenticated;
drop trigger if exists post_reactions_count on public.post_reactions;
create trigger post_reactions_count after insert or delete on public.post_reactions for each row execute function public.post_reactions__count();

-- ---- notifications -----------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction']));

create or replace function public.notify__post_reaction() returns trigger
language plpgsql security definer set search_path to '' as $$
declare p public.posts%rowtype; v_key text;
begin
  if tg_op = 'DELETE' then
    -- keep the notification while this member still has another reaction on the post
    if not exists (select 1 from public.post_reactions r where r.post_id = old.post_id and r.member_id = old.member_id) then
      delete from public.notifications where kind = 'reaction' and dedupe_key = 'like:' || old.post_id || ':' || old.member_id;
    end if;
    return null;
  end if;
  select * into p from public.posts where id = new.post_id;
  if not found or p.deleted_at is not null or p.author_id = new.member_id then return null; end if;
  v_key := 'like:' || new.post_id || ':' || new.member_id;
  perform public.notify__push(p.author_id, 'reaction', 'likes', 'member', new.member_id, new.emoji, null, 'post', p.id, new.id,
    '/posts/' || coalesce(p.root_id, p.id), coalesce(nullif(p.title, ''), p.content), v_key);
  return null;
end $$;
revoke all on function public.notify__post_reaction() from public, anon, authenticated;
drop trigger if exists post_reactions_notify on public.post_reactions;
create trigger post_reactions_notify after insert or delete on public.post_reactions for each row execute function public.notify__post_reaction();
