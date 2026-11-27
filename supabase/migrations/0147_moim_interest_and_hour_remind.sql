-- A125: 관심 RSVP (does not take a seat) and an hour-before reminder for confirmed attendees.
-- Builds on A53 (0101) calendar / ICS / D-1+same-day reminders.

-- ------------------------------------------------------------------ RSVP status
alter table public.meetup_rsvps drop constraint if exists meetup_rsvps_status_check;
alter table public.meetup_rsvps add constraint meetup_rsvps_status_check
  check (status in ('pending', 'confirmed', 'waitlisted', 'rejected', 'cancelled', 'interested'));

-- ------------------------------------------------------------------ notifications kind + agent wake
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','moim_hour','first_post','digest','digest_hot','digest_pick','digest_nudge','question','repost','feedback',
  'article_published','feedback_reply','feedback_approved','feedback_deployed']));

drop trigger if exists notifications_wake_agents on public.notifications;
create trigger notifications_wake_agents after insert on public.notifications
  for each row when (new.kind in ('moim_invite', 'moim_confirmed', 'moim_changed', 'moim_cancelled', 'moim_tomorrow', 'moim_today', 'moim_hour'))
  execute function public.notifications__wake_agents();

-- ------------------------------------------------------------------ json: interested count
create or replace function public.moim__json(m public.meetups, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'title', m.title, 'description', m.description, 'mode', m.mode,
    'venue_name', m.venue_name, 'starts_at', m.starts_at, 'ends_at', m.ends_at, 'time_tbd', m.time_tbd,
    'thread_post_id', m.thread_post_id,
    'capacity', m.capacity, 'apply_deadline', m.apply_deadline,
    'requires_approval', m.requires_approval, 'status', m.status, 'fee_note', m.fee_note,
    'members_only', m.members_only, 'questions', m.questions, 'created_at', m.created_at,
    'host', public.api__author_json(m.host_id, m.posted_as),
    'host_id', case when m.posted_as = 'real' then m.host_id end,
    'group', (select jsonb_build_object('id', g.id, 'slug', g.slug, 'name', g.name, 'emoji', g.emoji)
              from public.groups g where g.id = m.group_id),
    'confirmed', (select count(*) from public.meetup_rsvps r where r.meetup_id = m.id and r.status = 'confirmed'),
    'waitlisted', (select count(*) from public.meetup_rsvps r where r.meetup_id = m.id and r.status = 'waitlisted'),
    'pending', (select count(*) from public.meetup_rsvps r where r.meetup_id = m.id and r.status = 'pending'),
    'interested', (select count(*) from public.meetup_rsvps r where r.meetup_id = m.id and r.status = 'interested'),
    'is_host', m.host_id = p_viewer,
    'can_manage', public.moim__can_manage(m.id, p_viewer),
    'is_group_member', case when m.group_id is null then null else public.group__role(m.group_id, p_viewer) is not null end,
    'my_rsvp', (select jsonb_build_object(
        'id', r.id, 'status', r.status, 'answers', r.answers, 'note', r.note, 'created_at', r.created_at,
        'position', case when r.status = 'waitlisted' then (
            select count(*) + 1 from public.meetup_rsvps w
            where w.meetup_id = m.id and w.status = 'waitlisted'
              and (w.waitlisted_at, w.created_at) < (r.waitlisted_at, r.created_at)) end)
      from public.meetup_rsvps r where r.meetup_id = m.id and r.member_id = p_viewer)
  );
$$;

-- ------------------------------------------------------------------ detail: interested list (same visibility as attendees)
create or replace function public.moim_get(p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_me uuid := public.app__me(); m public.meetups%rowtype; v jsonb; v_manage boolean; v_private boolean; v_people boolean;
begin
  select * into m from public.meetups where id = p_id;
  if not found or (m.group_id is not null and not public.group__visible(m.group_id)) then
    raise exception 'moim_not_found' using errcode = 'P0001';
  end if;
  v_manage := public.moim__can_manage(m.id, v_me);
  v_private := public.moim__can_see_private(m.id, v_me);
  v_people := v_private or (public.is_completed_member()
    and (not m.members_only or m.group_id is null or public.group__role(m.group_id, v_me) is not null));
  v := public.moim__json(m, v_me);
  v := v || jsonb_build_object(
    'private', case when v_private then (
        select jsonb_build_object('venue_address', p.venue_address, 'map_url', p.map_url, 'meeting_url', p.meeting_url)
        from public.meetup_private p where p.meetup_id = m.id) end,
    'attendees', case when v_people then coalesce((
        select jsonb_agg(jsonb_build_object('kind', 'real', 'id', mm.id, 'member_id', mm.id,
                 'name', coalesce('@' || mm.handle, '멤버'), 'handle', mm.handle, 'avatar_url', mm.avatar_url)
               order by r.decided_at nulls last, r.created_at)
        from public.meetup_rsvps r join public.members mm on mm.id = r.member_id
        where r.meetup_id = m.id and r.status = 'confirmed'), '[]'::jsonb) end,
    'interested_people', case when v_people then coalesce((
        select jsonb_agg(jsonb_build_object('kind', 'real', 'id', mm.id, 'member_id', mm.id,
                 'name', coalesce('@' || mm.handle, '멤버'), 'handle', mm.handle, 'avatar_url', mm.avatar_url)
               order by r.updated_at, r.created_at)
        from public.meetup_rsvps r join public.members mm on mm.id = r.member_id
        where r.meetup_id = m.id and r.status = 'interested'), '[]'::jsonb) end,
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'created_at', a.created_at) order by a.created_at desc)
        from public.meetup_announcements a where a.meetup_id = m.id), '[]'::jsonb),
    'applicants', case when v_manage then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'member_id', r.member_id, 'status', r.status, 'answers', r.answers, 'note', r.note,
          'created_at', r.created_at, 'waitlisted_at', r.waitlisted_at,
          'author', jsonb_build_object('kind', 'real', 'id', mm.id, 'name', coalesce('@' || mm.handle, '멤버'),
                     'handle', mm.handle, 'avatar_url', mm.avatar_url))
          order by case r.status when 'pending' then 0 when 'waitlisted' then 1 when 'confirmed' then 2 when 'interested' then 3 else 4 end,
                   r.waitlisted_at nulls last, r.created_at)
        from public.meetup_rsvps r join public.members mm on mm.id = r.member_id where r.meetup_id = m.id), '[]'::jsonb) end
  );
  return v;
