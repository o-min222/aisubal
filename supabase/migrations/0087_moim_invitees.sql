-- 0087 (A35, Colin 2026-11-23): "모임 수정에서 초대인원을 추가하고 수정할수 있게"
--  * invitees are stored (moim_invites); before this they only existed as notifications (backfilled here).
--  * moim_invite() (create form) records the invitees and notifies only the new ones.
--  * moim_invites_set() (edit form) makes the invitee list exactly the given @handles:
--    new ones get the invite notification (+ push via the notifications trigger);
--    removed ones lose the pending invite and its notification, and are NOT notified;
--    RSVPs (confirmed participants included) are never touched here.
--  * same permission (moim__can_manage) and the same group-membership limit as moim_invite; max 30.

create table if not exists public.moim_invites (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  invited_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (meetup_id, member_id)
);
create index if not exists moim_invites_member_idx on public.moim_invites (member_id);
alter table public.moim_invites enable row level security;
revoke all on public.moim_invites from public, anon, authenticated;

insert into public.moim_invites (meetup_id, member_id, invited_by, created_at)
select n.target_id, n.recipient_id, n.actor_member_id, min(n.created_at)
  from public.notifications n
  join public.meetups m on m.id = n.target_id
 where n.kind = 'moim_invite' and n.target_id is not null
 group by n.target_id, n.recipient_id, n.actor_member_id
on conflict do nothing;

-- valid invitees for a 모임 from @handles (completed, not banned, not me, group members for group 모임)
create or replace function public.moim__invitee_ids(p_meetup uuid, p_me uuid, p_handles text[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct mm.id from public.members mm, public.meetups m
   where m.id = p_meetup and mm.handle is not null
     and lower(mm.handle) = any (select lower(btrim(h, '@ ')) from unnest(coalesce(p_handles, '{}')) h)
     and mm.id <> p_me and mm.signup_completed_at is not null and not mm.is_banned
     and (m.group_id is null or public.group__role(m.group_id, mm.id) is not null)
$$;
revoke all on function public.moim__invitee_ids(uuid, uuid, text[]) from public, anon, authenticated;

create or replace function public.moim__notify_invite(p_meetup uuid, p_member uuid, p_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.meetups%rowtype;
begin
  select * into m from public.meetups where id = p_meetup;
  perform public.notify__push(p_member, 'moim_invite', 'social', 'member', p_by, null, null, 'moim', m.id, m.id,
    '/moim/' || m.id, m.title, 'moim_invite:' || m.id);
end;
$$;
revoke all on function public.moim__notify_invite(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.moim_invite(p_id uuid, p_handles text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.app__me(); v_n integer := 0; r record;
begin
  if not exists (select 1 from public.meetups where id = p_id) or not public.moim__can_manage(p_id, v_me) then raise exception 'moim_forbidden' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_handles, 1), 0) > 30 then raise exception 'moim_too_many_invites' using errcode = 'P0001'; end if;
  for r in select x as id from public.moim__invitee_ids(p_id, v_me, p_handles) x loop
    insert into public.moim_invites (meetup_id, member_id, invited_by) values (p_id, r.id, v_me) on conflict do nothing;
    if found then
      perform public.moim__notify_invite(p_id, r.id, v_me);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.moim_invite(uuid, text[]) from public, anon;
grant execute on function public.moim_invite(uuid, text[]) to authenticated;

create or replace function public.moim_invites_set(p_id uuid, p_handles text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.app__me(); v_added integer := 0; v_removed integer := 0; r record;
begin
  if not exists (select 1 from public.meetups where id = p_id) or not public.moim__can_manage(p_id, v_me) then raise exception 'moim_forbidden' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_handles, 1), 0) > 30 then raise exception 'moim_too_many_invites' using errcode = 'P0001'; end if;
  perform 1 from public.meetups where id = p_id for update; -- one edit at a time per 모임
  -- removed: drop the pending invite and its notification, quietly (RSVPs untouched)
  for r in
    select i.member_id from public.moim_invites i
     where i.meetup_id = p_id and i.member_id not in (select x from public.moim__invitee_ids(p_id, v_me, p_handles) x)
  loop
    delete from public.moim_invites where meetup_id = p_id and member_id = r.member_id;
    delete from public.notifications where recipient_id = r.member_id and kind = 'moim_invite' and target_id = p_id;
    v_removed := v_removed + 1;
  end loop;
  -- added: record + notify (push rides on the notifications trigger)
  for r in select x as id from public.moim__invitee_ids(p_id, v_me, p_handles) x loop
    insert into public.moim_invites (meetup_id, member_id, invited_by) values (p_id, r.id, v_me) on conflict do nothing;
    if found then
      perform public.moim__notify_invite(p_id, r.id, v_me);
      v_added := v_added + 1;
    end if;
  end loop;
  return jsonb_build_object('added', v_added, 'removed', v_removed);
end;
$$;
revoke all on function public.moim_invites_set(uuid, text[]) from public, anon;
grant execute on function public.moim_invites_set(uuid, text[]) to authenticated;

-- the edit form's chips: managers only
create or replace function public.moim_invitees(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := public.app__me();
begin
  if not public.moim__can_manage(p_id, v_me) then raise exception 'moim_forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', mm.id, 'handle', mm.handle, 'name', mm.display_name, 'avatar_url', mm.avatar_url,
      'rsvp', (select r.status from public.meetup_rsvps r where r.meetup_id = p_id and r.member_id = mm.id)) order by i.created_at)
      from public.moim_invites i join public.members mm on mm.id = i.member_id
     where i.meetup_id = p_id and mm.handle is not null), '[]'::jsonb);
end;
$$;
revoke all on function public.moim_invitees(uuid) from public, anon;
grant execute on function public.moim_invitees(uuid) to authenticated;
