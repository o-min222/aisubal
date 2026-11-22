-- Gallery logos (Colin): each service's own icon instead of the letter mark.
-- The app resolves it server-side through the SSRF-safe fetch (lib/service-icon.ts): the GitHub owner
-- avatar for repos, else the site's declared apple-touch-icon/icon. New 등록 requests store it on the
-- submission right after submit_tool; approval copies it onto the entry (trigger, so every approval path
-- is covered). An icon an admin or a product launch already set is never overwritten.

ALTER TABLE public.tool_submissions ADD COLUMN IF NOT EXISTS icon_url TEXT
  CHECK (icon_url IS NULL OR (icon_url ~ '^https://[^/]+/' AND char_length(icon_url) <= 500));

-- the submitting agent's token stores the resolved icon on its own pending/approved request
CREATE OR REPLACE FUNCTION public.mcp_tool_store_icon(p_token TEXT, p_id UUID, p_icon TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.api_tokens%ROWTYPE;
BEGIN
  t := public.api__token(p_token, ARRAY['tools:submit']);
  IF p_icon IS NULL OR p_icon !~ '^https://[^/]+/' OR char_length(p_icon) > 500 THEN
    RAISE EXCEPTION 'api_invalid:icon' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tool_submissions SET icon_url = p_icon
   WHERE id = p_id AND submitter_id = t.member_id AND status IN ('pending', 'approved') AND icon_url IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_tool_store_icon(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_tool_store_icon(TEXT, UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.tool_submissions__icon_to_entry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.entry_id IS NOT NULL AND NEW.icon_url IS NOT NULL THEN
    UPDATE public.toolbox_entries SET icon_url = NEW.icon_url WHERE id = NEW.entry_id AND icon_url IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tool_submissions__icon_to_entry() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tool_submissions_icon_to_entry ON public.tool_submissions;
CREATE TRIGGER tool_submissions_icon_to_entry
  AFTER INSERT OR UPDATE OF entry_id, icon_url ON public.tool_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tool_submissions__icon_to_entry();

-- backfill: resolved 2026-11-23 with the same rules (GitHub owner avatar; Vercel MCP → its apple-touch-icon)
UPDATE public.toolbox_entries e SET icon_url = v.icon
  FROM (VALUES
    ('a0000000-0000-4000-8001-c38e6926a1b2'::uuid, 'https://avatars.githubusercontent.com/u/151674099?s=128&v=4'),
    ('a0000000-0000-4000-8000-a435d6bca1b2'::uuid, 'https://avatars.githubusercontent.com/u/76263028?s=128&v=4'),
    ('a0000000-0000-4000-8001-994a3dba1b2c'::uuid, 'https://avatars.githubusercontent.com/u/14985020?s=128&v=4'),
    ('a0000000-0000-4000-8000-f6ff19dba1b2'::uuid, 'https://avatars.githubusercontent.com/u/182288589?s=128&v=4'),
    ('a0000000-0000-4000-8001-5d51d385a1b2'::uuid, 'https://avatars.githubusercontent.com/u/182288589?s=128&v=4'),
    ('a0000000-0000-4000-8000-58826e9a1b2c'::uuid, 'https://avatars.githubusercontent.com/u/172139148?s=128&v=4'),
    ('a0000000-0000-4000-8001-de312ca7a1b2'::uuid, 'https://avatars.githubusercontent.com/u/127876214?s=128&v=4'),
    ('a0000000-0000-4000-8000-28b4d971a1b2'::uuid, 'https://avatars.githubusercontent.com/u/54469796?s=128&v=4'),
    ('a0000000-0000-4000-8001-2f32d8a1b2c3'::uuid, 'https://avatars.githubusercontent.com/u/3046006?s=128&v=4'),
    ('a0000000-0000-4000-8000-de2f8068a1b2'::uuid, 'https://avatars.githubusercontent.com/u/74989412?s=128&v=4'),
    ('a0000000-0000-4000-8000-f1a7ae90a1b2'::uuid, 'https://avatars.githubusercontent.com/u/14957082?s=128&v=4'),
    ('a0000000-0000-4000-8000-776d6588a1b2'::uuid, 'https://avatars.githubusercontent.com/u/161781182?s=128&v=4'),
    ('a0000000-0000-4000-8000-75836700a1b2'::uuid, 'https://avatars.githubusercontent.com/u/9919?s=128&v=4'),
    ('a0000000-0000-4000-8001-ab42aa57a1b2'::uuid, 'https://avatars.githubusercontent.com/u/76263028?s=128&v=4'),
    ('a0000000-0000-4000-8000-419e29c3a1b2'::uuid, 'https://avatars.githubusercontent.com/u/76263028?s=128&v=4'),
    ('a0000000-0000-4000-8000-eb421e06a1b2'::uuid, 'https://avatars.githubusercontent.com/u/6154722?s=128&v=4'),
    ('a0000000-0000-4000-8000-53f4b97ea1b2'::uuid, 'https://avatars.githubusercontent.com/u/135057108?s=128&v=4'),
    ('a0000000-0000-4000-8000-b107ed5ba1b2'::uuid, 'https://avatars.githubusercontent.com/u/77906174?s=128&v=4'),
    ('a0000000-0000-4000-8000-aba86aa6a1b2'::uuid, 'https://avatars.githubusercontent.com/u/11260967?s=128&v=4'),
    ('a0000000-0000-4000-8000-edd9bb62a1b2'::uuid, 'https://avatars.githubusercontent.com/u/12301619?s=128&v=4'),
    ('a0000000-0000-4000-8000-dca7d3c6a1b2'::uuid, 'https://avatars.githubusercontent.com/u/158221360?s=128&v=4'),
    ('a0000000-0000-4000-8001-7ef7fdf3a1b2'::uuid, 'https://avatars.githubusercontent.com/u/108313943?s=128&v=4'),
    ('a0000000-0000-4000-8001-d5fe041ea1b2'::uuid, 'https://avatars.githubusercontent.com/u/14985020?s=128&v=4'),
    ('97e41ea9-ba8a-4f52-a065-ff16c08496ce'::uuid, 'https://avatars.githubusercontent.com/u/54469796?s=128&v=4'),
    ('bb1d7550-ab0b-46d1-b511-72d259ce3084'::uuid, 'https://assets.vercel.com/image/upload/q_auto/front/favicon/vercel/apple-touch-icon-180x180.png'),
    ('640c579a-703f-450d-9673-12913fe701d9'::uuid, 'https://avatars.githubusercontent.com/u/126759922?s=128&v=4')
  ) AS v(id, icon)
 WHERE e.id = v.id AND e.icon_url IS NULL;
