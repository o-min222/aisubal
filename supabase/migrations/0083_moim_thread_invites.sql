-- 0083 (A29): 모임 = date + 온/오프 + 지역; the details are discussed in its comment thread,
-- and the host can @-invite people when opening it.
--  * description becomes optional; time can be left open (time_tbd: date only, stored 23:59 KST)
--  * every new 모임 opens a thread post (group 모임: inside the group) — meetups.thread_post_id
--  * moim_invite(): host/manager notifies up to 30 @handles (prefs, bans, push via notify__push);
--    a group 모임 only invites members of that group, so nobody is pointed at a page they can't open
-- No columns dropped; prod had 0 모임 when this was written.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite']));
alter table public.notifications drop constraint if exists notifications_target_kind_check;
alter table public.notifications add constraint notifications_target_kind_check check (target_kind = any (array[
  'post','agora','anon','member','submission','moim']));

alter table public.meetups add column if not exists thread_post_id uuid references public.posts(id) on delete set null;
alter table public.meetups add column if not exists time_tbd boolean not null default false;
grant select (thread_post_id, time_tbd) on public.meetups to authenticated;

create or replace function public.moim__validate(p jsonb, out v_title text, out v_desc text, out v_mode text, out v_starts timestamptz, out v_ends timestamptz, out v_deadline timestamptz, out v_capacity integer)
returns record language plpgsql stable set search_path = '' as $$
begin
  v_title := btrim(coalesce(p->>'title', ''));
  v_desc := btrim(coalesce(p->>'description', ''));
  v_mode := coalesce(p->>'mode', 'offline');
  if char_length(v_title) not between 2 and 80 then raise exception 'moim_invalid_title' using errcode = 'P0001'; end if;
  if char_length(v_desc) > 4000 then raise exception 'moim_invalid_description' using errcode = 'P0001'; end if;
  if v_mode not in ('offline', 'online') then raise exception 'moim_invalid_mode' using errcode = 'P0001'; end if;
  begin
    v_starts := (p->>'starts_at')::timestamptz;
    v_ends := nullif(p->>'ends_at', '')::timestamptz;
    v_deadline := nullif(p->>'apply_deadline', '')::timestamptz;
    v_capacity := coalesce(nullif(p->>'capacity', '')::int, 30);
  exception when others then raise exception 'moim_invalid_time' using errcode = 'P0001';
  end;
  if v_starts is null then raise exception 'moim_invalid_time' using errcode = 'P0001'; end if;
  if v_ends is not null and v_ends <= v_starts then raise exception 'moim_invalid_time' using errcode = 'P0001'; end if;
  if v_deadline is not null and v_deadline > v_starts then raise exception 'moim_invalid_deadline' using errcode = 'P0001'; end if;
  if v_capacity not between 1 and 500 then raise exception 'moim_invalid_capacity' using errcode = 'P0001'; end if;
  if coalesce(p->>'map_url', '') <> '' and p->>'map_url' !~* '^https?://' then raise exception 'moim_invalid_url' using errcode = 'P0001'; end if;
  if coalesce(p->>'meeting_url', '') <> '' and p->>'meeting_url' !~* '^https?://' then raise exception 'moim_invalid_url' using errcode = 'P0001'; end if;
end;
$$;

/** The thread post's text: what / when / where in one glance; everything else happens in the comments. */
create or replace function public.moim__thread_content(m public.meetups) returns text
language sql stable set search_path = '' as $$
  select left(
    '[모임] ' || m.title || E'\n'
    || '📅 ' || to_char(m.starts_at at time zone 'Asia/Seoul', case when m.time_tbd then 'YYYY. FMMM. FMDD.' else 'YYYY. FMMM. FMDD. HH24:MI' end)
    || ' · ' || case m.mode when 'online' then '온라인' else '오프라인' end
    || coalesce(' · ' || nullif(m.venue_name, ''), '')
    || coalesce(E'\n\n' || nullif(m.description, ''), '')
    || E'\n\n' || '자세한 이야기는 댓글로 나눠요.', 6000);
$$;
revoke all on function public.moim__thread_content(public.meetups) from public, anon, authenticated;

