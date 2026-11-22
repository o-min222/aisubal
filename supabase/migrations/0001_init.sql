-- AI쓰발 — consolidated production schema (idempotent-as-possible)
-- Replaces 001–004. Safe to re-run: IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- HELPERS
-- =====================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =====================
-- MEMBERS & WAITLIST
-- =====================

CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  nickname TEXT UNIQUE,
  nickname_bio TEXT,
  nickname_avatar_url TEXT,
  nickname_created_at TIMESTAMPTZ,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT,
  invited_by_id UUID REFERENCES public.members(id),
  invite_code_used TEXT,
  signup_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_auth_id ON public.members(auth_id);
CREATE INDEX IF NOT EXISTS idx_members_email ON public.members(email);
CREATE INDEX IF NOT EXISTS idx_members_invited_by ON public.members(invited_by_id);
CREATE INDEX IF NOT EXISTS idx_members_signup_completed ON public.members(signup_completed_at)
  WHERE signup_completed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);

CREATE OR REPLACE FUNCTION public.is_completed_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.auth_id = auth.uid()
      AND m.signup_completed_at IS NOT NULL
      AND m.is_banned = FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id FROM public.members m
  WHERE m.auth_id = auth.uid()
  LIMIT 1;
$$;

-- =====================
-- INVITE CODES
-- =====================

CREATE TABLE IF NOT EXISTS public.invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  created_by_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  used_by_id UUID REFERENCES public.members(id),
  used_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON public.invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON public.invite_codes(created_by_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by ON public.invite_codes(used_by_id);

-- =====================
-- POSTS, ASSETS, VOTES, COMMENTS
-- =====================

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_note TEXT,
  url TEXT,
  link_title TEXT,
  link_description TEXT,
  link_image TEXT,
  link_site_name TEXT,
  link_favicon TEXT,
  link_type TEXT CHECK (
    link_type IS NULL OR link_type IN ('article', 'youtube', 'x', 'github', 'other')
  ),
  author_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  posted_as TEXT NOT NULL DEFAULT 'real' CHECK (posted_as IN ('real', 'nickname')),
  nickname_profile_id TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  is_agent_posted BOOLEAN NOT NULL DEFAULT FALSE,
  agent_token_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_hidden ON public.posts(is_hidden) WHERE is_hidden = FALSE;

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SKILL_MD', 'MCP_CONFIG', 'CURSOR_RULES', 'PROMPT', 'NOTE')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_post ON public.assets(post_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON public.assets(type);

CREATE TABLE IF NOT EXISTS public.post_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_post_votes_post ON public.post_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_member ON public.post_votes(member_id);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  posted_as TEXT NOT NULL DEFAULT 'real' CHECK (posted_as IN ('real', 'nickname')),
  nickname_profile_id TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_member ON public.post_comments(member_id);

-- =====================
-- LEGACY ARCHIVE (post bookmarks)
-- =====================

CREATE TABLE IF NOT EXISTS public.archive_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archive_folders_owner ON public.archive_folders(owner_id);

CREATE TABLE IF NOT EXISTS public.archive_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.archive_folders(id) ON DELETE SET NULL,
  note TEXT,
  tags TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_archive_items_owner ON public.archive_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_archive_items_post ON public.archive_items(post_id);

-- =====================
-- SECOND-BRAIN ARCHIVE
-- =====================

CREATE TABLE IF NOT EXISTS public.archive_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archive_collections_owner ON public.archive_collections(owner_id);

CREATE TABLE IF NOT EXISTS public.brain_archive_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'post', 'link', 'asset', 'toolbox', 'meetup', 'product'
  )),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content_text TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  extracted_text TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_brain_archive_owner ON public.brain_archive_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_brain_archive_type ON public.brain_archive_items(source_type);
CREATE INDEX IF NOT EXISTS idx_brain_archive_tags ON public.brain_archive_items USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_brain_archive_fts ON public.brain_archive_items
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(content_text, '') || ' ' || coalesce(extracted_text, '')
    )
  );

