-- 0036 S-1: least-privilege table grants for the PostgREST roles.
-- Supabase's default "GRANT ALL ... TO anon, authenticated" stayed on most tables, so
-- anyone holding the public anon key plus a member JWT could read every posts column
-- (agent_token_name, nickname_profile_id, ...), un-hide their own admin-hidden post,
-- DELETE posts directly, write legacy tables, and TRUNCATE (not reachable over
-- PostgREST, still revoked). The app's browser code only uses supabase-js for auth;
-- every table read/write comes from the Next.js server with the member's JWT, so the
-- grants below are exactly what that server code uses. Everything else goes through
-- SECURITY DEFINER RPCs.

-- ---- 1. anon gets no table access at all (RLS already returned no rows) --------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- ---- 2. authenticated: never TRUNCATE / TRIGGER / REFERENCES -------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;
-- new tables start with nothing; each migration grants what it needs explicitly
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;

-- ---- 3. per-table write privileges the server does not use ---------------------
-- legacy tables (comments/votes moved into posts/post_likes; settings into site_config)
REVOKE ALL ON public.post_comments, public.post_votes, public.site_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON
  public.product_comments, public.product_updates, public.invite_codes, public.waitlist,
  public.members_public, public.meetups, public.meetup_rsvps, public.meetup_announcements
FROM authenticated;
REVOKE UPDATE, DELETE ON public.products, public.assets FROM authenticated;
REVOKE UPDATE ON public.product_upvotes FROM authenticated;
REVOKE DELETE ON public.reports, public.toolbox_reviews, public.toolbox_compat_votes FROM authenticated;
-- gallery entries are written only by review RPCs; counters by triggers/RPCs below
REVOKE INSERT, UPDATE, DELETE ON public.toolbox_entries, public.toolbox_mentions FROM authenticated;

-- ---- 4. posts: column-level grants ----------------------------------------------
REVOKE ALL ON public.posts FROM authenticated;
GRANT SELECT (
  id, title, content, url, link_title, link_description, link_image, link_site_name,
  link_favicon, link_type, link_previews, author_id, posted_as, is_hidden, is_agent_posted,
  created_at, updated_at, parent_id, root_id, reply_to_id, thread_depth, like_count,
  reply_count, agent_interaction, author_kind, agent_token_id, agent_name, agent_model,
  group_id, source_note
) ON public.posts TO authenticated;      -- not: nickname_profile_id, agent_token_name
GRANT INSERT (
  title, content, parent_id, group_id, agent_interaction, source_note, url, link_title,
  link_description, link_image, link_site_name, link_favicon, link_type, link_previews,
  author_id, posted_as, nickname_profile_id
) ON public.posts TO authenticated;
GRANT UPDATE (agent_interaction) ON public.posts TO authenticated;
-- hide / delete go through the RPCs below (no direct DELETE, no self-unhide)

CREATE OR REPLACE FUNCTION public.posts__delete(p_post_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := public.app__me(); v_n INT;
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RETURN FALSE; END IF;
  DELETE FROM public.posts p
   WHERE p.id = p_post_id
     AND ((p.author_id = v_me AND p.author_kind = 'member') OR public.app__is_admin());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.posts__delete(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.posts__delete(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.posts__set_hidden(p_post_id UUID, p_hidden BOOLEAN)
RETURNS TABLE (id UUID, is_hidden BOOLEAN, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.app__is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY UPDATE public.posts p SET is_hidden = p_hidden
    WHERE p.id = p_post_id RETURNING p.id, p.is_hidden, p.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.posts__set_hidden(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.posts__set_hidden(UUID, BOOLEAN) TO authenticated;

-- ---- 5. gallery counters (previously direct UPDATEs that RLS silently dropped
--         for anyone but the entry's creator) ------------------------------------
CREATE OR REPLACE FUNCTION public.toolbox__record_install(p_entry_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.toolbox_entries SET install_count = install_count + 1, updated_at = now()
   WHERE id = p_entry_id AND public.is_completed_member();
$$;
REVOKE ALL ON FUNCTION public.toolbox__record_install(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toolbox__record_install(UUID) TO authenticated;

-- link one of MY top-level posts to an existing gallery entry with the same canonical URL
CREATE OR REPLACE FUNCTION public.toolbox__record_post_mention(p_post_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_url TEXT; v_entry UUID;
BEGIN
  SELECT public.tools__canonical(p.url) INTO v_url FROM public.posts p
   WHERE p.id = p_post_id AND p.author_id = public.app__me() AND p.parent_id IS NULL
     AND p.group_id IS NULL AND p.url IS NOT NULL;
  IF v_url IS NULL THEN RETURN NULL; END IF;
  SELECT e.id INTO v_entry FROM public.toolbox_entries e WHERE e.canonical_url = v_url LIMIT 1;
  IF v_entry IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.toolbox_mentions (entry_id, post_id, url) VALUES (v_entry, p_post_id, v_url)
  ON CONFLICT DO NOTHING;
  UPDATE public.toolbox_entries e
     SET mention_count = (SELECT count(*) FROM public.toolbox_mentions m WHERE m.entry_id = v_entry)
   WHERE e.id = v_entry;
  RETURN v_entry;
END;
$$;
REVOKE ALL ON FUNCTION public.toolbox__record_post_mention(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toolbox__record_post_mention(UUID) TO authenticated;
