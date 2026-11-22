-- 0056 close the remaining "member behind a 부캐" reads (audit after 0054).
-- meetups: host_id + posted_as were readable by every member. The app only uses the moim_* RPCs
--   (security definer; moim__json already hides host_id for 부캐 hosts), so clients lose host_id.
-- product_comments: member_id + posted_as were readable. Clients now read public_member_id
--   (null on 부캐 rows) and nickname_id → nickname_profiles, like posts (0052).
-- meetup_rsvps are always real-name (moim_apply forces posted_as='real') and RLS shows only
--   your own rows or the host's — unchanged. anon_posts / post_comments / notifications have
--   no client SELECT at all.

-- (table-level SELECT from 0036 → column grants without host_id / nickname_profile_id)
REVOKE SELECT ON public.meetups FROM authenticated, anon;
GRANT SELECT (id, title, description, mode, venue_name, starts_at, ends_at, capacity, apply_deadline,
  requires_approval, fee_note, posted_as, status, cancelled_at, recap_post_id, recap_photos, created_at,
  updated_at, group_id, members_only, questions) ON public.meetups TO authenticated;

ALTER TABLE public.product_comments
  ADD COLUMN IF NOT EXISTS nickname_id uuid REFERENCES public.nickname_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_member_id uuid
    GENERATED ALWAYS AS (CASE WHEN posted_as = 'nickname' THEN NULL ELSE member_id END) STORED;
DO $c$ BEGIN
  ALTER TABLE public.product_comments ADD CONSTRAINT product_comments_public_member_id_fkey
    FOREIGN KEY (public_member_id) REFERENCES public.members(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $c$;

UPDATE public.product_comments c SET nickname_id = np.id, nickname_profile_id = NULL
  FROM public.nickname_profiles np WHERE c.posted_as = 'nickname' AND np.member_id = c.member_id;

CREATE OR REPLACE FUNCTION public.product_comments__nickname_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  NEW.nickname_profile_id := NULL;
  IF NEW.posted_as = 'nickname' THEN
    SELECT np.id INTO NEW.nickname_id FROM public.nickname_profiles np WHERE np.member_id = NEW.member_id;
    IF NEW.nickname_id IS NULL THEN RAISE EXCEPTION 'api_nickname_missing' USING ERRCODE = 'P0001'; END IF;
  ELSE
    NEW.nickname_id := NULL;
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.product_comments__nickname_id() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS product_comments__nickname_id ON public.product_comments;
CREATE TRIGGER product_comments__nickname_id BEFORE INSERT OR UPDATE OF posted_as, member_id ON public.product_comments
  FOR EACH ROW EXECUTE FUNCTION public.product_comments__nickname_id();

-- the product_comments SELECT lockdown is 0057 (after the app reads public_member_id)