CREATE TABLE IF NOT EXISTS public.brain_archive_collection_items (
  collection_id UUID NOT NULL REFERENCES public.archive_collections(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.brain_archive_items(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_brain_archive_ci_item ON public.brain_archive_collection_items(item_id);

CREATE TABLE IF NOT EXISTS public.archive_highlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES public.brain_archive_items(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archive_highlights_item ON public.archive_highlights(item_id);
CREATE INDEX IF NOT EXISTS idx_archive_highlights_owner ON public.archive_highlights(owner_id);

-- =====================
-- API TOKENS & REPORTS
-- =====================

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_member ON public.api_tokens(member_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON public.api_tokens(token_hash);

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolved_by_id UUID REFERENCES public.members(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_post ON public.reports(post_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);

-- =====================
-- SITE SETTINGS / CONFIG
-- =====================

CREATE TABLE IF NOT EXISTS public.site_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.site_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.site_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.site_config (key, value) VALUES
  ('nickname_unlock_threshold', '100'),
  ('invites_per_member', '2'),
  ('site_name', 'AI쓰발')
ON CONFLICT (key) DO NOTHING;

-- =====================
-- MEETUPS
-- =====================

CREATE TABLE IF NOT EXISTS public.meetups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('offline', 'online')),
  venue_name TEXT,
  venue_address TEXT,
  map_url TEXT,
  meeting_url TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  apply_deadline TIMESTAMPTZ,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  fee_note TEXT,
  host_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  posted_as TEXT NOT NULL DEFAULT 'real' CHECK (posted_as IN ('real', 'nickname')),
  nickname_profile_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled', 'past')),
  cancelled_at TIMESTAMPTZ,
  recap_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  recap_photos TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetups_starts_at ON public.meetups(starts_at);
CREATE INDEX IF NOT EXISTS idx_meetups_status ON public.meetups(status);
CREATE INDEX IF NOT EXISTS idx_meetups_host ON public.meetups(host_id);

CREATE TABLE IF NOT EXISTS public.meetup_rsvps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meetup_id UUID NOT NULL REFERENCES public.meetups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  posted_as TEXT NOT NULL DEFAULT 'real' CHECK (posted_as IN ('real', 'nickname')),
  nickname_profile_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'waitlisted', 'rejected', 'cancelled')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meetup_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_meetup_rsvps_meetup ON public.meetup_rsvps(meetup_id);
CREATE INDEX IF NOT EXISTS idx_meetup_rsvps_member ON public.meetup_rsvps(member_id);
CREATE INDEX IF NOT EXISTS idx_meetup_rsvps_status ON public.meetup_rsvps(status);

CREATE TABLE IF NOT EXISTS public.meetup_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meetup_id UUID NOT NULL REFERENCES public.meetups(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetup_announcements_meetup ON public.meetup_announcements(meetup_id);

-- =====================
-- PRODUCTS
-- =====================

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  logo_url TEXT,
  screenshots TEXT[] NOT NULL DEFAULT '{}',
  website_url TEXT,
  app_store_url TEXT,
  github_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  maker_ids UUID[] NOT NULL DEFAULT '{}',
  launch_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  launched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_launched_at ON public.products(launched_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(featured) WHERE featured = TRUE;

CREATE TABLE IF NOT EXISTS public.product_upvotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_product_upvotes_product ON public.product_upvotes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_upvotes_created ON public.product_upvotes(created_at);

CREATE TABLE IF NOT EXISTS public.product_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  posted_as TEXT NOT NULL DEFAULT 'real' CHECK (posted_as IN ('real', 'nickname')),
  nickname_profile_id TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_comments_product ON public.product_comments(product_id);

CREATE TABLE IF NOT EXISTS public.product_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_updates_product ON public.product_updates(product_id);

-- =====================
-- TOOLBOX
-- =====================

CREATE TABLE IF NOT EXISTS public.toolbox_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  one_liner TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN (
    'agent_skill', 'mcp_server', 'cursor_rules', 'prompt', 'cli_tool', 'saas_service'
  )),
  tags TEXT[] NOT NULL DEFAULT '{}',
  icon_url TEXT,
  canonical_url TEXT NOT NULL,
  github_url TEXT,
  homepage_url TEXT,
  license TEXT,
  last_commit_at TIMESTAMPTZ,
  source_repo TEXT,
  install_snippets JSONB NOT NULL DEFAULT '{}',
  mention_count INTEGER NOT NULL DEFAULT 0,
  install_count INTEGER NOT NULL DEFAULT 0,
  avg_rating NUMERIC(3, 1) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_by_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_url)
);

CREATE INDEX IF NOT EXISTS idx_toolbox_type ON public.toolbox_entries(type);
CREATE INDEX IF NOT EXISTS idx_toolbox_tags ON public.toolbox_entries USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_toolbox_trending ON public.toolbox_entries(mention_count DESC, install_count DESC);

CREATE TABLE IF NOT EXISTS public.toolbox_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES public.toolbox_entries(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, post_id, url)
);

CREATE INDEX IF NOT EXISTS idx_toolbox_mentions_entry ON public.toolbox_mentions(entry_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_mentions_post ON public.toolbox_mentions(post_id);

CREATE TABLE IF NOT EXISTS public.toolbox_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES public.toolbox_entries(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.toolbox_compat_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES public.toolbox_entries(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN (
    'claude_code', 'claude_desktop', 'cursor', 'codex_cli', 'chatgpt', 'gemini_cli'
  )),
  works BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, member_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_toolbox_reviews_entry ON public.toolbox_reviews(entry_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_compat_entry ON public.toolbox_compat_votes(entry_id);

-- =====================
-- UPDATED_AT TRIGGERS
-- =====================

DROP TRIGGER IF EXISTS update_members_updated_at ON public.members;
CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_assets_updated_at ON public.assets;
CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_post_comments_updated_at ON public.post_comments;
CREATE TRIGGER update_post_comments_updated_at
  BEFORE UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_archive_collections_updated_at ON public.archive_collections;
CREATE TRIGGER update_archive_collections_updated_at
  BEFORE UPDATE ON public.archive_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_brain_archive_items_updated_at ON public.brain_archive_items;
CREATE TRIGGER update_brain_archive_items_updated_at
  BEFORE UPDATE ON public.brain_archive_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_meetups_updated_at ON public.meetups;
CREATE TRIGGER update_meetups_updated_at
  BEFORE UPDATE ON public.meetups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_meetup_rsvps_updated_at ON public.meetup_rsvps;
CREATE TRIGGER update_meetup_rsvps_updated_at
  BEFORE UPDATE ON public.meetup_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_toolbox_entries_updated_at ON public.toolbox_entries;
CREATE TRIGGER update_toolbox_entries_updated_at
  BEFORE UPDATE ON public.toolbox_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_toolbox_reviews_updated_at ON public.toolbox_reviews;
CREATE TRIGGER update_toolbox_reviews_updated_at
  BEFORE UPDATE ON public.toolbox_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_site_config_updated_at ON public.site_config;
CREATE TRIGGER update_site_config_updated_at
  BEFORE UPDATE ON public.site_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================
-- AUTH / INVITE RPCs
-- =====================

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$;

DROP FUNCTION IF EXISTS public.create_member_invite_codes(UUID);

CREATE OR REPLACE FUNCTION public.create_member_invite_codes(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_count INTEGER := 2;
  existing_count INTEGER;
  new_code TEXT;
  cfg TEXT;
BEGIN
  SELECT value INTO cfg
  FROM public.site_config
  WHERE key = 'invites_per_member';

  IF cfg IS NOT NULL AND cfg ~ '^[0-9]+$' THEN
    target_count := cfg::INTEGER;
  END IF;

  SELECT COUNT(*) INTO existing_count
  FROM public.invite_codes
  WHERE created_by_id = p_member_id;

  WHILE existing_count < target_count LOOP
    LOOP
      new_code := public.generate_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invite_codes WHERE code = new_code);
    END LOOP;

    INSERT INTO public.invite_codes (code, created_by_id)
    VALUES (new_code, p_member_id);

    existing_count := existing_count + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_member_signup_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.signup_completed_at IS NOT NULL THEN
      PERFORM public.create_member_invite_codes(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.signup_completed_at IS NOT NULL AND OLD.signup_completed_at IS NULL THEN
      PERFORM public.create_member_invite_codes(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_signup_complete_insert_trigger ON public.members;
CREATE TRIGGER member_signup_complete_insert_trigger
  AFTER INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.on_member_signup_complete();

DROP TRIGGER IF EXISTS member_signup_complete_update_trigger ON public.members;
CREATE TRIGGER member_signup_complete_update_trigger
  AFTER UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.on_member_signup_complete();

-- New auth user → waitlist + incomplete member row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display TEXT;
  v_avatar TEXT;
BEGIN
  v_display := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'user'
  );
  v_avatar := NEW.raw_user_meta_data->>'avatar_url';

  INSERT INTO public.waitlist (auth_id, email, display_name, avatar_url)
  VALUES (NEW.id, NEW.email, v_display, v_avatar)
  ON CONFLICT (auth_id) DO NOTHING;

  INSERT INTO public.members (
    auth_id, email, display_name, avatar_url, signup_completed_at
  )
  VALUES (NEW.id, NEW.email, v_display, v_avatar, NULL)
  ON CONFLICT (auth_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.ensure_waitlist()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  u RECORD;
  v_display TEXT;
  v_avatar TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT id, email, raw_user_meta_data
  INTO u
  FROM auth.users
  WHERE id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_display := COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1),
    'user'
  );
  v_avatar := u.raw_user_meta_data->>'avatar_url';

  INSERT INTO public.waitlist (auth_id, email, display_name, avatar_url)
  VALUES (uid, u.email, v_display, v_avatar)
  ON CONFLICT (auth_id) DO NOTHING;

  INSERT INTO public.members (
    auth_id, email, display_name, avatar_url, signup_completed_at
  )
  VALUES (uid, u.email, v_display, v_avatar, NULL)
  ON CONFLICT (auth_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_invite(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_code TEXT := upper(trim(p_code));
  v_member public.members%ROWTYPE;
  v_invite public.invite_codes%ROWTYPE;
  v_creator public.members%ROWTYPE;
  v_waitlist public.waitlist%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.');
  END IF;

  IF v_code IS NULL OR length(v_code) <> 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', '유효하지 않은 초대 코드입니다.');
  END IF;

  -- Ensure incomplete member / waitlist rows exist
  PERFORM public.ensure_waitlist();

  SELECT * INTO v_member FROM public.members WHERE auth_id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '멤버 레코드를 찾을 수 없습니다.');
  END IF;

  IF v_member.signup_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '이미 가입이 완료되었습니다.');
  END IF;

  SELECT * INTO v_invite
  FROM public.invite_codes
  WHERE code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '존재하지 않는 초대 코드입니다.');
  END IF;

  IF v_invite.used_by_id IS NOT NULL OR v_invite.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '이미 사용된 초대 코드입니다.');
  END IF;

  SELECT * INTO v_creator FROM public.members WHERE id = v_invite.created_by_id;
  IF v_creator.signup_completed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '아직 활성화되지 않은 초대 코드입니다.');
  END IF;

  SELECT * INTO v_waitlist FROM public.waitlist WHERE auth_id = uid;

  UPDATE public.members
  SET
    display_name = COALESCE(v_waitlist.display_name, display_name),
    avatar_url = COALESCE(v_waitlist.avatar_url, avatar_url),
    invited_by_id = v_invite.created_by_id,
    invite_code_used = v_code,
    signup_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  UPDATE public.invite_codes
  SET used_by_id = v_member.id, used_at = NOW()
  WHERE id = v_invite.id;

  DELETE FROM public.waitlist WHERE auth_id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', v_member.id,
      'display_name', v_member.display_name,
      'email', v_member.email
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_site_config()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  r RECORD;
BEGIN
  FOR r IN SELECT key, value FROM public.site_config LOOP
    result := result || jsonb_build_object(r.key, r.value);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_active_members()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.members
  WHERE signup_completed_at IS NOT NULL
    AND is_banned = FALSE;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_member_invite_codes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_waitlist() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_completed_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;

-- =====================
-- ROW LEVEL SECURITY
-- =====================

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_archive_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_archive_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetup_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetup_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toolbox_compat_votes ENABLE ROW LEVEL SECURITY;

-- ---- members ----
DROP POLICY IF EXISTS "Members can view all members" ON public.members;
DROP POLICY IF EXISTS "Users can update own member record" ON public.members;
DROP POLICY IF EXISTS "Users can view own member record" ON public.members;
DROP POLICY IF EXISTS members_select_completed ON public.members;
DROP POLICY IF EXISTS members_select_own ON public.members;
DROP POLICY IF EXISTS members_update_own ON public.members;

CREATE POLICY members_select_completed ON public.members
  FOR SELECT TO authenticated
  USING (public.is_completed_member() OR auth_id = auth.uid());

CREATE POLICY members_update_own ON public.members
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- ---- waitlist ----
DROP POLICY IF EXISTS "Service role manages waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Users can view own waitlist entry" ON public.waitlist;
DROP POLICY IF EXISTS waitlist_select_own ON public.waitlist;

CREATE POLICY waitlist_select_own ON public.waitlist
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

-- ---- invite_codes ----
DROP POLICY IF EXISTS "Members can view own invite codes" ON public.invite_codes;
DROP POLICY IF EXISTS "Service role manages invite codes" ON public.invite_codes;
DROP POLICY IF EXISTS invite_codes_select_own ON public.invite_codes;

CREATE POLICY invite_codes_select_own ON public.invite_codes
  FOR SELECT TO authenticated
  USING (created_by_id = public.current_member_id());

-- ---- posts ----
DROP POLICY IF EXISTS "Completed members can view posts" ON public.posts;
DROP POLICY IF EXISTS "Members can create posts" ON public.posts;
DROP POLICY IF EXISTS "Authors can update own posts" ON public.posts;
DROP POLICY IF EXISTS "Admins can manage all posts" ON public.posts;
DROP POLICY IF EXISTS posts_select ON public.posts;
DROP POLICY IF EXISTS posts_insert ON public.posts;
DROP POLICY IF EXISTS posts_update ON public.posts;
DROP POLICY IF EXISTS posts_admin_all ON public.posts;

CREATE POLICY posts_select ON public.posts
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    AND (is_hidden = FALSE OR author_id = public.current_member_id()
         OR EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin))
  );

