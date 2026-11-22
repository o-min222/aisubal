-- 0005: Blind-style anonymous board (익명)
--
-- Privacy model
--  * public.anon_posts holds content only: NO author column. Clients have no
--    table privileges at all; every read/write goes through SECURITY DEFINER
--    RPCs that require a signed-in, completed, non-banned member (auth.uid()).
--  * The author mapping, per-thread aliases, likes and reports live in the
--    non-exposed schema anon_private (no USAGE for anon/authenticated, RLS on,
--    no policies, no table/column grants). Only admin RPCs read it.
--  * RPCs never return member ids. Aliases are random per thread, so the same
--    member is unlinkable across threads. Timestamps are truncated to minutes.
--  * Agents: RPCs are granted to `authenticated` only and need auth.uid(), so
--    token-based MCP/CLI calls (anon role, no session) can never reach them.

CREATE SCHEMA IF NOT EXISTS anon_private;
REVOKE ALL ON SCHEMA anon_private FROM PUBLIC, anon, authenticated;

INSERT INTO public.site_config (key, value) VALUES
  ('anon_post_max_chars', '1000'),
  ('anon_report_hide_threshold', '5'),
  ('anon_daily_post_limit', '10'),
  ('anon_daily_reply_limit', '60'),
  ('anon_daily_report_limit', '30')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------ content
