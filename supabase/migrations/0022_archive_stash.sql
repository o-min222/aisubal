-- 0022: 아카이브 = a simple personal stash. Things a member found good or wants
-- to check later, from anywhere on the site (or any URL), with a memo and tags,
-- ready to hand to their AI. Replaces the unused 'second brain' tables (all empty).
-- Owner-only RLS; agents reach it only through token-verified RPCs (archive:read
-- / archive:write) and never see anonymous-board items.

-- ---------------------------------------------------------------- cleanup
DROP FUNCTION IF EXISTS public.mcp_archive_list(TEXT, TEXT, TEXT, TEXT, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.mcp_archive_get(TEXT, UUID);
DROP FUNCTION IF EXISTS public.mcp_collections(TEXT);
DROP FUNCTION IF EXISTS public.mcp_collection_get(TEXT, UUID);
DROP FUNCTION IF EXISTS public.mcp_archive_save_post(TEXT, UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.archive__item_json(public.brain_archive_items);
DROP TABLE IF EXISTS public.archive_highlights CASCADE;
DROP TABLE IF EXISTS public.brain_archive_collection_items CASCADE;
DROP TABLE IF EXISTS public.brain_archive_items CASCADE;
DROP TABLE IF EXISTS public.archive_collections CASCADE;
DROP TABLE IF EXISTS public.archive_items CASCADE;
DROP TABLE IF EXISTS public.archive_folders CASCADE;

-- ---------------------------------------------------------------- tables
CREATE TABLE public.archive_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('post', 'agora', 'tool', 'anon', 'group', 'moim', 'member', 'link')),
  ref text NOT NULL CHECK (char_length(ref) BETWEEN 1 AND 2048),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  excerpt text NOT NULL DEFAULT '' CHECK (char_length(excerpt) <= 4000),
  source_url text CHECK (source_url IS NULL OR char_length(source_url) <= 2048),
  author_label text CHECK (author_label IS NULL OR char_length(author_label) <= 120),
  author_kind text CHECK (author_kind IS NULL OR author_kind IN ('member', 'agent', 'anon', 'site')),
  image_url text CHECK (image_url IS NULL OR char_length(image_url) <= 2048),
  memo text NOT NULL DEFAULT '' CHECK (char_length(memo) <= 500),
  tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 10),
  is_private boolean NOT NULL DEFAULT true,
  source_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, kind, ref)
);
CREATE INDEX archive_entries_owner_created ON public.archive_entries (owner_id, created_at DESC);
CREATE INDEX archive_entries_tags ON public.archive_entries USING gin (tags);
CREATE INDEX archive_entries_kind_ref ON public.archive_entries (kind, ref);

ALTER TABLE public.archive_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_entries_select ON public.archive_entries FOR SELECT TO authenticated USING (owner_id = public.current_member_id());
CREATE POLICY archive_entries_update ON public.archive_entries FOR UPDATE TO authenticated
  USING (owner_id = public.current_member_id()) WITH CHECK (owner_id = public.current_member_id());
CREATE POLICY archive_entries_delete ON public.archive_entries FOR DELETE TO authenticated USING (owner_id = public.current_member_id());
-- inserts go through archive_add (server-side resolution of the saved thing)
REVOKE ALL ON public.archive_entries FROM anon;
GRANT SELECT, DELETE ON public.archive_entries TO authenticated;
GRANT UPDATE (memo, tags, updated_at) ON public.archive_entries TO authenticated;

-- A bundle = a stable, unguessable link to a selection, readable by anyone who
-- has it (so the member can hand it to an AI). Never includes anon items.
CREATE TABLE public.archive_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (char_length(token) >= 24),
  item_ids uuid[] NOT NULL CHECK (cardinality(item_ids) BETWEEN 1 AND 50),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX archive_bundles_owner ON public.archive_bundles (owner_id);
ALTER TABLE public.archive_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_bundles_select ON public.archive_bundles FOR SELECT TO authenticated USING (owner_id = public.current_member_id());
CREATE POLICY archive_bundles_delete ON public.archive_bundles FOR DELETE TO authenticated USING (owner_id = public.current_member_id());
REVOKE ALL ON public.archive_bundles FROM anon;
GRANT SELECT, DELETE ON public.archive_bundles TO authenticated;

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION public.archive__clean_tags(p_tags text[])
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT t ORDER BY t) FILTER (WHERE t <> ''), '{}')
    FROM (SELECT left(lower(regexp_replace(btrim(x), '^#|\s+', '', 'g')), 24) AS t FROM unnest(COALESCE(p_tags, '{}')) x LIMIT 10) s
