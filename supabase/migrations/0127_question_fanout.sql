-- A93 (AI-31): a '질문해요' post notifies the author's friends and followers.
-- * A question = a root, real-name, member post whose body opens with the 질문해요 starter
--   ('혹시 이거 아시는 분?' / 'Does anyone know this?' — the composer chip's prefill, src/lib/quick-post-rules.ts).
-- * Recipients: followers ∪ accepted friends (deduped), minus the author, unfinished signups and banned
--   members, members who turned off 'following' notifications, and anyone the post's visibility hides
--   from (post__can_see: private → nobody, followers → followers + friends, friends → friends).
--   Group posts and 부캐 (nickname) posts never fan out: that would tie the nickname to the person's graph.
-- * At most site_config 'question_fanout_daily_cap' (default 3) fan-outs per author per KST day.
-- * Idempotent per post: question_fanouts(post_id) is the claim; notifications use dedupe_key 'question:<post>'.
-- * A fanned-out question replaces the folded follow_post row for that post (no double ping);
--   over the cap, followers still get the usual follow_post.
-- In-app rows push through the existing notifications_push trigger.

insert into public.site_config (key, value) values ('question_fanout_daily_cap', '3') on conflict (key) do nothing;

create table if not exists public.question_fanouts (
  post_id uuid primary key references public.posts(id) on delete cascade,
  author_id uuid not null references public.members(id) on delete cascade,
  recipients integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists question_fanouts_author_idx on public.question_fanouts(author_id, created_at desc);
alter table public.question_fanouts enable row level security;
revoke all on public.question_fanouts from public, anon, authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','first_post','digest','digest_hot','digest_pick','digest_nudge','question']));

-- the 질문해요 starter at the start of the body (either locale)
create or replace function public.post__is_question(p_content text) returns boolean
language sql immutable set search_path to ''
as $$ select coalesce(p_content, '') ~ '^\s*(혹시 이거 아시는 분\?|Does anyone know this\?)' $$;

-- the line the notification quotes: the first line after the starter ('혹시 이거 아시는 분? Cursor 룰 공유 돼요?'
-- → 'Cursor 룰 공유 돼요?'); the starter itself only when nothing else was written
create or replace function public.post__question_line(p_content text) returns text
language sql immutable set search_path to ''
as $$
  select left(coalesce(
    nullif(btrim(split_part(btrim(regexp_replace(coalesce(p_content, ''), '^\s*(혹시 이거 아시는 분\?|Does anyone know this\?)\s*', '')), E'\n', 1)), ''),
    btrim(split_part(btrim(coalesce(p_content, '')), E'\n', 1))), 140)
$$;

-- would this new post fan out as a question? (shared by notify__follow_post and notify__question_post)
create or replace function public.question__fanout_due(p public.posts) returns boolean
language plpgsql stable security definer set search_path to ''
as $$
declare v_cap integer; v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p.parent_id is not null or p.group_id is not null or p.author_kind <> 'member' or p.posted_as <> 'real'
     or p.is_hidden or p.deleted_at is not null or coalesce(p.visibility, 'members') = 'private'
     or not public.post__is_question(p.content) then return false; end if;
  if exists (select 1 from public.question_fanouts q where q.post_id = p.id) then return false; end if;
  if not exists (select 1 from public.members m where m.id = p.author_id and m.signup_completed_at is not null and not m.is_banned) then return false; end if;
  select coalesce((select case when value ~ '^[0-9]{1,3}$' then value::int end from public.site_config where key = 'question_fanout_daily_cap'), 3) into v_cap;
  return (select count(*) from public.question_fanouts q
           where q.author_id = p.author_id and (q.created_at at time zone 'Asia/Seoul')::date = v_day) < v_cap;
end;
$$;
revoke all on function public.post__is_question(text) from public, anon, authenticated;
revoke all on function public.post__question_line(text) from public, anon, authenticated;
revoke all on function public.question__fanout_due(public.posts) from public, anon, authenticated;

create or replace function public.notify__question_post() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare v_line text; v_n integer;
begin
  if not public.question__fanout_due(new) then return null; end if;
  insert into public.question_fanouts(post_id, author_id) values (new.id, new.author_id) on conflict (post_id) do nothing;
  if not found then return null; end if;
  -- the copy: '{name}님이 질문했어요: {first line}'
  v_line := public.post__question_line(new.content);
  insert into public.notifications(recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, source_id, link, excerpt, dedupe_key)
  select r.id, 'question', 'following', 'member', new.author_id, 'post', new.id, new.id, '/posts/' || new.id, v_line, 'question:' || new.id
    from (
      select f.follower_id as id from public.follows f where f.followee_id = new.author_id
      union
      select case when fr.requester_id = new.author_id then fr.addressee_id else fr.requester_id end
        from public.friendships fr
       where fr.status = 'accepted' and (fr.requester_id = new.author_id or fr.addressee_id = new.author_id)
    ) r
    join public.members m on m.id = r.id and m.signup_completed_at is not null and not m.is_banned
    left join public.notification_prefs p on p.member_id = r.id
   where r.id <> new.author_id and coalesce(p.following, true)
     and public.post__can_see(new.author_id, new.visibility, r.id)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_n = row_count;
  update public.question_fanouts set recipients = v_n where post_id = new.id;
  return null;
end;
$$;
revoke all on function public.notify__question_post() from public, anon, authenticated;

drop trigger if exists posts_notify_question on public.posts;
create trigger posts_notify_question after insert on public.posts for each row execute function public.notify__question_post();

-- follow_post (0095) + one line: a question that fans out already pings every follower
CREATE OR REPLACE FUNCTION public.notify__follow_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_handle text; v_excerpt text; v_post_link text := '/posts/' || new.id;
begin
  if new.parent_id is not null or new.group_id is not null or new.author_kind <> 'member' or new.posted_as <> 'real'
     or new.is_hidden or new.deleted_at is not null or new.visibility not in ('members', 'followers') then return null; end if;
  if public.question__fanout_due(new) then return null; end if; -- A93: notify__question_post covers this post
  select m.handle into v_handle from public.members m where m.id = new.author_id;
  v_excerpt := left(coalesce(nullif(btrim(new.title), ''), new.content), 140);
  -- fold into the follower's unread row from the last 24h
  update public.notifications n
     set item_count = n.item_count + 1, created_at = now(), target_id = new.id, source_id = new.id, excerpt = v_excerpt,
         link = coalesce('/u/' || v_handle, v_post_link)
   where n.kind = 'follow_post' and n.actor_member_id = new.author_id and n.read_at is null
     and n.created_at > now() - interval '24 hours'
     and n.recipient_id in (select f.follower_id from public.follows f where f.followee_id = new.author_id);
  insert into public.notifications(recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, source_id, link, excerpt)
  select f.follower_id, 'follow_post', 'following', 'member', new.author_id, 'post', new.id, new.id, v_post_link, v_excerpt
    from public.follows f
    join public.members m on m.id = f.follower_id and m.signup_completed_at is not null and not m.is_banned
    left join public.notification_prefs p on p.member_id = f.follower_id
   where f.followee_id = new.author_id and f.follower_id <> new.author_id and coalesce(p.following, true)
     and not exists (select 1 from public.notifications n where n.recipient_id = f.follower_id and n.kind = 'follow_post'
                       and n.actor_member_id = new.author_id and n.read_at is null and n.created_at > now() - interval '24 hours');
  return null;
end;
$function$;