CREATE POLICY posts_insert ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND author_id = public.current_member_id()
  );

CREATE POLICY posts_update ON public.posts
  FOR UPDATE TO authenticated
  USING (
    author_id = public.current_member_id()
    OR EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin)
  );

-- ---- assets ----
DROP POLICY IF EXISTS "Completed members can view assets" ON public.assets;
DROP POLICY IF EXISTS "Authors can manage post assets" ON public.assets;
DROP POLICY IF EXISTS assets_select ON public.assets;
DROP POLICY IF EXISTS assets_write ON public.assets;

CREATE POLICY assets_select ON public.assets
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = assets.post_id
        AND (p.is_hidden = FALSE OR p.author_id = public.current_member_id())
    )
  );

CREATE POLICY assets_write ON public.assets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = assets.post_id AND p.author_id = public.current_member_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = assets.post_id AND p.author_id = public.current_member_id()
    )
  );

-- ---- post_votes ----
DROP POLICY IF EXISTS post_votes_select ON public.post_votes;
DROP POLICY IF EXISTS post_votes_insert ON public.post_votes;
DROP POLICY IF EXISTS post_votes_delete ON public.post_votes;

CREATE POLICY post_votes_select ON public.post_votes
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY post_votes_insert ON public.post_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND member_id = public.current_member_id()
  );

