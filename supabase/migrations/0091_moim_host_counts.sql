-- A38: the host counts as a confirmed attendee (count, capacity, attendee list).
-- Every count already comes from confirmed meetup_rsvps rows, so the host simply gets one:
--   * new meetups: AFTER INSERT trigger seats the host as 'confirmed'
--   * the host's seat can't be cancelled (moim_cancel_rsvp) or removed (moim_decide)
--   * backfill: seat every existing host; if that would overfill a meetup, capacity grows to fit
--     (nobody already confirmed loses their place). Idempotent.

create or replace function public.moim__seat_host() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.meetup_rsvps (meetup_id, member_id, posted_as, nickname_profile_id, status, decided_at)
  values (new.id, new.host_id, coalesce(new.posted_as, 'real'), new.nickname_profile_id, 'confirmed', now())
  on conflict (meetup_id, member_id) do update set status = 'confirmed', decided_at = coalesce(public.meetup_rsvps.decided_at, now()), updated_at = now();
  return null;
end $$;
revoke all on function public.moim__seat_host() from public, anon, authenticated;
drop trigger if exists meetups_seat_host on public.meetups;
create trigger meetups_seat_host after insert on public.meetups for each row execute function public.moim__seat_host();

CREATE OR REPLACE FUNCTION public.moim_cancel_rsvp(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_me UUID := public.app__me(); v_prev TEXT; v_promoted INTEGER := 0;
BEGIN
  PERFORM 1 FROM public.meetups WHERE id = p_id FOR UPDATE;
  -- A38: the host's seat is part of the meetup; hosts cancel the meetup instead
  IF EXISTS (SELECT 1 FROM public.meetups WHERE id = p_id AND host_id = v_me) THEN
    RAISE EXCEPTION 'moim_host_seat' USING ERRCODE = 'P0001';
  END IF;
  SELECT status INTO v_prev FROM public.meetup_rsvps WHERE meetup_id = p_id AND member_id = v_me;
  IF v_prev IS NULL OR v_prev NOT IN ('pending', 'confirmed', 'waitlisted') THEN
    RAISE EXCEPTION 'moim_rsvp_not_found' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.meetup_rsvps SET status = 'cancelled', updated_at = NOW() WHERE meetup_id = p_id AND member_id = v_me;
  IF v_prev = 'confirmed' THEN v_promoted := public.moim__promote(p_id); END IF;
  RETURN jsonb_build_object('status', 'cancelled', 'promoted', v_promoted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.moim_decide(p_rsvp uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app__me();
  r public.meetup_rsvps%ROWTYPE;
  m public.meetups%ROWTYPE;
  v_new TEXT;
  v_promoted INTEGER := 0;
BEGIN
  SELECT * INTO r FROM public.meetup_rsvps WHERE id = p_rsvp;
  IF NOT FOUND OR NOT public.moim__can_manage(r.meetup_id, v_me) THEN RAISE EXCEPTION 'moim_forbidden' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO m FROM public.meetups WHERE id = r.meetup_id FOR UPDATE;
  SELECT * INTO r FROM public.meetup_rsvps WHERE id = p_rsvp FOR UPDATE;
  -- A38: the host's own seat can't be decided on or removed
  IF r.member_id = m.host_id THEN RAISE EXCEPTION 'moim_host_seat' USING ERRCODE = 'P0001'; END IF;
  IF p_action = 'approve' AND r.status IN ('pending', 'waitlisted') THEN
    IF (SELECT count(*) FROM public.meetup_rsvps WHERE meetup_id = m.id AND status = 'confirmed') < m.capacity THEN
      v_new := 'confirmed';
    ELSIF r.status = 'pending' THEN
      v_new := 'waitlisted';
    ELSE
      RAISE EXCEPTION 'moim_full' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_action = 'waitlist' AND r.status = 'pending' THEN v_new := 'waitlisted';
  ELSIF p_action = 'reject' AND r.status IN ('pending', 'waitlisted') THEN v_new := 'rejected';
  ELSIF p_action = 'remove' AND r.status = 'confirmed' THEN v_new := 'rejected';
  ELSE RAISE EXCEPTION 'moim_invalid_action' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.meetup_rsvps SET status = v_new, decided_at = NOW(), updated_at = NOW(),
    waitlisted_at = CASE WHEN v_new = 'waitlisted' THEN NOW() ELSE waitlisted_at END
  WHERE id = p_rsvp;
  IF r.status = 'confirmed' THEN v_promoted := public.moim__promote(m.id); END IF;
  RETURN jsonb_build_object('status', v_new, 'promoted', v_promoted);
END;
$function$;

-- backfill
do $$
declare m record; v_conf int;
begin
  for m in select * from public.meetups loop
    insert into public.meetup_rsvps (meetup_id, member_id, posted_as, nickname_profile_id, status, decided_at, created_at)
    values (m.id, m.host_id, coalesce(m.posted_as, 'real'), m.nickname_profile_id, 'confirmed', m.created_at, m.created_at)
    on conflict (meetup_id, member_id) do update set status = 'confirmed', decided_at = coalesce(public.meetup_rsvps.decided_at, excluded.decided_at), updated_at = now()
      where public.meetup_rsvps.status <> 'confirmed';
    select count(*) into v_conf from public.meetup_rsvps where meetup_id = m.id and status = 'confirmed';
    if v_conf > m.capacity then update public.meetups set capacity = v_conf, updated_at = now() where id = m.id; end if;
  end loop;
end $$;
