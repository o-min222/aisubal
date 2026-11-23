-- 0078 E1 contribution badges: small, server-awarded, never taken back, no leaderboard.
--  * member_badges keeps the highest tier a member reached per badge. badges__award(member)
--    recomputes from the source tables and only ever moves a tier up, so every trigger,
--    retry and the backfill below can call it any number of times (idempotent).
--  * Only real-name activity counts (posted_as 'real', author_kind 'member', not posted as
--    a group): a 부캐's posts never show up as a badge on the real profile.
--  * Awards notify through notify__push (category 'badges', its own toggle; push follows it).
--    The badge key rides in actor_label ('reviewer:2'); the app turns it into one sentence.
--  * Streaks need visits: member_visits gets one row per member per Seoul day (badges_visit()).
--  * Thresholds live here and in src/lib/badges.ts; tests/badges.test.ts keeps them equal.

create table if not exists public.member_badges (
  member_id uuid not null references public.members(id) on delete cascade,
  badge text not null check (badge in ('first_post', 'gallery', 'reviewer', 'inviter', 'liked', 'streak', 'founder', 'agent')),
  tier smallint not null check (tier >= 1),
  value int not null default 0,
  awarded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, badge)
);
alter table public.member_badges enable row level security;
revoke all on public.member_badges from anon, authenticated;
grant select on public.member_badges to authenticated;
drop policy if exists member_badges_select on public.member_badges;
create policy member_badges_select on public.member_badges for select to authenticated using ((select public.is_completed_member()));

create table if not exists public.member_visits (
  member_id uuid not null references public.members(id) on delete cascade,
  day date not null,
  primary key (member_id, day)
);
alter table public.member_visits enable row level security;
revoke all on public.member_visits from anon, authenticated;

-- tier thresholds (value needed for tier 1, 2, …)
create or replace function public.badges__tiers() returns jsonb
language sql immutable set search_path to '' as $$
  select '{"first_post":[1],"gallery":[1,3,10],"reviewer":[1,5,20],"inviter":[1,3],"liked":[5,20,50],"streak":[3,7,30],"founder":[1],"agent":[1]}'::jsonb
$$;

create or replace function public.badges__metrics(p_member uuid) returns table(badge text, value int)
language sql stable security definer set search_path to '' as $$
  with real_posts as (
    select p.like_count from public.posts p
    where p.author_id = p_member and p.posted_as = 'real' and p.author_kind = 'member' and p.as_group_id is null
      and not coalesce(p.is_agent_posted, false) and p.parent_id is null and p.deleted_at is null
  ), days as (
    select v.day, v.day - (row_number() over (order by v.day))::int as grp from public.member_visits v where v.member_id = p_member
  )
  select 'first_post', (select count(*)::int from real_posts)
  union all select 'liked', (select coalesce(max(like_count), 0)::int from real_posts)
  union all select 'gallery', (select count(*)::int from public.tool_submissions s where s.submitter_id = p_member and s.status = 'approved')
  union all select 'reviewer', (select count(*)::int from public.toolbox_reviews r where r.member_id = p_member)
  union all select 'inviter', (select count(*)::int from public.invite_codes i where i.created_by_id = p_member and i.used_by_id is not null)
  union all select 'streak', (select coalesce(max(n), 0)::int from (select count(*) n from days group by grp) x)
  union all select 'founder', (select case when m.pledge_no between 1 and 100 then m.pledge_no else 0 end from public.members m where m.id = p_member)
  union all select 'agent', (select count(*)::int from public.api_tokens t where t.member_id = p_member and t.first_used_at is not null)
$$;
revoke all on function public.badges__metrics(uuid) from public, anon, authenticated;

create or replace function public.badges__award(p_member uuid, p_notify boolean default true) returns int
language plpgsql security definer set search_path to '' as $$
declare r record; v_tier int; v_old int; v_new int := 0; v_tiers jsonb := public.badges__tiers();
begin
  if p_member is null or not exists (select 1 from public.members m where m.id = p_member and m.signup_completed_at is not null) then return 0; end if;
  for r in select * from public.badges__metrics(p_member) loop
    -- founder: any pledge number 1..100 earns it; the value is the number itself
    select count(*) into v_tier from jsonb_array_elements_text(v_tiers -> r.badge) t
      where (case when r.badge = 'founder' then least(r.value, 1) else r.value end) >= t::int;
    continue when v_tier = 0;
    select b.tier into v_old from public.member_badges b where b.member_id = p_member and b.badge = r.badge;
    if v_old is null then
      insert into public.member_badges(member_id, badge, tier, value) values (p_member, r.badge, v_tier, r.value);
    elsif v_tier > v_old then
      update public.member_badges set tier = v_tier, value = r.value, updated_at = now() where member_id = p_member and badge = r.badge;
    else
      update public.member_badges set value = greatest(value, r.value) where member_id = p_member and badge = r.badge and value < r.value and r.badge <> 'founder';
      continue;
    end if;
    v_new := v_new + 1;
    if p_notify then
      perform public.notify__push(p_member, 'badge', 'badges', 'someone', null, r.badge || ':' || v_tier, null,
        'member', p_member, null, '/members/me?badges=' || r.badge, null, 'badge:' || r.badge || ':' || v_tier);
    end if;
  end loop;
  return v_new;