CREATE POLICY post_votes_delete ON public.post_votes
  FOR DELETE TO authenticated
  USING (member_id = public.current_member_id());

-- ---- post_comments ----
DROP POLICY IF EXISTS post_comments_select ON public.post_comments;
DROP POLICY IF EXISTS post_comments_insert ON public.post_comments;
DROP POLICY IF EXISTS post_comments_update ON public.post_comments;
DROP POLICY IF EXISTS post_comments_delete ON public.post_comments;

CREATE POLICY post_comments_select ON public.post_comments
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY post_comments_insert ON public.post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND member_id = public.current_member_id()
  );

CREATE POLICY post_comments_update ON public.post_comments
  FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id());

CREATE POLICY post_comments_delete ON public.post_comments
  FOR DELETE TO authenticated
  USING (member_id = public.current_member_id());

-- ---- legacy archive (owner only) ----
DROP POLICY IF EXISTS "Owners can manage archive folders" ON public.archive_folders;
DROP POLICY IF EXISTS "Owners can manage archive items" ON public.archive_items;
DROP POLICY IF EXISTS archive_folders_owner ON public.archive_folders;
DROP POLICY IF EXISTS archive_items_owner ON public.archive_items;

CREATE POLICY archive_folders_owner ON public.archive_folders
  FOR ALL TO authenticated
  USING (owner_id = public.current_member_id())
  WITH CHECK (owner_id = public.current_member_id());

