-- A53: a connected agent keeps its owner's 모임 calendar (read + remind only).
--  * notification category 'meetups' (invite · confirmed · time/place change · cancelled · D-1 / same-day)
--  * meetup_changes: a small log of schedule/place edits (what changed, when) for agents and calendars
--  * mcp_my_meetups: owner-scoped upcoming 모임 (confirmed / pending / waitlisted / invited) + events since a cursor
--  * meetup_ics_feeds: one private, revocable calendar feed per member (sha256 of the token only)
-- Agents still cannot apply / RSVP (mcp-data AGENT_REFUSED_TOOLS); nothing here writes on the member's behalf.

-- ------------------------------------------------------------------ prefs: new category
alter table public.notification_prefs add column if not exists meetups boolean not null default true;

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category = any (array['replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following', 'badges', 'meetups']));
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['comment', 'reply', 'like', 'follow', 'friend_request', 'friend_accept', 'invite_joined', 'agent_reply', 'agent_like',
    'gallery_recommended', 'gallery_approved', 'gallery_confirmed', 'gallery_rejected', 'follow_post', 'agent_mention', 'mention', 'badge',
    'moim_invite', 'invite_refill', 'reaction',
    'moim_confirmed', 'moim_changed', 'moim_cancelled', 'moim_tomorrow', 'moim_today']));

create or replace function public.notification_prefs_get()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('replies', p.replies, 'likes', p.likes, 'social', p.social, 'invites', p.invites,
      'agents', p.agents, 'gallery', p.gallery, 'following', p.following, 'badges', p.badges, 'meetups', p.meetups)
    from public.notification_prefs p where p.member_id = public.current_member_id()),
    jsonb_build_object('replies', true, 'likes', true, 'social', true, 'invites', true, 'agents', true, 'gallery', true,
      'following', true, 'badges', true, 'meetups', true))
$$;

