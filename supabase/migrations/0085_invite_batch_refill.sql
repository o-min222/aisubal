-- 0085 (A31, Colin 2026-11-23): "초대권 N장 다 쓰고 다 들어왔으면 N장이 바로 다시 차도록. 뱃지와 함께."
-- N is the admin setting site_config.invites_per_member (never hardcoded here).
--  * invite codes come in batches (invite_codes.batch). Existing codes are batch 1 and stay valid.
--  * when the last code of the member's current batch is redeemed (the invitee completed signup in
--    redeem_invite), the same transaction issues a fresh batch of N codes, awards the tiered
--    'invite_king' badge (completed batches) and notifies 'invite_refill'.
--    Serialised on the inviter's members row, so racing redemptions can't make two batches; re-running
--    is a no-op because the new batch has unused codes.
--  * replaces the 7-day per-slot renewal (invites__renew_due becomes a no-op; nothing renewed so far).

alter table public.invite_codes add column if not exists batch integer not null default 1;
create index if not exists invite_codes_creator_batch_idx on public.invite_codes (created_by_id, batch);

create or replace function public.invites__allowance() returns integer
language sql stable security definer set search_path to '' as $$
  select coalesce((select case when value ~ '^[0-9]+$' then least(value::int, 50) end from public.site_config where key = 'invites_per_member'), 3);
$$;
revoke all on function public.invites__allowance() from public, anon, authenticated;

create or replace function public.invites__new_code(p_member uuid, p_batch integer) returns void
language plpgsql security definer set search_path to '' as $$
declare v_code text;
begin
  loop
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.invite_codes where code = v_code);
  end loop;
  insert into public.invite_codes (code, created_by_id, batch) values (v_code, p_member, p_batch);
end;
$$;
revoke all on function public.invites__new_code(uuid, integer) from public, anon, authenticated;

-- top the member's current batch up to N (signup, a raised setting); never removes or reissues
create or replace function public.create_member_invite_codes(p_member_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare v_n integer := public.invites__allowance(); v_batch integer; v_have integer;
begin
  select coalesce(max(batch), 1) into v_batch from public.invite_codes where created_by_id = p_member_id;
  select count(*) into v_have from public.invite_codes where created_by_id = p_member_id and batch = v_batch;
  while v_have < v_n loop
    perform public.invites__new_code(p_member_id, v_batch);
    v_have := v_have + 1;
  end loop;
end;
$$;
revoke all on function public.create_member_invite_codes(uuid) from public, anon, authenticated;

-- the refill: idempotent, one batch at a time; returns codes added
create or replace function public.invites__refill(p_member uuid) returns integer
language plpgsql security definer set search_path to '' as $$
declare v_n integer := public.invites__allowance(); v_batch integer; v_have integer; v_unused integer; v_tier integer; i integer;
begin
  -- one refill decision per inviter at a time (racing redemptions wait here, then see each other)
  perform 1 from public.members m where m.id = p_member and m.signup_completed_at is not null and not m.is_banned for update;
  if not found or v_n < 1 then return 0; end if;
  select coalesce(max(batch), 1) into v_batch from public.invite_codes where created_by_id = p_member;
  select count(*), count(*) filter (where used_by_id is null and used_at is null)
    into v_have, v_unused from public.invite_codes where created_by_id = p_member and batch = v_batch;
  if v_unused > 0 then return 0; end if;
  if v_have < v_n then
    -- a batch that never had N codes (older setting) is topped up first; that's not a completed batch
    perform public.create_member_invite_codes(p_member);
    return v_n - v_have;
  end if;
  for i in 1..v_n loop
    perform public.invites__new_code(p_member, v_batch + 1);
  end loop;
  perform public.badges__award(p_member, false);
  select b.tier into v_tier from public.member_badges b where b.member_id = p_member and b.badge = 'invite_king';
  perform public.notify__push(p_member, 'invite_refill', 'invites', 'someone', null, 'invite_king:' || coalesce(v_tier, 1), null,
    'member', p_member, null, '/invites', null, 'invite_refill:' || (v_batch + 1));
  return v_n;
end;
$$;
revoke all on function public.invites__refill(uuid) from public, anon, authenticated;

-- in the redeem path: after the code is marked used (runs after badges_/invite_codes_auto_connect/_notify)
create or replace function public.invites__on_used() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.used_by_id is not null and old.used_by_id is null then
    perform public.invites__refill(new.created_by_id);
  end if;
  return null;
exception when others then
  -- never fail a signup over this; the invites page heals it (invites__renew_mine → invites__refill)
  return null;
end;
$$;
drop trigger if exists invite_codes_refill on public.invite_codes;
create trigger invite_codes_refill after update of used_by_id on public.invite_codes
  for each row execute function public.invites__on_used();

-- the old 7-day per-slot renewal is retired
create or replace function public.invites__renew_due(p_member uuid) returns integer
language sql stable set search_path to '' as $$ select 0 $$;
revoke all on function public.invites__renew_due(uuid) from public, anon, authenticated;

-- the invites page: top up + heal a missed refill; returns codes added
create or replace function public.invites__renew_mine() returns integer
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_before integer; v_after integer;
begin
  if v_me is null or not exists (select 1 from public.members m where m.id = v_me and m.signup_completed_at is not null and not m.is_banned) then
    return 0;
  end if;
  select count(*) into v_before from public.invite_codes where created_by_id = v_me;
  perform public.create_member_invite_codes(v_me);
  perform public.invites__refill(v_me);
  select count(*) into v_after from public.invite_codes where created_by_id = v_me;
  return v_after - v_before;
end;
$$;
revoke all on function public.invites__renew_mine() from public, anon;
grant execute on function public.invites__renew_mine() to authenticated;

-- E1: tiered 'invite_king' = batches whose every invitee joined
alter table public.member_badges drop constraint if exists member_badges_badge_check;
alter table public.member_badges add constraint member_badges_badge_check check (badge in ('first_post', 'gallery', 'reviewer', 'inviter', 'liked', 'streak', 'founder', 'agent', 'invite_king'));

create or replace function public.badges__tiers() returns jsonb
language sql immutable set search_path to '' as $$
  select '{"first_post":[1],"gallery":[1,3,10],"reviewer":[1,5,20],"inviter":[1,3],"liked":[5,20,50],"streak":[3,7,30],"founder":[1],"agent":[1],"invite_king":[1,2,3,5,10]}'::jsonb
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
  union all select 'founder', (select case when m.pledge_no between 1 and 100 then m.pledge_no else 0 end from public.members m where m.id = p_member)
  union all select 'agent', (select count(*)::int from public.api_tokens t where t.member_id = p_member and t.first_used_at is not null)
  union all select 'invite_king', (select coalesce(max(i.batch), 1)::int - 1 from public.invite_codes i where i.created_by_id = p_member)
$$;

-- notifications: 'invite_refill' (category 'invites')
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill']));

-- heal: a member whose whole (full-size) batch is already used gets the refill now (one notification);
-- short batches (older setting) are topped up to N.
do $$
declare r record;
begin
  for r in select id from public.members where signup_completed_at is not null and not is_banned loop
    perform public.create_member_invite_codes(r.id);
    perform public.invites__refill(r.id);
  end loop;
end;
$$;
