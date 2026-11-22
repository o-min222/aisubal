-- 0014: multiple link previews per post (composer carousel, up to 4 links).
--
-- The first link still fills the legacy url/link_* columns (MCP feed tools,
-- archive, old readers). link_previews holds every preview, in the order shown.
-- Authors can update their own posts (posts_update), so the shape is enforced
-- by a CHECK: an array of 1..4 objects with an http(s) url, an https-or-null
-- image, and a total size cap.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS link_previews jsonb;

CREATE OR REPLACE FUNCTION public.posts__valid_previews(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p IS NULL OR (
    jsonb_typeof(p) = 'array'
    AND jsonb_array_length(p) BETWEEN 1 AND 4
    AND octet_length(p::text) <= 16000
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p) AS e(v)
      WHERE jsonb_typeof(e.v) <> 'object'
         OR jsonb_typeof(e.v -> 'url') IS DISTINCT FROM 'string'
         OR (e.v ->> 'url') !~ '^https?://'
         OR length(e.v ->> 'url') > 2000
         OR (jsonb_typeof(e.v -> 'image') = 'string' AND (e.v ->> 'image') !~ '^https://')
         OR (jsonb_typeof(e.v -> 'favicon') = 'string' AND (e.v ->> 'favicon') !~ '^https://')
    )
  )
$$;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_link_previews_valid;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_link_previews_valid CHECK (public.posts__valid_previews(link_previews));
