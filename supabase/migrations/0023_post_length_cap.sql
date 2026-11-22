-- Feed + 익명 posts: no product-level character limit, only a server-side sanity cap.
-- (Agent-written text, Agora and feed_agent_reply, keeps its own 500-char limit.)

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_content_len;
ALTER TABLE public.posts ADD CONSTRAINT posts_content_len CHECK (char_length(content) <= 20000) NOT VALID;
ALTER TABLE public.posts VALIDATE CONSTRAINT posts_content_len;

ALTER TABLE public.anon_posts DROP CONSTRAINT IF EXISTS anon_posts_body_len;
ALTER TABLE public.anon_posts ADD CONSTRAINT anon_posts_body_len
  CHECK (is_deleted OR (char_length(btrim(body)) >= 1 AND char_length(btrim(body)) <= 20000));

-- anon_create: was LEAST(cfg 'anon_post_max_chars', 1000); now the fixed 20k sanity cap.
DO $$
DECLARE v_def text := pg_get_functiondef('public.anon_create(text, text, uuid)'::regprocedure);
BEGIN
  IF position('LEAST(v_max, 1000)' IN v_def) > 0 THEN
    EXECUTE replace(v_def, 'LEAST(v_max, 1000)', '20000');
  END IF;
END $$;
