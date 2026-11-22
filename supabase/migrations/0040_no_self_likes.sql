-- N-2: nobody likes their own post — not the author, not the author's own agent
-- (agent likes carry the token owner in member_id), and not on the 익명 board.
CREATE OR REPLACE FUNCTION public.likes__no_self()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_owner UUID;
BEGIN
  IF TG_TABLE_NAME = 'post_likes' THEN
    SELECT p.author_id INTO v_owner FROM public.posts p WHERE p.id = NEW.post_id;
  ELSIF TG_TABLE_NAME = 'agora_likes' THEN
    SELECT p.owner_member_id INTO v_owner FROM public.agora_posts p WHERE p.id = NEW.post_id;
  ELSE
    SELECT a.member_id INTO v_owner FROM anon_private.post_authors a WHERE a.post_id = NEW.post_id;
  END IF;
  IF v_owner IS NOT NULL AND NEW.member_id = v_owner THEN
    RAISE EXCEPTION 'self_like' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.likes__no_self() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS post_likes_no_self ON public.post_likes;
CREATE TRIGGER post_likes_no_self BEFORE INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.likes__no_self();
DROP TRIGGER IF EXISTS agora_likes_no_self ON public.agora_likes;
CREATE TRIGGER agora_likes_no_self BEFORE INSERT ON public.agora_likes FOR EACH ROW EXECUTE FUNCTION public.likes__no_self();
DROP TRIGGER IF EXISTS anon_likes_no_self ON anon_private.likes;
CREATE TRIGGER anon_likes_no_self BEFORE INSERT ON anon_private.likes FOR EACH ROW EXECUTE FUNCTION public.likes__no_self();

-- drop any self-likes that slipped in earlier, then recount from the like rows
DELETE FROM public.post_likes l USING public.posts p WHERE p.id = l.post_id AND l.member_id = p.author_id;
DELETE FROM public.agora_likes l USING public.agora_posts p WHERE p.id = l.post_id AND l.member_id = p.owner_member_id;
DELETE FROM anon_private.likes l USING anon_private.post_authors a WHERE a.post_id = l.post_id AND l.member_id = a.member_id;

UPDATE public.posts p SET like_count = c.n
  FROM (SELECT p2.id, (SELECT count(*) FROM public.post_likes l WHERE l.post_id = p2.id)::int n FROM public.posts p2) c
 WHERE c.id = p.id AND p.like_count <> c.n;
UPDATE public.agora_posts p SET like_count = c.n
  FROM (SELECT p2.id, (SELECT count(*) FROM public.agora_likes l WHERE l.post_id = p2.id)::int n FROM public.agora_posts p2) c
 WHERE c.id = p.id AND p.like_count <> c.n;
UPDATE public.anon_posts p SET like_count = c.n
  FROM (SELECT p2.id, (SELECT count(*) FROM anon_private.likes l WHERE l.post_id = p2.id)::int n FROM public.anon_posts p2) c
 WHERE c.id = p.id AND p.like_count <> c.n;
