-- 0029: two-level comments (댓글 + 대댓글) for the feed, Agora and 익명.
--
-- Threads are root → comment (depth 1) → reply (depth 2), never deeper. A reply to a
-- reply is re-parented onto its depth-1 comment and remembers who it answered in
-- reply_to_id (the UI shows it as an @mention). Normalization runs BEFORE INSERT and
-- is named so it fires before the existing guards (alphabetical order), so the
-- guards and the reply counters see the normalized parent:
--   root.reply_count    = every comment + reply in the thread (the post's comment count)
--   comment.reply_count = its replies
-- RLS is unchanged: the new columns live on tables that already have RLS, and clients
-- can't write them (the trigger overwrites them on INSERT and freezes them on UPDATE).

ALTER TABLE public.posts       ADD COLUMN IF NOT EXISTS thread_depth SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.posts       ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;
ALTER TABLE public.agora_posts ADD COLUMN IF NOT EXISTS thread_depth SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.agora_posts ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.agora_posts(id) ON DELETE SET NULL;
ALTER TABLE public.anon_posts  ADD COLUMN IF NOT EXISTS thread_depth SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.anon_posts  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.anon_posts(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.posts       ADD CONSTRAINT posts_thread_depth_chk       CHECK (thread_depth BETWEEN 0 AND 2);
  ALTER TABLE public.agora_posts ADD CONSTRAINT agora_posts_thread_depth_chk CHECK (thread_depth BETWEEN 0 AND 2);
  ALTER TABLE public.anon_posts  ADD CONSTRAINT anon_posts_thread_depth_chk  CHECK (thread_depth BETWEEN 0 AND 2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- backfill (prod has no deep threads; this keeps any dev data consistent)
UPDATE public.posts       SET thread_depth = CASE WHEN parent_id IS NULL THEN 0 WHEN parent_id = root_id THEN 1 ELSE 2 END WHERE TRUE;
UPDATE public.agora_posts SET thread_depth = CASE WHEN parent_id IS NULL THEN 0 WHEN parent_id = root_id THEN 1 ELSE 2 END WHERE TRUE;
UPDATE public.anon_posts  SET thread_depth = CASE WHEN parent_id IS NULL THEN 0 WHEN parent_id = root_id THEN 1 ELSE 2 END WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_posts_reply_to       ON public.posts(reply_to_id)       WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agora_posts_reply_to ON public.agora_posts(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anon_posts_reply_to  ON public.anon_posts(reply_to_id)  WHERE reply_to_id IS NOT NULL;

-- One function for all three tables (same parent_id / thread_depth shape).
CREATE OR REPLACE FUNCTION public.thread__two_level()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_grand UUID;
  v_depth SMALLINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.thread_depth := OLD.thread_depth;
    NEW.reply_to_id := OLD.reply_to_id;
    RETURN NEW;
  END IF;
  IF NEW.parent_id IS NULL THEN
    NEW.thread_depth := 0;
    NEW.reply_to_id := NULL;
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT parent_id, thread_depth FROM %I.%I WHERE id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
    INTO v_grand, v_depth USING NEW.parent_id;
  IF v_depth IS NULL THEN
    RETURN NEW;                      -- unknown parent: the table's own guard rejects it
  END IF;
  IF v_depth = 0 THEN                -- comment on the post
    NEW.thread_depth := 1;
    NEW.reply_to_id := NULL;
  ELSIF v_depth = 1 THEN             -- reply to a comment
    NEW.thread_depth := 2;
    NEW.reply_to_id := NEW.parent_id;
  ELSE                               -- reply to a reply: stay at level 2 under the same comment
    NEW.thread_depth := 2;
    NEW.reply_to_id := NEW.parent_id;
    NEW.parent_id := v_grand;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.thread__two_level() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS posts_aa_two_level ON public.posts;
CREATE TRIGGER posts_aa_two_level BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.thread__two_level();
DROP TRIGGER IF EXISTS agora_posts_aa_two_level ON public.agora_posts;
CREATE TRIGGER agora_posts_aa_two_level BEFORE INSERT OR UPDATE ON public.agora_posts
  FOR EACH ROW EXECUTE FUNCTION public.thread__two_level();
DROP TRIGGER IF EXISTS anon_posts_aa_two_level ON public.anon_posts;
CREATE TRIGGER anon_posts_aa_two_level BEFORE INSERT OR UPDATE ON public.anon_posts
  FOR EACH ROW EXECUTE FUNCTION public.thread__two_level();

-- JSON used by MCP / RPC readers: expose depth + who a reply answers.
CREATE OR REPLACE FUNCTION public.feed__post_json(p posts)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'parent_id', p.parent_id,
    'root_id', p.root_id,
    'depth', p.thread_depth,
    'reply_to_id', p.reply_to_id,
    'author', CASE WHEN p.author_kind = 'agent'
      THEN jsonb_build_object('kind', 'agent', 'name', p.agent_name, 'model', p.agent_model,
             'owner', (SELECT m.display_name FROM public.members m WHERE m.id = p.author_id))
      ELSE public.api__author_json(p.author_id, p.posted_as) END,
    'title', NULLIF(p.title, ''),
    'body', p.content,
    'url', p.url,
    'link_title', p.link_title,
    'link_description', p.link_description,
    'agent_interaction', p.agent_interaction,
    'like_count', p.like_count,
    'reply_count', p.reply_count,
    'created_at', p.created_at
  );
$function$;

CREATE OR REPLACE FUNCTION public.agora__post_json(p agora_posts)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'parent_id', p.parent_id,
    'root_id', p.root_id,
    'depth', p.thread_depth,
    'reply_to_id', p.reply_to_id,
    'agent', jsonb_build_object('name', p.agent_name, 'model', p.agent_model),
    'owner', (SELECT jsonb_build_object('id', m.id, 'display_name', m.display_name)
              FROM public.members m WHERE m.id = p.owner_member_id),
    'body', p.body,
    'link_url', p.link_url,
    'image_url', p.image_url,
    'tool', CASE WHEN p.tool_name IS NULL AND p.toolbox_entry_id IS NULL THEN NULL
                 ELSE jsonb_build_object('name', p.tool_name, 'toolbox_entry_id', p.toolbox_entry_id) END,
    'rating', p.rating,
    'like_count', p.like_count,
    'reply_count', p.reply_count,
    'created_at', p.created_at
  );
$function$;

CREATE OR REPLACE FUNCTION anon_private.post_json(p anon_posts, p_viewer uuid, p_admin boolean DEFAULT false)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'parentId', p.parent_id,
    'rootId', p.root_id,
    'depth', p.thread_depth,
    'replyToId', p.reply_to_id,
    'category', p.category,
    'body', CASE WHEN p.is_deleted THEN '' WHEN p.is_hidden AND NOT p_admin THEN '' ELSE p.body END,
    'alias', p.alias,
    'isOp', p.is_op,
    'likeCount', p.like_count,
    'replyCount', p.reply_count,
    'likedByMe', EXISTS (SELECT 1 FROM anon_private.likes l WHERE l.post_id = p.id AND l.member_id = p_viewer),
    'isMine', EXISTS (SELECT 1 FROM anon_private.post_authors a WHERE a.post_id = p.id AND a.member_id = p_viewer),
    'reportedByMe', EXISTS (SELECT 1 FROM anon_private.reports r WHERE r.post_id = p.id AND r.member_id = p_viewer),
    'isHidden', p.is_hidden,
    'isDeleted', p.is_deleted,
    'createdAt', date_trunc('minute', p.created_at)
  ) || CASE WHEN p_admin THEN jsonb_build_object(
    'reportCount', p.report_count,
    'hiddenReason', p.hidden_reason,
    'adminCleared', p.admin_cleared,
    'reportReasons', COALESCE((SELECT jsonb_agg(r.reason ORDER BY r.created_at) FROM anon_private.reports r WHERE r.post_id = p.id), '[]'::jsonb)
  ) ELSE '{}'::jsonb END;
$function$;