CREATE POLICY archive_items_owner ON public.archive_items
  FOR ALL TO authenticated
  USING (owner_id = public.current_member_id())
  WITH CHECK (owner_id = public.current_member_id());

-- ---- brain archive ----
DROP POLICY IF EXISTS brain_items_owner ON public.brain_archive_items;
DROP POLICY IF EXISTS brain_items_shared_select ON public.brain_archive_items;
DROP POLICY IF EXISTS collections_owner ON public.archive_collections;
DROP POLICY IF EXISTS collections_shared_select ON public.archive_collections;
DROP POLICY IF EXISTS highlights_owner ON public.archive_highlights;
DROP POLICY IF EXISTS brain_ci_owner ON public.brain_archive_collection_items;
DROP POLICY IF EXISTS brain_ci_shared_select ON public.brain_archive_collection_items;

CREATE POLICY brain_items_owner ON public.brain_archive_items
  FOR ALL TO authenticated
  USING (owner_id = public.current_member_id())
  WITH CHECK (owner_id = public.current_member_id());

CREATE POLICY brain_items_shared_select ON public.brain_archive_items
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    AND EXISTS (
      SELECT 1
      FROM public.brain_archive_collection_items ci
      JOIN public.archive_collections c ON c.id = ci.collection_id
      WHERE ci.item_id = brain_archive_items.id AND c.is_shared = TRUE
    )
  );

