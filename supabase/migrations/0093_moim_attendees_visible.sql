-- A38 follow-up (Colin: '참여자 명단은 모든 회원이 볼 수 있게 해줘'):
-- the confirmed attendee list is visible to every signed-up member who can see the meetup.
-- Members-only group meetups keep the list to group members (and managers / confirmed attendees).
-- Exact place / links (meetup_private) are unchanged: managers and confirmed attendees only.
CREATE OR REPLACE FUNCTION public.moim_get(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_me UUID := public.app__me(); m public.meetups%ROWTYPE; v JSONB; v_manage BOOLEAN; v_private BOOLEAN;
BEGIN
  SELECT * INTO m FROM public.meetups WHERE id = p_id;
  IF NOT FOUND OR (m.group_id IS NOT NULL AND NOT public.group__visible(m.group_id)) THEN
    RAISE EXCEPTION 'moim_not_found' USING ERRCODE = 'P0001';
  END IF;
  v_manage := public.moim__can_manage(m.id, v_me);
  v_private := public.moim__can_see_private(m.id, v_me);
  v := public.moim__json(m, v_me);
  v := v || jsonb_build_object(
    'private', CASE WHEN v_private THEN (
        SELECT jsonb_build_object('venue_address', p.venue_address, 'map_url', p.map_url, 'meeting_url', p.meeting_url)
        FROM public.meetup_private p WHERE p.meetup_id = m.id) END,
    'attendees', CASE WHEN v_private OR (public.is_completed_member()
        AND (NOT m.members_only OR m.group_id IS NULL OR public.group__role(m.group_id, v_me) IS NOT NULL)) THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('kind', 'real', 'id', mm.id, 'member_id', mm.id,
                 'name', COALESCE('@' || mm.handle, '멤버'), 'handle', mm.handle, 'avatar_url', mm.avatar_url)
               ORDER BY r.decided_at NULLS LAST, r.created_at)
        FROM public.meetup_rsvps r JOIN public.members mm ON mm.id = r.member_id
        WHERE r.meetup_id = m.id AND r.status = 'confirmed'), '[]'::jsonb) END,
    'announcements', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'created_at', a.created_at) ORDER BY a.created_at DESC)
        FROM public.meetup_announcements a WHERE a.meetup_id = m.id), '[]'::jsonb),
    'applicants', CASE WHEN v_manage THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'member_id', r.member_id, 'status', r.status, 'answers', r.answers, 'note', r.note,
          'created_at', r.created_at, 'waitlisted_at', r.waitlisted_at,
          'author', jsonb_build_object('kind', 'real', 'id', mm.id, 'name', COALESCE('@' || mm.handle, '멤버'),
                     'handle', mm.handle, 'avatar_url', mm.avatar_url))
          ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'waitlisted' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END,
                   r.waitlisted_at NULLS LAST, r.created_at)
        FROM public.meetup_rsvps r JOIN public.members mm ON mm.id = r.member_id WHERE r.meetup_id = m.id), '[]'::jsonb) END
  );
  RETURN v;
END;
$function$;
