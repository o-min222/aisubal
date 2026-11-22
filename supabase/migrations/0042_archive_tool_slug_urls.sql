-- N-6: archived gallery tools link to the canonical /gallery/<slug> (was the legacy
-- /tools/<uuid>), and existing entries are rewritten to match.
CREATE OR REPLACE FUNCTION public.archive__resolve(p_member uuid, p_kind text, p_ref text, p_title text, p_excerpt text, p_image text, p_for_agent boolean)
 RETURNS TABLE(ref text, title text, excerpt text, source_url text, author_label text, author_kind text, image_url text, source_created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uuid uuid;
BEGIN
  IF p_kind IN ('post', 'agora', 'anon', 'moim') THEN
    BEGIN v_uuid := p_ref::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION 'archive_not_found' USING ERRCODE = 'P0001'; END;
  END IF;
  IF p_kind = 'post' THEN
    RETURN QUERY
      SELECT p.id::text, left(COALESCE(NULLIF(btrim(p.title), ''), NULLIF(btrim(p.link_title), ''), left(p.content, 80)), 300),
             left(concat_ws(E'\n\n', NULLIF(p.content, ''), NULLIF(p.link_description, '')), 4000),
             '/posts/' || COALESCE(p.root_id, p.id)::text,
             CASE WHEN p.author_kind = 'agent' THEN COALESCE(p.agent_name, 'AI')
                  WHEN p.posted_as = 'nickname' THEN m.nickname
                  ELSE COALESCE('@' || m.handle, m.display_name) END,
             CASE WHEN p.author_kind = 'agent' THEN 'agent' ELSE 'member' END,
             p.link_image, p.created_at
        FROM public.posts p JOIN public.members m ON m.id = p.author_id
       WHERE p.id = v_uuid AND p.is_hidden = false
         AND (p.group_id IS NULL OR (NOT p_for_agent AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = p.group_id AND gm.member_id = p_member AND gm.status = 'active')));
  ELSIF p_kind = 'agora' THEN
    RETURN QUERY
      SELECT a.id::text, left(COALESCE(NULLIF(btrim(a.tool_name), '') || ' · ', '') || left(a.body, 80), 300), left(a.body, 4000),
             '/agora/' || COALESCE(a.root_id, a.id)::text, a.agent_name, 'agent', a.image_url, a.created_at
        FROM public.agora_posts a WHERE a.id = v_uuid AND a.is_hidden = false;
  ELSIF p_kind = 'anon' THEN
    IF p_for_agent THEN RAISE EXCEPTION 'archive_anon_agent' USING ERRCODE = 'P0001'; END IF;
    RETURN QUERY
      SELECT a.id::text, left(a.body, 80), left(a.body, 4000), '/anon/' || COALESCE(a.root_id, a.id)::text, NULL::text, 'anon', NULL::text, a.created_at
        FROM public.anon_posts a WHERE a.id = v_uuid AND a.is_hidden = false AND a.is_deleted = false;
  ELSIF p_kind = 'tool' THEN
    RETURN QUERY
      SELECT t.id::text, t.name, left(concat_ws(E'\n\n', t.one_liner, t.description), 4000), '/gallery/' || COALESCE(NULLIF(t.slug, ''), t.id::text), NULL::text, 'site', t.icon_url, t.created_at
        FROM public.toolbox_entries t WHERE t.id::text = p_ref OR t.slug = p_ref LIMIT 1;
  ELSIF p_kind = 'group' THEN
    RETURN QUERY
      SELECT g.slug, g.name, left(COALESCE(g.description, ''), 4000), '/groups/' || g.slug, NULL::text, 'site', NULL::text, g.created_at
        FROM public.groups g WHERE g.slug = p_ref AND g.is_hidden = false;
  ELSIF p_kind = 'moim' THEN
    RETURN QUERY
      SELECT mt.id::text, mt.title, left(COALESCE(mt.description, ''), 4000), '/moim/' || mt.id::text,
             CASE WHEN mt.posted_as = 'nickname' THEN h.nickname ELSE COALESCE('@' || h.handle, h.display_name) END, 'member', NULL::text, mt.starts_at
        FROM public.meetups mt JOIN public.members h ON h.id = mt.host_id WHERE mt.id = v_uuid;
  ELSIF p_kind = 'member' THEN
    RETURN QUERY
      SELECT m.id::text, m.display_name, left(COALESCE(m.bio, ''), 4000), '/members/' || m.id::text, COALESCE('@' || m.handle, m.display_name), 'member', m.avatar_url, NULL::timestamptz
        FROM public.members m WHERE (m.id::text = p_ref OR m.handle = lower(ltrim(p_ref, '@'))) AND m.signup_completed_at IS NOT NULL AND m.is_banned = false LIMIT 1;
  ELSIF p_kind = 'link' THEN
    IF p_ref !~* '^https?://[^\s]+$' THEN RAISE EXCEPTION 'archive_bad_url' USING ERRCODE = 'P0001'; END IF;
    RETURN QUERY SELECT p_ref, left(COALESCE(NULLIF(btrim(p_title), ''), p_ref), 300), left(COALESCE(p_excerpt, ''), 4000), p_ref, NULL::text, 'site', p_image, NULL::timestamptz;
  ELSE
    RAISE EXCEPTION 'archive_bad_kind' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

UPDATE public.archive_entries a
   SET source_url = '/gallery/' || COALESCE(NULLIF(t.slug, ''), t.id::text)
  FROM public.toolbox_entries t
 WHERE a.kind = 'tool' AND a.ref = t.id::text
   AND a.source_url IS DISTINCT FROM '/gallery/' || COALESCE(NULLIF(t.slug, ''), t.id::text);
