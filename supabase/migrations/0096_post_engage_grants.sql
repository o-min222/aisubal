-- A39 follow-up: posts uses column-level SELECT grants; the feed reads reaction_count and the
-- 인기 sort orders by engage_count, so the signed-in role needs both (counts only).
grant select (reaction_count, engage_count) on public.posts to authenticated;