CREATE POLICY collections_owner ON public.archive_collections
  FOR ALL TO authenticated
  USING (owner_id = public.current_member_id())
  WITH CHECK (owner_id = public.current_member_id());

CREATE POLICY collections_shared_select ON public.archive_collections
  FOR SELECT TO authenticated
  USING (public.is_completed_member() AND is_shared = TRUE);

CREATE POLICY brain_ci_owner ON public.brain_archive_collection_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.archive_collections c
      WHERE c.id = collection_id AND c.owner_id = public.current_member_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.archive_collections c
      WHERE c.id = collection_id AND c.owner_id = public.current_member_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.brain_archive_items i
      WHERE i.id = item_id AND i.owner_id = public.current_member_id()
    )
  );

CREATE POLICY brain_ci_shared_select ON public.brain_archive_collection_items
  FOR SELECT TO authenticated
  USING (
    public.is_completed_member()
    AND EXISTS (
      SELECT 1 FROM public.archive_collections c
      WHERE c.id = collection_id AND c.is_shared = TRUE
    )
  );

CREATE POLICY highlights_owner ON public.archive_highlights
  FOR ALL TO authenticated
  USING (owner_id = public.current_member_id())
  WITH CHECK (owner_id = public.current_member_id());

-- ---- api_tokens ----
DROP POLICY IF EXISTS "Owners can manage API tokens" ON public.api_tokens;
DROP POLICY IF EXISTS api_tokens_owner ON public.api_tokens;