create or replace function public.moim_create(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.app__me();
  v record;
  v_group uuid := nullif(p->>'group_id', '')::uuid;
  v_id uuid;
  v_post uuid;
  m public.meetups%rowtype;
begin
  select * into v from public.moim__validate(p);
  if v.v_starts < now() then raise exception 'moim_invalid_time' using errcode = 'P0001'; end if;
  if v_group is not null and coalesce(public.group__role(v_group, v_me), '') not in ('owner', 'mod') then
    raise exception 'moim_group_forbidden' using errcode = 'P0001';
  end if;
  if (select count(*) from public.meetups x where x.host_id = v_me and x.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'moim_daily_limit' using errcode = 'P0001';
  end if;
  insert into public.meetups (title, description, mode, venue_name, starts_at, ends_at, capacity, apply_deadline,
    requires_approval, fee_note, host_id, posted_as, status, group_id, members_only, questions, time_tbd)
  values (v.v_title, v.v_desc, v.v_mode, nullif(left(btrim(coalesce(p->>'venue_name', '')), 120), ''),
    v.v_starts, v.v_ends, v.v_capacity, v.v_deadline,
    coalesce((p->>'requires_approval')::boolean, false),
    nullif(left(btrim(coalesce(p->>'fee_note', '')), 200), ''), v_me, 'real', 'open', v_group,
    v_group is not null and coalesce((p->>'members_only')::boolean, false),
    public.moim__questions(p->'questions'), coalesce((p->>'time_tbd')::boolean, false))
  returning * into m;
  v_id := m.id;
  insert into public.meetup_private (meetup_id, venue_address, map_url, meeting_url)
  values (v_id, nullif(left(btrim(coalesce(p->>'venue_address', '')), 300), ''),
          nullif(left(btrim(coalesce(p->>'map_url', '')), 500), ''),
          nullif(left(btrim(coalesce(p->>'meeting_url', '')), 500), ''));
  -- the thread where the details get discussed (humans only, like every group post)
  insert into public.posts (title, content, author_id, posted_as, group_id, agent_interaction)
  values ('', public.moim__thread_content(m), v_me, 'real', v_group, 'humans_only')
  returning id into v_post;
  update public.meetups set thread_post_id = v_post where id = v_id;
  return v_id;
end;
$$;

create or replace function public.moim_update(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.app__me(); v record; m public.meetups%rowtype; v_confirmed integer; v_starts timestamptz;
begin
  select * into m from public.meetups where id = p_id for update;
  if not found or not public.moim__can_manage(p_id, v_me) then raise exception 'moim_forbidden' using errcode = 'P0001'; end if;
  -- the minimal form doesn't send the advanced fields: keep what's stored (when it still fits the new time)
  begin v_starts := (p->>'starts_at')::timestamptz; exception when others then v_starts := null; end;
  if not p ? 'capacity' then p := p || jsonb_build_object('capacity', m.capacity); end if;
  if not p ? 'ends_at' and m.ends_at > v_starts then p := p || jsonb_build_object('ends_at', m.ends_at); end if;
  if not p ? 'apply_deadline' and m.apply_deadline <= v_starts then p := p || jsonb_build_object('apply_deadline', m.apply_deadline); end if;
  if not p ? 'description' then p := p || jsonb_build_object('description', m.description); end if;
  select * into v from public.moim__validate(p);
  select count(*) into v_confirmed from public.meetup_rsvps where meetup_id = p_id and status = 'confirmed';
  if v.v_capacity < v_confirmed then raise exception 'moim_capacity_below_confirmed' using errcode = 'P0001'; end if;
  update public.meetups set title = v.v_title, description = v.v_desc, mode = v.v_mode,
    venue_name = nullif(left(btrim(coalesce(p->>'venue_name', '')), 120), ''),
    starts_at = v.v_starts, ends_at = v.v_ends, capacity = v.v_capacity, apply_deadline = v.v_deadline,
    requires_approval = coalesce((p->>'requires_approval')::boolean, m.requires_approval),
    fee_note = case when p ? 'fee_note' then nullif(left(btrim(coalesce(p->>'fee_note', '')), 200), '') else m.fee_note end,
    members_only = m.group_id is not null and coalesce((p->>'members_only')::boolean, m.members_only),
    questions = case when p ? 'questions' then public.moim__questions(p->'questions') else m.questions end,
    time_tbd = coalesce((p->>'time_tbd')::boolean, m.time_tbd),
    updated_at = now()
  where id = p_id
  returning * into m;
  insert into public.meetup_private (meetup_id, venue_address, map_url, meeting_url, updated_at)
  values (p_id, nullif(left(btrim(coalesce(p->>'venue_address', '')), 300), ''),
          nullif(left(btrim(coalesce(p->>'map_url', '')), 500), ''),
          nullif(left(btrim(coalesce(p->>'meeting_url', '')), 500), ''), now())
  on conflict (meetup_id) do update set
    venue_address = case when p ? 'venue_address' then excluded.venue_address else public.meetup_private.venue_address end,
    map_url = case when p ? 'map_url' then excluded.map_url else public.meetup_private.map_url end,
    meeting_url = case when p ? 'meeting_url' then excluded.meeting_url else public.meetup_private.meeting_url end,
    updated_at = now();
  -- keep the thread's summary line in step with the edit
  if m.thread_post_id is not null then
    update public.posts set content = public.moim__thread_content(m), updated_at = now() where id = m.thread_post_id;
  end if;
  perform public.moim__promote(p_id);
  return public.moim_get(p_id);
end;
$$;

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

create or replace function public.moim_invite(p_id uuid, p_handles text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.app__me(); m public.meetups%rowtype; v_n integer := 0; r record;
begin
  select * into m from public.meetups where id = p_id;
  if not found or not public.moim__can_manage(p_id, v_me) then raise exception 'moim_forbidden' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_handles, 1), 0) > 30 then raise exception 'moim_too_many_invites' using errcode = 'P0001'; end if;
  for r in
    select distinct mm.id from public.members mm
     where mm.handle is not null
       and lower(mm.handle) = any (select lower(btrim(h, '@ ')) from unnest(coalesce(p_handles, '{}')) h)
       and mm.id <> v_me and mm.signup_completed_at is not null and not mm.is_banned
       and (m.group_id is null or public.group__role(m.group_id, mm.id) is not null)
  loop
    perform public.notify__push(r.id, 'moim_invite', 'social', 'member', v_me, null, null, 'moim', m.id, m.id,
      '/moim/' || m.id, m.title, 'moim_invite:' || m.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.moim_invite(uuid, text[]) from public, anon;
grant execute on function public.moim_invite(uuid, text[]) to authenticated;
