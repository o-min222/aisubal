-- P0: since 0065 (B14) every post and reply failed with "permission denied for table posts".
-- createPost always sends as_group_id (null unless posting as a group), but 0065 granted only
-- SELECT on the new column, not INSERT. posts__as_group() already enforces who may set it
-- (owner/mod of that group, root posts only) and nulls it for everything else.
grant insert (as_group_id) on public.posts to authenticated;
