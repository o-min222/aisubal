-- Archive simplification: no web bundles/links (AI use is MCP/CLI only), and a
-- short stable per-owner reference for each entry: #A1, #A2, … (never reused).

DROP FUNCTION IF EXISTS public.archive_bundle_create(uuid[], text);
DROP FUNCTION IF EXISTS public.archive_bundle_public(text);
DROP TABLE IF EXISTS public.archive_bundles;

-- per-owner counter: numbers only go up, deleting an entry never frees its number
CREATE TABLE IF NOT EXISTS public.archive_counters (
  owner_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  last_no integer NOT NULL DEFAULT 0
);
ALTER TABLE public.archive_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.archive_counters FROM PUBLIC, anon, authenticated;

ALTER TABLE public.archive_entries ADD COLUMN IF NOT EXISTS ref_no integer;

-- backfill in save order
WITH n AS (SELECT id, row_number() OVER (PARTITION BY owner_id ORDER BY created_at, id) rn FROM public.archive_entries WHERE ref_no IS NULL)
UPDATE public.archive_entries e SET ref_no = n.rn FROM n WHERE n.id = e.id;
INSERT INTO public.archive_counters (owner_id, last_no)
  SELECT owner_id, max(ref_no) FROM public.archive_entries GROUP BY owner_id
  ON CONFLICT (owner_id) DO UPDATE SET last_no = GREATEST(public.archive_counters.last_no, EXCLUDED.last_no);

CREATE UNIQUE INDEX IF NOT EXISTS archive_entries_owner_ref_no ON public.archive_entries (owner_id, ref_no);

-- Assign the next number on a real insert (a re-save hits ON CONFLICT and keeps its number).
CREATE OR REPLACE FUNCTION public.archive__assign_ref_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.ref_no IS NOT NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.archive_entries x WHERE x.owner_id = NEW.owner_id AND x.kind = NEW.kind AND x.ref = NEW.ref) THEN
    RETURN NEW; -- upsert of an existing row: the DO UPDATE branch runs, no number consumed
  END IF;
  INSERT INTO public.archive_counters AS c (owner_id, last_no) VALUES (NEW.owner_id, 1)
    ON CONFLICT (owner_id) DO UPDATE SET last_no = c.last_no + 1
    RETURNING c.last_no INTO NEW.ref_no;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.archive__assign_ref_no() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS archive_entries_ref_no ON public.archive_entries;
CREATE TRIGGER archive_entries_ref_no BEFORE INSERT ON public.archive_entries
  FOR EACH ROW EXECUTE FUNCTION public.archive__assign_ref_no();

CREATE OR REPLACE FUNCTION public.archive__json(e public.archive_entries)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT jsonb_build_object('id', e.id, 'refNo', e.ref_no, 'kind', e.kind, 'ref', e.ref, 'title', e.title, 'excerpt', e.excerpt,
    'sourceUrl', e.source_url, 'authorLabel', e.author_label, 'authorKind', e.author_kind, 'imageUrl', e.image_url,
    'memo', e.memo, 'tags', to_jsonb(e.tags), 'sourceCreatedAt', e.source_created_at, 'createdAt', e.created_at, 'updatedAt', e.updated_at)
$$;

-- archive_get by reference number (A12 / #A12); anon-board items stay invisible to agents.
CREATE OR REPLACE FUNCTION public.mcp_archive_get_ref(p_token text, p_ref_no integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  t public.api_tokens;
  e public.archive_entries;
BEGIN
  t := public.api__token(p_token, ARRAY['archive:read', 'archive:write', 'archive_read', 'archive_write']);
  SELECT * INTO e FROM public.archive_entries x WHERE x.owner_id = t.member_id AND x.ref_no = p_ref_no AND x.kind <> 'anon';
  IF e.id IS NULL THEN RAISE EXCEPTION 'archive_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN public.archive__json(e);
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_archive_get_ref(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_archive_get_ref(text, integer) TO anon, authenticated;