end $$;
revoke all on function public.badges__award(uuid, boolean) from public, anon, authenticated;

-- one trigger function for every source table; a badge problem never blocks the real write
create or replace function public.badges__on_change() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_member uuid;
begin
  case tg_table_name
    when 'posts' then
      if new.posted_as <> 'real' or new.author_kind <> 'member' or new.parent_id is not null then return null; end if;
      if tg_op = 'UPDATE' and not exists (select 1 from jsonb_array_elements_text(public.badges__tiers() -> 'liked') t
                                          where old.like_count < t::int and new.like_count >= t::int) then return null; end if;
      v_member := new.author_id;
    when 'tool_submissions' then
      if new.status <> 'approved' or old.status = 'approved' then return null; end if;
      v_member := new.submitter_id;
    when 'toolbox_reviews' then v_member := new.member_id;
    when 'invite_codes' then
      if new.used_by_id is null or old.used_by_id is not null then return null; end if;
      v_member := new.created_by_id;
    when 'api_tokens' then
      if new.first_used_at is null then return null; end if;
      v_member := new.member_id;
    when 'members' then
      if new.pledge_no is null and new.signup_completed_at is null then return null; end if;
      v_member := new.id;
    when 'member_visits' then v_member := new.member_id;
    else return null;
  end case;
  perform public.badges__award(v_member, true);
  return null;
exception when others then return null;
end $$;
revoke all on function public.badges__on_change() from public, anon, authenticated;

drop trigger if exists badges_posts on public.posts;
create trigger badges_posts after insert or update of like_count on public.posts for each row execute function public.badges__on_change();
drop trigger if exists badges_submissions on public.tool_submissions;
create trigger badges_submissions after update of status on public.tool_submissions for each row execute function public.badges__on_change();
drop trigger if exists badges_reviews on public.toolbox_reviews;
create trigger badges_reviews after insert on public.toolbox_reviews for each row execute function public.badges__on_change();
drop trigger if exists badges_invites on public.invite_codes;
create trigger badges_invites after update of used_by_id on public.invite_codes for each row execute function public.badges__on_change();
drop trigger if exists badges_tokens on public.api_tokens;
create trigger badges_tokens after update of first_used_at on public.api_tokens for each row
  when (old.first_used_at is null and new.first_used_at is not null) execute function public.badges__on_change();
drop trigger if exists badges_members on public.members;
create trigger badges_members after update of pledge_no, signup_completed_at on public.members for each row
  when (old.pledge_no is distinct from new.pledge_no or old.signup_completed_at is distinct from new.signup_completed_at) execute function public.badges__on_change();
drop trigger if exists badges_visits on public.member_visits;
create trigger badges_visits after insert on public.member_visits for each row execute function public.badges__on_change();

-- one row per Seoul day; the app calls this once a day per device
create or replace function public.badges_visit() returns void
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.app__me();
begin
  if v_me is null or not public.is_completed_member() then return; end if;
  insert into public.member_visits(member_id, day) values (v_me, (now() at time zone 'Asia/Seoul')::date) on conflict do nothing;
end $$;
revoke all on function public.badges_visit() from public, anon;
grant execute on function public.badges_visit() to authenticated;

-- notifications: 'badge' kind, 'badges' category + toggle
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'comment', 'reply', 'like', 'follow', 'friend_request', 'friend_accept', 'invite_joined', 'agent_reply', 'agent_like',
  'gallery_recommended', 'gallery_approved', 'gallery_confirmed', 'gallery_rejected', 'follow_post', 'agent_mention', 'mention', 'badge'));
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (category in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following', 'badges'));
alter table public.notification_prefs add column if not exists badges boolean not null default true;

create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('replies', p.replies, 'likes', p.likes, 'social', p.social, 'invites', p.invites,
      'agents', p.agents, 'gallery', p.gallery, 'following', p.following, 'badges', p.badges)
    from public.notification_prefs p where p.member_id = public.current_member_id()),
    jsonb_build_object('replies', true, 'likes', true, 'social', true, 'invites', true, 'agents', true, 'gallery', true, 'following', true, 'badges', true))
$$;

create or replace function public.notification_prefs_set(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_key not in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following', 'badges') then raise exception 'bad_pref' using errcode = 'P0001'; end if;
  insert into public.notification_prefs(member_id) values (v_me) on conflict (member_id) do nothing;
  execute format('update public.notification_prefs set %I = $1, updated_at = now() where member_id = $2', p_key) using coalesce(p_on, true), v_me;
  return public.notification_prefs_get();
end $$;

-- backfill: existing members get what they already earned, quietly (no notification flood)
do $$ declare m record; begin
  for m in select id from public.members where signup_completed_at is not null loop
    perform public.badges__award(m.id, false);
  end loop;
end $$;
