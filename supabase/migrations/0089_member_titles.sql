-- A37: titles by join order (pledge_no = 입단 기록 order).
--   1..10   → 'founder' (창립멤버 / Founding member)
--   11..100 → 'early'   (초기멤버 / Early member)
-- New signups get theirs from the existing badges_members trigger (pledge_no set → badges__award).
-- Idempotent: re-running re-derives both titles from pledge_no.

alter table public.member_badges drop constraint if exists member_badges_badge_check;
alter table public.member_badges add constraint member_badges_badge_check check (badge in ('first_post', 'gallery', 'reviewer', 'inviter', 'liked', 'streak', 'founder', 'early', 'agent', 'invite_king'));

create or replace function public.badges__tiers() returns jsonb
language sql immutable set search_path to '' as $$
  select '{"first_post":[1],"gallery":[1,3,10],"reviewer":[1,5,20],"inviter":[1,3],"liked":[5,20,50],"streak":[3,7,30],"founder":[1],"early":[1],"agent":[1],"invite_king":[1,2,3,5,10]}'::jsonb
$$;

create or replace function public.badges__metrics(p_member uuid) returns table(badge text, value integer)
language sql stable security definer set search_path to '' as $$
  with real_posts as (
    select p.like_count - (select count(*) from public.post_likes l where l.post_id = p.id and l.member_id = p_member)::int as like_count
    from public.posts p
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
  union all select 'founder', (select case when m.pledge_no between 1 and 10 then m.pledge_no else 0 end from public.members m where m.id = p_member)
  union all select 'early', (select case when m.pledge_no between 11 and 100 then m.pledge_no else 0 end from public.members m where m.id = p_member)
  union all select 'agent', (select count(*)::int from public.api_tokens t where t.member_id = p_member and t.first_used_at is not null)
  union all select 'invite_king', (select coalesce(max(i.batch), 1)::int - 1 from public.invite_codes i where i.created_by_id = p_member)
$$;

create or replace function public.badges__award(p_member uuid, p_notify boolean default true) returns integer
language plpgsql security definer set search_path to '' as $$
declare r record; v_tier int; v_old int; v_new int := 0; v_tiers jsonb := public.badges__tiers();
begin
  if p_member is null or not exists (select 1 from public.members m where m.id = p_member and m.signup_completed_at is not null) then return 0; end if;
  for r in select * from public.badges__metrics(p_member) loop
    -- founder / early: a pledge number in range earns it; the value is the number itself
    select count(*) into v_tier from jsonb_array_elements_text(v_tiers -> r.badge) t
      where (case when r.badge in ('founder', 'early') then least(r.value, 1) else r.value end) >= t::int;
    continue when v_tier = 0;
    select b.tier into v_old from public.member_badges b where b.member_id = p_member and b.badge = r.badge;
    if v_old is null then
      insert into public.member_badges(member_id, badge, tier, value) values (p_member, r.badge, v_tier, r.value);
    elsif v_tier > v_old then
      update public.member_badges set tier = v_tier, value = r.value, updated_at = now() where member_id = p_member and badge = r.badge;
    else
      update public.member_badges set value = greatest(value, r.value) where member_id = p_member and badge = r.badge and value < r.value and r.badge not in ('founder', 'early');
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

-- backfill: drop titles that no longer match the number, then award quietly
delete from public.member_badges b using public.members m
 where b.member_id = m.id and b.badge = 'founder' and not coalesce(m.pledge_no between 1 and 10, false);
delete from public.member_badges b using public.members m
 where b.member_id = m.id and b.badge = 'early' and not coalesce(m.pledge_no between 11 and 100, false);
update public.member_badges b set value = m.pledge_no from public.members m
 where b.member_id = m.id and b.badge in ('founder', 'early') and b.value is distinct from m.pledge_no;
do $$
declare r record;
begin
  for r in select id from public.members where signup_completed_at is not null and pledge_no between 1 and 100 loop
    perform public.badges__award(r.id, false);
  end loop;
end $$;