end;
$function$;

-- ------------------------------------------------------------------ toggle 관심
create or replace function public.moim_interest(p_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := public.app__me();
  m public.meetups%rowtype;
  v_existing public.meetup_rsvps%rowtype;
  v_has_row boolean;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into m from public.meetups where id = p_id for update;
  if not found or (m.group_id is not null and not public.group__visible(m.group_id)) then
    raise exception 'moim_not_found' using errcode = 'P0001';
  end if;
  if m.status <> 'open' or m.starts_at < now() then raise exception 'moim_closed' using errcode = 'P0001'; end if;
  if m.host_id = v_me then raise exception 'moim_host_cannot_apply' using errcode = 'P0001'; end if;
  if m.members_only and m.group_id is not null and public.group__role(m.group_id, v_me) is null then
    raise exception 'moim_members_only' using errcode = 'P0001';
  end if;

  select * into v_existing from public.meetup_rsvps where meetup_id = p_id and member_id = v_me;
  v_has_row := found;
  if v_has_row and v_existing.status in ('pending', 'confirmed', 'waitlisted') then
    raise exception 'moim_already_applied' using errcode = 'P0001';
  end if;
  if v_has_row and v_existing.status = 'rejected' then raise exception 'moim_rejected' using errcode = 'P0001'; end if;

  -- already interested → cancel
  if v_has_row and v_existing.status = 'interested' then
    update public.meetup_rsvps set status = 'cancelled', updated_at = now() where id = v_existing.id;
    return jsonb_build_object('status', 'cancelled');
  end if;

  if v_has_row then
    update public.meetup_rsvps set status = 'interested', updated_at = now() where id = v_existing.id;
  else
    insert into public.meetup_rsvps (meetup_id, member_id, posted_as, status)
    values (p_id, v_me, 'real', 'interested');
  end if;
  return jsonb_build_object('status', 'interested');
end;
$$;

revoke all on function public.moim_interest(uuid) from public, anon, authenticated;
grant execute on function public.moim_interest(uuid) to authenticated;

-- cancel also works for 관심 (same delete on the apply route)
create or replace function public.moim_cancel_rsvp(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_me uuid := public.app__me(); v_prev text; v_promoted integer := 0;
begin
  perform 1 from public.meetups where id = p_id for update;
  select status into v_prev from public.meetup_rsvps where meetup_id = p_id and member_id = v_me;
  if v_prev is null or v_prev not in ('pending', 'confirmed', 'waitlisted', 'interested') then
    raise exception 'moim_rsvp_not_found' using errcode = 'P0001';
  end if;
  if (select host_id from public.meetups where id = p_id) = v_me then
    raise exception 'moim_host_seat' using errcode = 'P0001';
  end if;
  update public.meetup_rsvps set status = 'cancelled', updated_at = now() where meetup_id = p_id and member_id = v_me;
  if v_prev = 'confirmed' then v_promoted := public.moim__promote(p_id); end if;
  return jsonb_build_object('status', 'cancelled', 'promoted', v_promoted);
end;
$$;

-- ------------------------------------------------------------------ calendar feed: include interested (TENTATIVE; no private place)
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
        or r.status in ('confirmed', 'pending', 'waitlisted', 'interested')
        or (r.id is null and exists (select 1 from public.moim_invites i where i.meetup_id = m.id and i.member_id = p_member)))
    order by m.starts_at
    limit 100
  ) s
$$;
revoke all on function public.moim__mine(uuid, timestamptz, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------------ hour-before reminder (keeps D-1 / same-day; independent ifs + dedupe keys)
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
    end if;
    if r.d = v_today and (v_hour >= 8 or r.starts_at < v_now + interval '3 hours') then
      perform public.notify__push(r.member_id, 'moim_today', 'meetups', 'someone', null, null, null, 'moim', r.id, r.id,
        '/moim/' || r.id, r.title, 'moim_reminder:' || r.id || ':d0');
      n := n + 1;
    end if;
    -- cron is every 30 minutes (:07 / :37); a 45–75 min window always catches ~1 hour before
    if r.starts_at > v_now + interval '45 minutes' and r.starts_at <= v_now + interval '75 minutes' then
      perform public.notify__push(r.member_id, 'moim_hour', 'meetups', 'someone', null, null, null, 'moim', r.id, r.id,
        '/moim/' || r.id, r.title, 'moim_reminder:' || r.id || ':h1');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.moim__json(public.meetups, uuid), public.moim_get(uuid),
  public.moim_interest(uuid), public.moim_cancel_rsvp(uuid), public.moim__mine(uuid, timestamptz, boolean),
  public.moim__remind_run() from public, anon, authenticated;
grant execute on function public.moim_get(uuid) to authenticated;
grant execute on function public.moim_interest(uuid) to authenticated;
grant execute on function public.moim_cancel_rsvp(uuid) to authenticated;
