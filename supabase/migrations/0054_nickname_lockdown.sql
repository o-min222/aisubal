-- 0054 nickname split, phase 2 (lockdown). The app now reads posts through
-- public_author_id / nickname_id (0052) and its own 부캐 via get_my_member (0053).
--
-- 1) posts_timeline_guard: the parent lookup used SELECT * as the caller, which needs
--    SELECT on every posts column; since 0036 revoked nickname_profile_id/agent_token_name
--    that made every client-side reply fail with "permission denied for table posts".
--    Read only the columns it uses.
CREATE OR REPLACE FUNCTION public.posts_timeline_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  p_found BOOLEAN := false;
  p_id UUID; p_root UUID; p_group UUID; p_hidden BOOLEAN; p_deleted TIMESTAMPTZ;
  is_client BOOLEAN := current_user IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF char_length(NEW.content) > 20000 THEN
      RAISE EXCEPTION 'feed_body_too_long' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(btrim(NEW.content)) = 0 THEN
      RAISE EXCEPTION 'feed_body_empty' USING ERRCODE = 'P0001';
    END IF;
    IF is_client AND (NEW.author_kind <> 'member' OR NEW.agent_token_id IS NOT NULL
                      OR NEW.agent_name IS NOT NULL OR NEW.is_agent_posted) THEN
      RAISE EXCEPTION 'feed_agent_fields_forbidden' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.parent_id IS NOT NULL THEN
      SELECT true, x.id, x.root_id, x.group_id, x.is_hidden, x.deleted_at
        INTO p_found, p_id, p_root, p_group, p_hidden, p_deleted
        FROM public.posts x WHERE x.id = NEW.parent_id;
      IF NOT coalesce(p_found, false) OR p_hidden OR p_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'feed_parent_not_found' USING ERRCODE = 'P0001';
      END IF;
      NEW.root_id := COALESCE(p_root, p_id);
      NEW.group_id := p_group;
      NEW.agent_interaction := 'humans_only';
    ELSE
      NEW.root_id := NULL;
    END IF;
    IF NEW.group_id IS NOT NULL THEN
      IF NEW.author_kind <> 'member' THEN
        RAISE EXCEPTION 'feed_group_humans_only' USING ERRCODE = 'P0001';
      END IF;
      NEW.agent_interaction := 'humans_only';
    END IF;
    NEW.like_count := 0;
    NEW.reply_count := 0;
    NEW.deleted_at := NULL;
    NEW.edited_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE from a client session: identity/thread/counter fields are immutable,
  -- and agent-authored rows cannot be edited by their owner.
  IF is_client THEN
    IF NEW.author_kind IS DISTINCT FROM OLD.author_kind
       OR NEW.agent_token_id IS DISTINCT FROM OLD.agent_token_id
       OR NEW.agent_name IS DISTINCT FROM OLD.agent_name
       OR NEW.agent_model IS DISTINCT FROM OLD.agent_model
       OR NEW.is_agent_posted IS DISTINCT FROM OLD.is_agent_posted
       OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
       OR NEW.root_id IS DISTINCT FROM OLD.root_id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.author_id IS DISTINCT FROM OLD.author_id
       OR NEW.like_count IS DISTINCT FROM OLD.like_count
       OR NEW.reply_count IS DISTINCT FROM OLD.reply_count
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
      RAISE EXCEPTION 'feed_immutable_field' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.author_kind = 'agent' AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title) THEN
      RAISE EXCEPTION 'feed_agent_row_readonly' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.group_id IS NOT NULL AND NEW.agent_interaction <> 'humans_only' THEN
    NEW.agent_interaction := 'humans_only';
  END IF;
  RETURN NEW;
END;
$fn$;

-- 2) Clients can no longer read who wrote a 부캐 post: posts.author_id is write-only
--    for them (INSERT stays; RLS/trigger checks still use it server-side).
REVOKE SELECT (author_id) ON public.posts FROM authenticated, anon;

-- 3) members_public exposed nickname next to the member id. Recreate it without 부캐 fields.
DROP VIEW IF EXISTS public.members_public;
CREATE VIEW public.members_public WITH (security_invoker = true) AS
  SELECT id, display_name, bio, avatar_url, is_admin, is_banned, banned_at, invited_by_id,
         signup_completed_at, created_at, updated_at
  FROM public.members;
REVOKE ALL ON public.members_public FROM anon;
GRANT SELECT ON public.members_public TO authenticated;

-- 4) The 부캐 lives only in nickname_profiles now (backfilled in 0052).
ALTER TABLE public.members
  DROP COLUMN nickname,
  DROP COLUMN nickname_bio,
  DROP COLUMN nickname_avatar_url,
  DROP COLUMN nickname_created_at;