$$;

CREATE OR REPLACE FUNCTION public.archive__json(e public.archive_entries)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT jsonb_build_object('id', e.id, 'kind', e.kind, 'ref', e.ref, 'title', e.title, 'excerpt', e.excerpt,
    'sourceUrl', e.source_url, 'authorLabel', e.author_label, 'authorKind', e.author_kind, 'imageUrl', e.image_url,
    'memo', e.memo, 'tags', to_jsonb(e.tags), 'sourceCreatedAt', e.source_created_at, 'createdAt', e.created_at, 'updatedAt', e.updated_at)
$$;

-- What a saved thing is, resolved from the source (never trusted from the client).
-- Link title/excerpt/image come from the server's own preview fetch.
CREATE OR REPLACE FUNCTION public.archive__resolve(p_member uuid, p_kind text, p_ref text, p_title text, p_excerpt text, p_image text, p_for_agent boolean)
RETURNS TABLE (ref text, title text, excerpt text, source_url text, author_label text, author_kind text, image_url text, source_created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
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
      SELECT t.id::text, t.name, left(concat_ws(E'\n\n', t.one_liner, t.description), 4000), '/tools/' || t.id::text, NULL::text, 'site', t.icon_url, t.created_at
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
$$;
REVOKE ALL ON FUNCTION public.archive__resolve(uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.archive__upsert(p_member uuid, p_kind text, p_ref text, p_title text, p_excerpt text, p_image text, p_memo text, p_tags text[], p_for_agent boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  r record;
  e public.archive_entries;
  v_created boolean;
BEGIN
  SELECT * INTO r FROM public.archive__resolve(p_member, p_kind, p_ref, p_title, p_excerpt, p_image, p_for_agent) LIMIT 1;
  IF r.ref IS NULL THEN RAISE EXCEPTION 'archive_not_found' USING ERRCODE = 'P0001'; END IF;
  v_created := NOT EXISTS (SELECT 1 FROM public.archive_entries x WHERE x.owner_id = p_member AND x.kind = p_kind AND x.ref = r.ref);
  IF v_created AND (SELECT count(*) FROM public.archive_entries x WHERE x.owner_id = p_member) >= 5000 THEN
    RAISE EXCEPTION 'archive_full' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.archive_entries AS a (owner_id, kind, ref, title, excerpt, source_url, author_label, author_kind, image_url, memo, tags, source_created_at)
  VALUES (p_member, p_kind, r.ref, r.title, r.excerpt, r.source_url, r.author_label, r.author_kind, r.image_url,
          left(COALESCE(p_memo, ''), 500), public.archive__clean_tags(p_tags), r.source_created_at)
  ON CONFLICT (owner_id, kind, ref) DO UPDATE
     SET title = EXCLUDED.title, excerpt = EXCLUDED.excerpt, source_url = EXCLUDED.source_url, author_label = EXCLUDED.author_label,
         image_url = EXCLUDED.image_url,
         memo = CASE WHEN p_memo IS NULL THEN a.memo ELSE EXCLUDED.memo END,
         tags = CASE WHEN p_tags IS NULL THEN a.tags ELSE EXCLUDED.tags END,
         updated_at = now()
  RETURNING * INTO e;
  RETURN public.archive__json(e) || jsonb_build_object('created', v_created);
END;
$$;
REVOKE ALL ON FUNCTION public.archive__upsert(uuid, text, text, text, text, text, text, text[], boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- web (session)
CREATE OR REPLACE FUNCTION public.archive_add(p_kind text, p_ref text, p_title text DEFAULT NULL, p_excerpt text DEFAULT NULL, p_image text DEFAULT NULL, p_memo text DEFAULT NULL, p_tags text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN public.archive__upsert(public.app__me(), p_kind, p_ref, p_title, p_excerpt, p_image, p_memo, p_tags, false);
END;
$$;
REVOKE ALL ON FUNCTION public.archive_add(text, text, text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_add(text, text, text, text, text, text, text[]) TO authenticated;

-- 'n people saved this' without exposing who
CREATE OR REPLACE FUNCTION public.archive_save_counts(p_kind text, p_refs text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_object_agg(ref, n), '{}') FROM (
    SELECT e.ref, count(*) AS n FROM public.archive_entries e
     WHERE e.kind = p_kind AND e.ref = ANY (p_refs[1:200]) GROUP BY e.ref) s
$$;
REVOKE ALL ON FUNCTION public.archive_save_counts(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_save_counts(text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_bundle_create(p_ids uuid[], p_token text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := public.app__me();
  v_ids uuid[];
  v_existing text;
BEGIN
  SELECT array_agg(e.id ORDER BY e.created_at DESC) INTO v_ids
    FROM public.archive_entries e WHERE e.owner_id = v_me AND e.id = ANY (p_ids[1:50]) AND e.kind <> 'anon';
  IF v_ids IS NULL THEN RAISE EXCEPTION 'archive_bundle_empty' USING ERRCODE = 'P0001'; END IF;
  -- same selection → same link (stable)
  SELECT b.token INTO v_existing FROM public.archive_bundles b
   WHERE b.owner_id = v_me AND b.item_ids @> v_ids AND b.item_ids <@ v_ids LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO public.archive_bundles (owner_id, token, item_ids) VALUES (v_me, p_token, v_ids);
  RETURN p_token;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_bundle_create(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_bundle_create(uuid[], text) TO authenticated;

-- Public read of a bundle by its unguessable token (anon items never included).
CREATE OR REPLACE FUNCTION public.archive_bundle_public(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object('createdAt', b.created_at, 'owner', COALESCE('@' || m.handle, m.display_name),
           'items', COALESCE((SELECT jsonb_agg(public.archive__json(e) ORDER BY e.created_at DESC)
                               FROM public.archive_entries e WHERE e.id = ANY (b.item_ids) AND e.owner_id = b.owner_id AND e.kind <> 'anon'), '[]'))
    FROM public.archive_bundles b JOIN public.members m ON m.id = b.owner_id
   WHERE p_token IS NOT NULL AND char_length(p_token) >= 24 AND b.token = p_token
$$;
REVOKE ALL ON FUNCTION public.archive_bundle_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_bundle_public(text) TO anon, authenticated;

-- ---------------------------------------------------------------- MCP (token)
CREATE OR REPLACE FUNCTION public.mcp_archive_list(p_token text, p_query text DEFAULT NULL, p_kind text DEFAULT NULL, p_tag text DEFAULT NULL, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  t public.api_tokens;
  v_q text := NULLIF(btrim(COALESCE(p_query, '')), '');
BEGIN
  t := public.api__token(p_token, ARRAY['archive:read', 'archive:write', 'archive_read', 'archive_write']);
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM public.archive_entries e WHERE e.owner_id = t.member_id AND e.kind <> 'anon'
                AND (p_kind IS NULL OR e.kind = p_kind) AND (p_tag IS NULL OR lower(p_tag) = ANY (e.tags))
                AND (v_q IS NULL OR e.title ILIKE '%' || v_q || '%' OR e.excerpt ILIKE '%' || v_q || '%' OR e.memo ILIKE '%' || v_q || '%')),
    'items', COALESCE((SELECT jsonb_agg(public.archive__json(e) ORDER BY e.created_at DESC) FROM (
      SELECT * FROM public.archive_entries e WHERE e.owner_id = t.member_id AND e.kind <> 'anon'
         AND (p_kind IS NULL OR e.kind = p_kind) AND (p_tag IS NULL OR lower(p_tag) = ANY (e.tags))
         AND (v_q IS NULL OR e.title ILIKE '%' || v_q || '%' OR e.excerpt ILIKE '%' || v_q || '%' OR e.memo ILIKE '%' || v_q || '%')
       ORDER BY e.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50) OFFSET GREATEST(COALESCE(p_offset, 0), 0)) e), '[]'));
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_archive_get(p_token text, p_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  t public.api_tokens;
  e public.archive_entries;
BEGIN
  t := public.api__token(p_token, ARRAY['archive:read', 'archive:write', 'archive_read', 'archive_write']);
  SELECT * INTO e FROM public.archive_entries x WHERE x.id = p_id AND x.owner_id = t.member_id AND x.kind <> 'anon';
  IF e.id IS NULL THEN RAISE EXCEPTION 'archive_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN public.archive__json(e);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_archive_add(p_token text, p_kind text, p_ref text, p_title text DEFAULT NULL, p_excerpt text DEFAULT NULL, p_image text DEFAULT NULL, p_memo text DEFAULT NULL, p_tags text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  t public.api_tokens;
BEGIN
  t := public.api__token(p_token, ARRAY['archive:write', 'archive_write']);
  RETURN public.archive__upsert(t.member_id, p_kind, p_ref, p_title, p_excerpt, p_image, p_memo, p_tags, true);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_archive_list(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mcp_archive_get(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mcp_archive_add(text, text, text, text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_archive_list(text, text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_archive_get(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_archive_add(text, text, text, text, text, text, text, text[]) TO anon, authenticated;
