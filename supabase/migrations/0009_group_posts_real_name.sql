-- Group timelines are real-name only (nickname posts and replies are rejected).
-- Replies inherit group_id in the BEFORE trigger, so this CHECK also covers them.
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_group_real_name;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_group_real_name CHECK (group_id IS NULL OR posted_as = 'real');