CREATE TABLE IF NOT EXISTS public.anon_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.anon_posts(id) ON DELETE CASCADE,
  root_id UUID REFERENCES public.anon_posts(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('chat', 'work', 'career', 'ai', 'worry')),
  body TEXT NOT NULL,
  alias TEXT NOT NULL,
  is_op BOOLEAN NOT NULL DEFAULT FALSE,
  like_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_reason TEXT CHECK (hidden_reason IN ('reports', 'admin')),
  hidden_at TIMESTAMPTZ,
  admin_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT anon_posts_body_len CHECK (is_deleted OR char_length(btrim(body)) BETWEEN 1 AND 1000),
  CONSTRAINT anon_posts_thread CHECK ((parent_id IS NULL AND root_id IS NULL) OR (parent_id IS NOT NULL AND root_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_anon_posts_feed ON public.anon_posts(created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_anon_posts_cat ON public.anon_posts(category, created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_anon_posts_root ON public.anon_posts(root_id);
CREATE INDEX IF NOT EXISTS idx_anon_posts_parent ON public.anon_posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_anon_posts_hidden ON public.anon_posts(is_hidden) WHERE is_hidden;

ALTER TABLE public.anon_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anon_posts FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ private
CREATE TABLE IF NOT EXISTS anon_private.post_authors (
  post_id UUID PRIMARY KEY REFERENCES public.anon_posts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  root_id UUID NOT NULL,
  is_reply BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anon_authors_member ON anon_private.post_authors(member_id, created_at);

CREATE TABLE IF NOT EXISTS anon_private.thread_aliases (
  root_id UUID NOT NULL REFERENCES public.anon_posts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (root_id, member_id),
  UNIQUE (root_id, alias)
);

CREATE TABLE IF NOT EXISTS anon_private.likes (
  post_id UUID NOT NULL REFERENCES public.anon_posts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_anon_likes_member ON anon_private.likes(member_id);

CREATE TABLE IF NOT EXISTS anon_private.reports (
  post_id UUID NOT NULL REFERENCES public.anon_posts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_anon_reports_member ON anon_private.reports(member_id, created_at);

-- Every admin trace / moderation action is logged (who looked up whom, why).
CREATE TABLE IF NOT EXISTS anon_private.moderation_log (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID,
  action TEXT NOT NULL CHECK (action IN ('trace', 'hide', 'unhide', 'delete', 'auto_hide')),
  admin_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  target_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  reason TEXT,
  body_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE anon_private.post_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE anon_private.thread_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE anon_private.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE anon_private.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE anon_private.moderation_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA anon_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA anon_private FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA anon_private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ helpers
CREATE OR REPLACE FUNCTION anon_private.cfg_int(p_key TEXT, p_default INTEGER)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((SELECT NULLIF(btrim(value), '')::INTEGER FROM public.site_config WHERE key = p_key), p_default);
$$;

-- Signed-in, completed, non-banned member id; raises otherwise.
CREATE OR REPLACE FUNCTION anon_private.me()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'anon_unauthorized' USING ERRCODE = 'P0001'; END IF;
  SELECT m.id INTO v FROM public.members m
  WHERE m.auth_id = auth.uid() AND m.signup_completed_at IS NOT NULL AND m.is_banned = FALSE;
  IF v IS NULL THEN RAISE EXCEPTION 'anon_forbidden' USING ERRCODE = 'P0001'; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION anon_private.admin()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v UUID;
BEGIN
  v := anon_private.me();
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = v AND is_admin) THEN
    RAISE EXCEPTION 'anon_admin_only' USING ERRCODE = 'P0001';
  END IF;
  RETURN v;
END;
$$;

-- Stable per (thread, member); random and unique within the thread.
CREATE OR REPLACE FUNCTION anon_private.alias_for(p_root UUID, p_member UUID)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v TEXT;
  animals TEXT[] := ARRAY['고양이','강아지','수달','너구리','펭귄','판다','여우','토끼','다람쥐','고래',
    '돌고래','코알라','햄스터','부엉이','올빼미','사슴','라쿤','알파카','기린','코끼리','하마','거북이',
    '해달','물개','미어캣','카피바라','두더지','고슴도치','오리','참새','까치','독수리','앵무새','문어',
    '해파리','치타','호랑이','사자','곰','늑대','고라니','청설모','오소리','두루미','백조','홍학','라마','바다표범'];
  free TEXT[];
  n INTEGER;
BEGIN
  SELECT alias INTO v FROM anon_private.thread_aliases WHERE root_id = p_root AND member_id = p_member;
  IF v IS NOT NULL THEN RETURN v; END IF;
  -- serialize alias allocation per thread
  PERFORM pg_advisory_xact_lock(hashtextextended(p_root::TEXT, 7));
  SELECT alias INTO v FROM anon_private.thread_aliases WHERE root_id = p_root AND member_id = p_member;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT array_agg('익명의 ' || a) INTO free FROM unnest(animals) a
  WHERE NOT EXISTS (SELECT 1 FROM anon_private.thread_aliases t WHERE t.root_id = p_root AND t.alias = '익명의 ' || a);
  IF free IS NOT NULL AND array_length(free, 1) > 0 THEN
    v := free[1 + floor(random() * array_length(free, 1))::INTEGER];
  ELSE
    SELECT count(*) INTO n FROM anon_private.thread_aliases WHERE root_id = p_root;
    v := '익명의 ' || animals[1 + floor(random() * array_length(animals, 1))::INTEGER] || ' ' || (n + 1);
  END IF;
  INSERT INTO anon_private.thread_aliases(root_id, member_id, alias) VALUES (p_root, p_member, v);
  RETURN v;
END;
$$;

-- Client-safe JSON for one post. Never contains member ids.
CREATE OR REPLACE FUNCTION anon_private.post_json(p public.anon_posts, p_viewer UUID, p_admin BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'parentId', p.parent_id,
    'rootId', p.root_id,
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
$$;

-- reply_count on parent and root
CREATE OR REPLACE FUNCTION anon_private.reply_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE public.anon_posts SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    IF NEW.root_id <> NEW.parent_id THEN
      UPDATE public.anon_posts SET reply_count = reply_count + 1 WHERE id = NEW.root_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE public.anon_posts SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
    IF OLD.root_id <> OLD.parent_id THEN
      UPDATE public.anon_posts SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.root_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS anon_posts_reply_counter ON public.anon_posts;
CREATE TRIGGER anon_posts_reply_counter AFTER INSERT OR DELETE ON public.anon_posts
  FOR EACH ROW EXECUTE FUNCTION anon_private.reply_counter();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA anon_private FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ member RPCs
CREATE OR REPLACE FUNCTION public.anon_list(
  p_category TEXT DEFAULT NULL, p_sort TEXT DEFAULT 'latest',
  p_before TIMESTAMPTZ DEFAULT NULL, p_offset INTEGER DEFAULT 0, p_limit INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := anon_private.me(); v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
BEGIN
  IF p_sort = 'popular' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(anon_private.post_json(x, v_me) ORDER BY x.like_count * 2 + x.reply_count DESC, x.created_at DESC)
      FROM (
        SELECT p.id FROM public.anon_posts p
        WHERE p.parent_id IS NULL AND NOT p.is_hidden AND NOT p.is_deleted
          AND (p_category IS NULL OR p.category = p_category)
          AND p.created_at > NOW() - INTERVAL '30 days'
        ORDER BY p.like_count * 2 + p.reply_count DESC, p.created_at DESC
        OFFSET GREATEST(COALESCE(p_offset, 0), 0) LIMIT v_lim
      ) s JOIN public.anon_posts x ON x.id = s.id), '[]'::jsonb);
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(anon_private.post_json(x, v_me) ORDER BY x.created_at DESC)
    FROM (
      SELECT p.id FROM public.anon_posts p
      WHERE p.parent_id IS NULL AND NOT p.is_hidden AND NOT p.is_deleted
        AND (p_category IS NULL OR p.category = p_category)
        AND (p_before IS NULL OR p.created_at < p_before)
      ORDER BY p.created_at DESC
      LIMIT v_lim
    ) s JOIN public.anon_posts x ON x.id = s.id), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.anon_thread(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := anon_private.me(); r public.anon_posts%ROWTYPE; v_root UUID;
BEGIN
  SELECT COALESCE(root_id, id) INTO v_root FROM public.anon_posts WHERE id = p_id;
  SELECT * INTO r FROM public.anon_posts WHERE id = v_root;
  IF NOT FOUND OR r.is_hidden THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object(
    'root', anon_private.post_json(r, v_me),
    'replies', COALESCE((
      SELECT jsonb_agg(anon_private.post_json(x, v_me) ORDER BY x.created_at)
      FROM public.anon_posts x WHERE x.root_id = r.id), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.anon_create(p_body TEXT, p_category TEXT DEFAULT NULL, p_parent_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := anon_private.me();
  v_body TEXT := btrim(COALESCE(p_body, ''));
  v_max INTEGER := anon_private.cfg_int('anon_post_max_chars', 1000);
  parent public.anon_posts%ROWTYPE;
  v_root UUID; v_cat TEXT; v_alias TEXT; v_is_op BOOLEAN := FALSE; v_id UUID := gen_random_uuid(); v_count INTEGER;
BEGIN
  IF char_length(v_body) = 0 THEN RAISE EXCEPTION 'anon_empty' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_body) > LEAST(v_max, 1000) THEN RAISE EXCEPTION 'anon_too_long' USING ERRCODE = 'P0001'; END IF;

  IF p_parent_id IS NULL THEN
    IF p_category IS NULL OR p_category NOT IN ('chat', 'work', 'career', 'ai', 'worry') THEN
      RAISE EXCEPTION 'anon_bad_category' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO v_count FROM anon_private.post_authors
      WHERE member_id = v_me AND NOT is_reply AND created_at > NOW() - INTERVAL '1 day';
    IF v_count >= anon_private.cfg_int('anon_daily_post_limit', 10) THEN
      RAISE EXCEPTION 'anon_daily_limit' USING ERRCODE = 'P0001';
    END IF;
    v_cat := p_category; v_is_op := TRUE;
    -- root row first so the alias FK holds; alias filled right after
    INSERT INTO public.anon_posts(id, category, body, alias, is_op) VALUES (v_id, v_cat, v_body, '', TRUE);
    v_alias := anon_private.alias_for(v_id, v_me);
    UPDATE public.anon_posts SET alias = v_alias WHERE id = v_id;
    INSERT INTO anon_private.post_authors(post_id, member_id, root_id, is_reply) VALUES (v_id, v_me, v_id, FALSE);
    RETURN jsonb_build_object('id', v_id, 'rootId', v_id, 'alias', v_alias);
  END IF;

  SELECT * INTO parent FROM public.anon_posts WHERE id = p_parent_id;
  IF NOT FOUND OR parent.is_hidden OR parent.is_deleted THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  v_root := COALESCE(parent.root_id, parent.id);
  IF EXISTS (SELECT 1 FROM public.anon_posts WHERE id = v_root AND (is_hidden OR is_deleted)) THEN
    RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_count FROM anon_private.post_authors
    WHERE member_id = v_me AND is_reply AND created_at > NOW() - INTERVAL '1 day';
  IF v_count >= anon_private.cfg_int('anon_daily_reply_limit', 60) THEN
    RAISE EXCEPTION 'anon_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  SELECT category INTO v_cat FROM public.anon_posts WHERE id = v_root;
  v_is_op := EXISTS (SELECT 1 FROM anon_private.post_authors WHERE post_id = v_root AND member_id = v_me);
  v_alias := anon_private.alias_for(v_root, v_me);
  INSERT INTO public.anon_posts(id, parent_id, root_id, category, body, alias, is_op)
    VALUES (v_id, parent.id, v_root, v_cat, v_body, v_alias, v_is_op);
  INSERT INTO anon_private.post_authors(post_id, member_id, root_id, is_reply) VALUES (v_id, v_me, v_root, TRUE);
  RETURN jsonb_build_object('id', v_id, 'rootId', v_root, 'alias', v_alias);
END;
$$;

CREATE OR REPLACE FUNCTION public.anon_like(p_id UUID, p_unlike BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := anon_private.me(); p public.anon_posts%ROWTYPE; v_n INTEGER;
BEGIN
  SELECT * INTO p FROM public.anon_posts WHERE id = p_id;
  IF NOT FOUND OR p.is_hidden OR p.is_deleted THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  IF p_unlike THEN
    DELETE FROM anon_private.likes WHERE post_id = p_id AND member_id = v_me;
  ELSE
    INSERT INTO anon_private.likes(post_id, member_id) VALUES (p_id, v_me) ON CONFLICT DO NOTHING;
  END IF;
  SELECT count(*) INTO v_n FROM anon_private.likes WHERE post_id = p_id;
  UPDATE public.anon_posts SET like_count = v_n WHERE id = p_id;
  RETURN jsonb_build_object('liked', NOT p_unlike, 'likeCount', v_n);
END;
$$;

-- Likers are never identified: count only.
CREATE OR REPLACE FUNCTION public.anon_likers(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := anon_private.me(); p public.anon_posts%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.anon_posts WHERE id = p_id;
  IF NOT FOUND OR p.is_hidden THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object(
    'count', (SELECT count(*) FROM anon_private.likes WHERE post_id = p_id),
    'likedByMe', EXISTS (SELECT 1 FROM anon_private.likes WHERE post_id = p_id AND member_id = v_me));
END;
$$;

CREATE OR REPLACE FUNCTION public.anon_report(p_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me UUID := anon_private.me(); p public.anon_posts%ROWTYPE; v_n INTEGER; v_today INTEGER;
  v_reason TEXT := left(btrim(COALESCE(p_reason, '')), 200);
  v_threshold INTEGER := GREATEST(anon_private.cfg_int('anon_report_hide_threshold', 5), 1);
BEGIN
  IF v_reason = '' THEN RAISE EXCEPTION 'anon_report_reason' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO p FROM public.anon_posts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR p.is_deleted THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM anon_private.post_authors WHERE post_id = p_id AND member_id = v_me) THEN
    RAISE EXCEPTION 'anon_report_own' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_today FROM anon_private.reports WHERE member_id = v_me AND created_at > NOW() - INTERVAL '1 day';
  IF v_today >= anon_private.cfg_int('anon_daily_report_limit', 30) THEN
    RAISE EXCEPTION 'anon_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO anon_private.reports(post_id, member_id, reason) VALUES (p_id, v_me, v_reason) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_n FROM anon_private.reports WHERE post_id = p_id;
  UPDATE public.anon_posts SET report_count = v_n WHERE id = p_id;
  IF v_n >= v_threshold AND NOT p.is_hidden AND NOT p.admin_cleared THEN
    UPDATE public.anon_posts SET is_hidden = TRUE, hidden_reason = 'reports', hidden_at = NOW() WHERE id = p_id;
    INSERT INTO anon_private.moderation_log(post_id, action, reason) VALUES (p_id, 'auto_hide', v_n || ' reports');
    RETURN jsonb_build_object('reported', TRUE, 'hidden', TRUE);
  END IF;
  RETURN jsonb_build_object('reported', TRUE, 'hidden', p.is_hidden);
END;
$$;

-- Author deletes own post: hard delete when nobody replied, otherwise tombstone.
CREATE OR REPLACE FUNCTION public.anon_delete(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_me UUID := anon_private.me(); p public.anon_posts%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.anon_posts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM anon_private.post_authors WHERE post_id = p_id AND member_id = v_me) THEN
    RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF p.reply_count = 0 AND NOT EXISTS (SELECT 1 FROM public.anon_posts WHERE parent_id = p_id) THEN
    DELETE FROM public.anon_posts WHERE id = p_id;
    RETURN jsonb_build_object('deleted', TRUE, 'tombstone', FALSE);
  END IF;
  UPDATE public.anon_posts SET is_deleted = TRUE, body = '' WHERE id = p_id;
  RETURN jsonb_build_object('deleted', TRUE, 'tombstone', TRUE);
END;
$$;

-- ------------------------------------------------------------------ admin RPCs
CREATE OR REPLACE FUNCTION public.anon_admin_list(p_filter TEXT DEFAULT 'hidden', p_limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_admin UUID := anon_private.admin();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(anon_private.post_json(x, v_admin, TRUE) ORDER BY x.created_at DESC)
    FROM (
      SELECT p.id FROM public.anon_posts p
      WHERE CASE p_filter
              WHEN 'hidden' THEN p.is_hidden
              WHEN 'reported' THEN p.report_count > 0
              ELSE TRUE END
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200)
    ) s JOIN public.anon_posts x ON x.id = s.id), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.anon_admin_set_hidden(p_id UUID, p_hidden BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_admin UUID := anon_private.admin();
BEGIN
  IF p_hidden THEN
    UPDATE public.anon_posts SET is_hidden = TRUE, hidden_reason = 'admin', hidden_at = NOW() WHERE id = p_id;
  ELSE
    -- admin reviewed it: stays visible even if more reports arrive
    UPDATE public.anon_posts SET is_hidden = FALSE, hidden_reason = NULL, hidden_at = NULL, admin_cleared = TRUE WHERE id = p_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO anon_private.moderation_log(post_id, action, admin_member_id)
    VALUES (p_id, CASE WHEN p_hidden THEN 'hide' ELSE 'unhide' END, v_admin);
  RETURN jsonb_build_object('ok', TRUE, 'hidden', p_hidden);
END;
$$;

CREATE OR REPLACE FUNCTION public.anon_admin_delete(p_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_admin UUID := anon_private.admin(); p public.anon_posts%ROWTYPE; v_author UUID;
BEGIN
  SELECT * INTO p FROM public.anon_posts WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT member_id INTO v_author FROM anon_private.post_authors WHERE post_id = p_id;
  -- keep evidence (author + body) in the private log before the row goes away
  INSERT INTO anon_private.moderation_log(post_id, action, admin_member_id, target_member_id, reason, body_snapshot)
    VALUES (p_id, 'delete', v_admin, v_author, left(p_reason, 500), p.body);
  DELETE FROM public.anon_posts WHERE id = p_id;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- Admin-only author trace. Requires a reason; every lookup is logged.
CREATE OR REPLACE FUNCTION public.anon_admin_trace(p_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_admin UUID := anon_private.admin(); v_author UUID; m public.members%ROWTYPE;
BEGIN
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'anon_trace_reason' USING ERRCODE = 'P0001'; END IF;
  SELECT member_id INTO v_author FROM anon_private.post_authors WHERE post_id = p_id;
  IF v_author IS NULL THEN
    SELECT target_member_id INTO v_author FROM anon_private.moderation_log
      WHERE post_id = p_id AND action = 'delete' ORDER BY id DESC LIMIT 1;
  END IF;
  IF v_author IS NULL THEN RAISE EXCEPTION 'anon_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO m FROM public.members WHERE id = v_author;
  INSERT INTO anon_private.moderation_log(post_id, action, admin_member_id, target_member_id, reason)
    VALUES (p_id, 'trace', v_admin, v_author, left(p_reason, 500));
  RETURN jsonb_build_object(
    'memberId', m.id, 'displayName', m.display_name, 'isBanned', m.is_banned,
    'anonPostsLast30d', (SELECT count(*) FROM anon_private.post_authors WHERE member_id = v_author AND created_at > NOW() - INTERVAL '30 days'),
    'hiddenPosts', (SELECT count(*) FROM anon_private.post_authors a JOIN public.anon_posts x ON x.id = a.post_id WHERE a.member_id = v_author AND x.is_hidden));
END;
$$;

CREATE OR REPLACE FUNCTION public.anon_admin_log(p_limit INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_admin UUID := anon_private.admin();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'postId', l.post_id, 'action', l.action, 'reason', l.reason, 'createdAt', l.created_at,
      'admin', (SELECT display_name FROM public.members WHERE id = l.admin_member_id)) ORDER BY l.id DESC)
    FROM (SELECT * FROM anon_private.moderation_log ORDER BY id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)) l
  ), '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------------ grants
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'anon_list(text,text,timestamptz,integer,integer)', 'anon_thread(uuid)', 'anon_create(text,text,uuid)',
    'anon_like(uuid,boolean)', 'anon_likers(uuid)', 'anon_report(uuid,text)', 'anon_delete(uuid)',
    'anon_admin_list(text,integer)', 'anon_admin_set_hidden(uuid,boolean)', 'anon_admin_delete(uuid,text)',
    'anon_admin_trace(uuid,text)', 'anon_admin_log(integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