CREATE POLICY api_tokens_owner ON public.api_tokens
  FOR ALL TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());

-- ---- reports ----
DROP POLICY IF EXISTS "Members can create reports" ON public.reports;
DROP POLICY IF EXISTS "Admins can view and manage reports" ON public.reports;
DROP POLICY IF EXISTS reports_insert ON public.reports;
DROP POLICY IF EXISTS reports_admin ON public.reports;
DROP POLICY IF EXISTS reports_select_own ON public.reports;

CREATE POLICY reports_insert ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND reporter_id = public.current_member_id()
  );

CREATE POLICY reports_select_own ON public.reports
  FOR SELECT TO authenticated
  USING (
    reporter_id = public.current_member_id()
    OR EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin)
  );

CREATE POLICY reports_admin ON public.reports
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin));

-- ---- site_settings / site_config ----
DROP POLICY IF EXISTS "Admins can manage settings" ON public.site_settings;
DROP POLICY IF EXISTS site_settings_admin ON public.site_settings;
DROP POLICY IF EXISTS site_config_select ON public.site_config;
DROP POLICY IF EXISTS site_config_admin ON public.site_config;

CREATE POLICY site_settings_admin ON public.site_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin));

CREATE POLICY site_config_select ON public.site_config
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY site_config_admin ON public.site_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin));

-- ---- meetups ----
DROP POLICY IF EXISTS meetups_select ON public.meetups;
DROP POLICY IF EXISTS meetups_insert ON public.meetups;
DROP POLICY IF EXISTS meetups_update ON public.meetups;

CREATE POLICY meetups_select ON public.meetups
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY meetups_insert ON public.meetups
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND host_id = public.current_member_id()
  );

CREATE POLICY meetups_update ON public.meetups
  FOR UPDATE TO authenticated
  USING (host_id = public.current_member_id());

DROP POLICY IF EXISTS meetup_rsvps_select ON public.meetup_rsvps;
DROP POLICY IF EXISTS meetup_rsvps_insert ON public.meetup_rsvps;
DROP POLICY IF EXISTS meetup_rsvps_update ON public.meetup_rsvps;

CREATE POLICY meetup_rsvps_select ON public.meetup_rsvps
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY meetup_rsvps_insert ON public.meetup_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND member_id = public.current_member_id()
  );

CREATE POLICY meetup_rsvps_update ON public.meetup_rsvps
  FOR UPDATE TO authenticated
  USING (
    member_id = public.current_member_id()
    OR EXISTS (
      SELECT 1 FROM public.meetups m
      WHERE m.id = meetup_id AND m.host_id = public.current_member_id()
    )
  );

DROP POLICY IF EXISTS meetup_announcements_select ON public.meetup_announcements;
DROP POLICY IF EXISTS meetup_announcements_insert ON public.meetup_announcements;

CREATE POLICY meetup_announcements_select ON public.meetup_announcements
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY meetup_announcements_insert ON public.meetup_announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetups m
      WHERE m.id = meetup_id AND m.host_id = public.current_member_id()
    )
  );

-- ---- products ----
DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_insert ON public.products;
DROP POLICY IF EXISTS products_update ON public.products;

CREATE POLICY products_select ON public.products
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY products_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND public.current_member_id() = ANY (maker_ids)
  );