create or replace function public.notification_prefs_set(p_key text, p_on boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_key not in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following', 'badges', 'meetups') then raise exception 'bad_pref' using errcode = 'P0001'; end if;
  insert into public.notification_prefs(member_id) values (v_me) on conflict (member_id) do nothing;
  execute format('update public.notification_prefs set %I = $1, updated_at = now() where member_id = $2', p_key) using coalesce(p_on, true), v_me;
  return public.notification_prefs_get();
end $$;

-- 모임 invites move from 'social' to the new category
create or replace function public.moim__notify_invite(p_meetup uuid, p_member uuid, p_by uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare m public.meetups%rowtype;
begin
  select * into m from public.meetups where id = p_meetup;
  perform public.notify__push(p_member, 'moim_invite', 'meetups', 'member', p_by, null, null, 'moim', m.id, m.id,
    '/moim/' || m.id, m.title, 'moim_invite:' || m.id);
end $$;

-- ------------------------------------------------------------------ change log
create table if not exists public.meetup_changes (
  id bigint generated always as identity primary key,
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  fields text[] not null,
  changed_at timestamptz not null default now()
);
create index if not exists meetup_changes_meetup_idx on public.meetup_changes(meetup_id, changed_at desc);
alter table public.meetup_changes enable row level security;
revoke all on public.meetup_changes from public, anon, authenticated;

-- people who should hear about a change: anyone holding or waiting for a seat
create or replace function public.moim__notify_change(p_meetup uuid, p_kind text, p_fields text[])
returns void language plpgsql security definer set search_path to '' as $$
declare m public.meetups%rowtype; r record; v_actor uuid := public.current_member_id();
begin
  select * into m from public.meetups where id = p_meetup;
  if not found then return; end if;
  insert into public.meetup_changes(meetup_id, fields) values (p_meetup, p_fields);
  for r in select member_id from public.meetup_rsvps where meetup_id = p_meetup and status in ('confirmed', 'pending', 'waitlisted') loop
    perform public.notify__push(r.member_id, p_kind, 'meetups', 'member', coalesce(v_actor, m.host_id), null, null, 'moim', m.id, m.id,
      '/moim/' || m.id, m.title, p_kind || ':' || m.id || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  end loop;
end $$;

create or replace function public.moim__on_meetup_update() returns trigger
language plpgsql security definer set search_path to '' as $$
declare f text[] := '{}';
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.moim__notify_change(new.id, 'moim_cancelled', array['status']);
    return null;
  end if;
  if new.starts_at is distinct from old.starts_at or new.time_tbd is distinct from old.time_tbd then f := f || array['time']; end if;
  if new.ends_at is distinct from old.ends_at and not ('time' = any(f)) then f := f || array['time']; end if;
  if new.venue_name is distinct from old.venue_name or new.mode is distinct from old.mode then f := f || array['place']; end if;
  if cardinality(f) > 0 and new.status in ('open', 'closed') then
    perform public.moim__notify_change(new.id, 'moim_changed', f);
  end if;
  return null;
exception when others then raise warning 'moim__on_meetup_update: %', sqlerrm; return null;  -- never block the host's edit
end $$;
drop trigger if exists meetups_notify_change on public.meetups;
create trigger meetups_notify_change after update on public.meetups
  for each row execute function public.moim__on_meetup_update();

create or replace function public.moim__on_private_change() returns trigger
language plpgsql security definer set search_path to '' as $$
declare m public.meetups%rowtype;
begin
  if tg_op = 'UPDATE' and new.venue_address is not distinct from old.venue_address
     and new.map_url is not distinct from old.map_url and new.meeting_url is not distinct from old.meeting_url then
    return null;
  end if;
  select * into m from public.meetups where id = new.meetup_id;
  -- the initial save while creating a 모임 is not a "change"
  if not found or m.created_at > now() - interval '5 minutes' or m.status not in ('open', 'closed') then return null; end if;
  perform public.moim__notify_change(new.meetup_id, 'moim_changed', array['place']);
  return null;
exception when others then raise warning 'moim__on_private_change: %', sqlerrm; return null;
end $$;
drop trigger if exists meetup_private_notify_change on public.meetup_private;
create trigger meetup_private_notify_change after insert or update on public.meetup_private
  for each row execute function public.moim__on_private_change();

-- seat confirmed (host approval, waitlist promotion, or instant seat): the member's own action is skipped by notify__push
create or replace function public.moim__on_rsvp_confirmed() returns trigger
language plpgsql security definer set search_path to '' as $$
declare m public.meetups%rowtype;
begin
  if new.status <> 'confirmed' or (tg_op = 'UPDATE' and old.status = 'confirmed') then return null; end if;
  select * into m from public.meetups where id = new.meetup_id;
  if not found or new.member_id = m.host_id then return null; end if;
  perform public.notify__push(new.member_id, 'moim_confirmed', 'meetups', 'member', coalesce(public.current_member_id(), new.member_id), null, null,
    'moim', m.id, m.id, '/moim/' || m.id, m.title, 'moim_confirmed:' || m.id);
  return null;
exception when others then raise warning 'moim__on_rsvp_confirmed: %', sqlerrm; return null;
end $$;
drop trigger if exists meetup_rsvps_notify_confirmed on public.meetup_rsvps;
create trigger meetup_rsvps_notify_confirmed after insert or update of status on public.meetup_rsvps
  for each row execute function public.moim__on_rsvp_confirmed();

-- ------------------------------------------------------------------ reminders (pg_cron, inside the DB)
-- D-1: the KST day before, from 09:00 KST. Same day: from 08:00 KST, or within 3 h of the start.
create or replace function public.moim__remind_run() returns integer
language plpgsql security definer set search_path to '' as $$
declare r record; n integer := 0; v_now timestamptz := now(); v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_hour integer := extract(hour from now() at time zone 'Asia/Seoul');
begin
  for r in
    select m.id, m.title, m.starts_at, x.member_id, (m.starts_at at time zone 'Asia/Seoul')::date as d
    from public.meetups m join public.meetup_rsvps x on x.meetup_id = m.id and x.status = 'confirmed'
    where m.status in ('open', 'closed') and not coalesce(m.time_tbd, false)
      and m.starts_at > v_now and m.starts_at < v_now + interval '40 hours'
  loop
    if r.d = v_today + 1 and v_hour >= 9 then
      perform public.notify__push(r.member_id, 'moim_tomorrow', 'meetups', 'someone', null, null, null, 'moim', r.id, r.id,
        '/moim/' || r.id, r.title, 'moim_reminder:' || r.id || ':d1');
      n := n + 1;
    elsif r.d = v_today and (v_hour >= 8 or r.starts_at < v_now + interval '3 hours') then
      perform public.notify__push(r.member_id, 'moim_today', 'meetups', 'someone', null, null, null, 'moim', r.id, r.id,
        '/moim/' || r.id, r.title, 'moim_reminder:' || r.id || ':d0');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.moim__remind_run(), public.moim__notify_change(uuid, text, text[]),
  public.moim__on_meetup_update(), public.moim__on_private_change(), public.moim__on_rsvp_confirmed() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'moim-reminders';
  perform cron.schedule('moim-reminders', '7,37 * * * *', 'select public.moim__remind_run()');
end $$;

-- ------------------------------------------------------------------ the owner's 모임 (shared by MCP + calendar feed)
-- Rows: 모임 the member hosts, holds/waits for a seat in, or was invited to (no RSVP yet / not declined).
-- p_private adds exact place / link only where the web shows them too (host or confirmed seat).
create or replace function public.moim__mine(p_member uuid, p_from timestamptz, p_private boolean)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(row_json order by starts_at), '[]'::jsonb) from (
    select m.starts_at, jsonb_build_object(
      'id', m.id, 'title', m.title, 'startsAt', m.starts_at, 'endsAt', m.ends_at, 'timeTbd', coalesce(m.time_tbd, false),
      'mode', m.mode, 'venueName', m.venue_name, 'meetupStatus', m.status,
      'my', case when m.host_id = p_member then 'host' when r.status is not null then r.status else 'invited' end,
      'url', '/moim/' || m.id, 'updatedAt', m.updated_at,
      'changes', coalesce((select jsonb_agg(jsonb_build_object('fields', c.fields, 'at', c.changed_at) order by c.changed_at desc)
         from (select * from public.meetup_changes c where c.meetup_id = m.id and c.changed_at > now() - interval '14 days' order by c.changed_at desc limit 5) c), '[]'::jsonb),
      'sequence', (select count(*) from public.meetup_changes c where c.meetup_id = m.id),
      'private', case when p_private and (m.host_id = p_member or r.status = 'confirmed') then
         (select jsonb_build_object('venueAddress', p.venue_address, 'mapUrl', p.map_url, 'meetingUrl', p.meeting_url)
          from public.meetup_private p where p.meetup_id = m.id) end
    ) as row_json
    from public.meetups m
    left join public.meetup_rsvps r on r.meetup_id = m.id and r.member_id = p_member
    where m.starts_at >= p_from
      and (m.host_id = p_member
        or r.status in ('confirmed', 'pending', 'waitlisted')
        or (r.id is null and exists (select 1 from public.moim_invites i where i.meetup_id = m.id and i.member_id = p_member)))
    order by m.starts_at
    limit 100
  ) s
$$;
revoke all on function public.moim__mine(uuid, timestamptz, boolean) from public, anon, authenticated;

-- MCP: upcoming 모임 + what happened since p_since (default: last 7 days) + reminders due now.
create or replace function public.mcp_my_meetups(p_token text, p_since timestamptz default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_since timestamptz := coalesce(p_since, now() - interval '7 days'); v_mine jsonb;
begin
  t := public.api__token(p_token, array['meetups_read', 'meetups_write']);
  v_mine := public.moim__mine(t.member_id, now() - interval '6 hours', false);
  return jsonb_build_object(
    'now', now(),
    'since', v_since,
    'meetups', v_mine,
    'events', coalesce((select jsonb_agg(e order by e->>'at') from (
        select jsonb_build_object('type', 'invited', 'meetupId', i.meetup_id, 'at', i.created_at) e
          from public.moim_invites i where i.member_id = t.member_id and i.created_at > v_since
        union all
        select jsonb_build_object('type', 'confirmed', 'meetupId', r.meetup_id, 'at', coalesce(r.decided_at, r.updated_at))
          from public.meetup_rsvps r join public.meetups m on m.id = r.meetup_id
          where r.member_id = t.member_id and r.status = 'confirmed' and m.host_id <> t.member_id and coalesce(r.decided_at, r.updated_at) > v_since
        union all
        select jsonb_build_object('type', case when 'status' = any(c.fields) then 'cancelled' else 'changed' end, 'meetupId', c.meetup_id, 'fields', c.fields, 'at', c.changed_at)
          from public.meetup_changes c
          where c.changed_at > v_since and exists (select 1 from jsonb_array_elements(v_mine) x where x->>'id' = c.meetup_id::text)
      ) s), '[]'::jsonb),
    'reminders', coalesce((select jsonb_agg(jsonb_build_object('meetupId', x->>'id', 'title', x->>'title', 'startsAt', x->>'startsAt',
          'when', case when ((x->>'startsAt')::timestamptz at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date then 'today' else 'tomorrow' end))
        from jsonb_array_elements(v_mine) x
        where x->>'my' in ('confirmed', 'host') and not (x->>'timeTbd')::boolean and x->>'meetupStatus' in ('open', 'closed')
          and (x->>'startsAt')::timestamptz > now()
          and ((x->>'startsAt')::timestamptz at time zone 'Asia/Seoul')::date <= (now() at time zone 'Asia/Seoul')::date + 1), '[]'::jsonb)
  );
end $$;
revoke all on function public.mcp_my_meetups(text, timestamptz) from public;
grant execute on function public.mcp_my_meetups(text, timestamptz) to anon, authenticated;

-- ------------------------------------------------------------------ private calendar feed
create table if not exists public.meetup_ics_feeds (
  member_id uuid primary key references public.members(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz
);
alter table public.meetup_ics_feeds enable row level security;
revoke all on public.meetup_ics_feeds from public, anon, authenticated;

create or replace function public.moim_ics_feed_status()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('enabled', true, 'prefix', f.token_prefix, 'createdAt', f.created_at, 'lastFetchedAt', f.last_fetched_at)
    from public.meetup_ics_feeds f where f.member_id = public.current_member_id()), jsonb_build_object('enabled', false))
$$;

-- New (or replacement) token: returned once, only the hash is stored. The old link stops working.
create or replace function public.moim_ics_feed_rotate()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.app__me(); v_tok text;
begin
  v_tok := 'cal_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.meetup_ics_feeds(member_id, token_hash, token_prefix)
  values (v_me, encode(extensions.digest(v_tok, 'sha256'), 'hex'), left(v_tok, 10))
  on conflict (member_id) do update set token_hash = excluded.token_hash, token_prefix = excluded.token_prefix, created_at = now(), last_fetched_at = null;
  return jsonb_build_object('token', v_tok, 'status', public.moim_ics_feed_status());
end $$;

create or replace function public.moim_ics_feed_revoke()
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  delete from public.meetup_ics_feeds where member_id = public.app__me();
  return public.moim_ics_feed_status();
end $$;

-- Called by the calendar app (no session): the token is the only credential.
create or replace function public.moim_ics_feed(p_token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare f public.meetup_ics_feeds%rowtype;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into f from public.meetup_ics_feeds where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return null; end if;
  if not exists (select 1 from public.members m where m.id = f.member_id and m.signup_completed_at is not null and not m.is_banned) then return null; end if;
  update public.meetup_ics_feeds set last_fetched_at = now() where member_id = f.member_id
    and (last_fetched_at is null or last_fetched_at < now() - interval '10 minutes');
  return jsonb_build_object('meetups', public.moim__mine(f.member_id, now() - interval '60 days', true));
end $$;

revoke all on function public.moim_ics_feed_status(), public.moim_ics_feed_rotate(), public.moim_ics_feed_revoke(), public.moim_ics_feed(text) from public;
grant execute on function public.moim_ics_feed_status(), public.moim_ics_feed_rotate(), public.moim_ics_feed_revoke() to authenticated;
grant execute on function public.moim_ics_feed(text) to anon, authenticated;
