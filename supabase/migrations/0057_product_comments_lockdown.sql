-- 0057 clients stop reading product_comments.member_id / nickname_profile_id (app reads
-- public_member_id + nickname_id since the 0056 deploy).
REVOKE SELECT ON public.product_comments FROM authenticated, anon;
GRANT SELECT (id, product_id, posted_as, body, created_at, public_member_id, nickname_id) ON public.product_comments TO authenticated;