CREATE POLICY products_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.current_member_id() = ANY (maker_ids));

DROP POLICY IF EXISTS product_upvotes_select ON public.product_upvotes;
DROP POLICY IF EXISTS product_upvotes_insert ON public.product_upvotes;
DROP POLICY IF EXISTS product_upvotes_delete ON public.product_upvotes;

CREATE POLICY product_upvotes_select ON public.product_upvotes
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY product_upvotes_insert ON public.product_upvotes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND member_id = public.current_member_id()
  );

CREATE POLICY product_upvotes_delete ON public.product_upvotes
  FOR DELETE TO authenticated
  USING (member_id = public.current_member_id());

DROP POLICY IF EXISTS product_comments_select ON public.product_comments;
DROP POLICY IF EXISTS product_comments_insert ON public.product_comments;
DROP POLICY IF EXISTS product_comments_update ON public.product_comments;
DROP POLICY IF EXISTS product_comments_delete ON public.product_comments;

CREATE POLICY product_comments_select ON public.product_comments
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY product_comments_insert ON public.product_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND member_id = public.current_member_id()
  );

CREATE POLICY product_comments_update ON public.product_comments
  FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id());

CREATE POLICY product_comments_delete ON public.product_comments
  FOR DELETE TO authenticated
  USING (member_id = public.current_member_id());

DROP POLICY IF EXISTS product_updates_select ON public.product_updates;
DROP POLICY IF EXISTS product_updates_insert ON public.product_updates;

CREATE POLICY product_updates_select ON public.product_updates
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY product_updates_insert ON public.product_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.current_member_id() = ANY (p.maker_ids)
    )
  );

-- ---- toolbox ----
DROP POLICY IF EXISTS toolbox_entries_select ON public.toolbox_entries;
DROP POLICY IF EXISTS toolbox_entries_insert ON public.toolbox_entries;
DROP POLICY IF EXISTS toolbox_entries_update ON public.toolbox_entries;

CREATE POLICY toolbox_entries_select ON public.toolbox_entries
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY toolbox_entries_insert ON public.toolbox_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND created_by_id = public.current_member_id()
  );

CREATE POLICY toolbox_entries_update ON public.toolbox_entries
  FOR UPDATE TO authenticated
  USING (
    created_by_id = public.current_member_id()
    OR EXISTS (SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin)
  );

DROP POLICY IF EXISTS toolbox_mentions_select ON public.toolbox_mentions;
DROP POLICY IF EXISTS toolbox_mentions_insert ON public.toolbox_mentions;

CREATE POLICY toolbox_mentions_select ON public.toolbox_mentions
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY toolbox_mentions_insert ON public.toolbox_mentions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_completed_member());

DROP POLICY IF EXISTS toolbox_reviews_select ON public.toolbox_reviews;
DROP POLICY IF EXISTS toolbox_reviews_insert ON public.toolbox_reviews;
DROP POLICY IF EXISTS toolbox_reviews_update ON public.toolbox_reviews;

CREATE POLICY toolbox_reviews_select ON public.toolbox_reviews
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY toolbox_reviews_insert ON public.toolbox_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND member_id = public.current_member_id()
  );

CREATE POLICY toolbox_reviews_update ON public.toolbox_reviews
  FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id());

DROP POLICY IF EXISTS toolbox_compat_select ON public.toolbox_compat_votes;
DROP POLICY IF EXISTS toolbox_compat_insert ON public.toolbox_compat_votes;
DROP POLICY IF EXISTS toolbox_compat_update ON public.toolbox_compat_votes;

CREATE POLICY toolbox_compat_select ON public.toolbox_compat_votes
  FOR SELECT TO authenticated
  USING (public.is_completed_member());

CREATE POLICY toolbox_compat_insert ON public.toolbox_compat_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_completed_member()
    AND member_id = public.current_member_id()
  );

CREATE POLICY toolbox_compat_update ON public.toolbox_compat_votes
  FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id());
