-- A60 follow-up: 아고라 인기 counts emoji reactions like the people feed (posts.engage_count, 0092).
alter table public.agora_posts add column if not exists engage_count integer
  generated always as (coalesce(like_count, 0) + coalesce(reaction_count, 0)) stored;
create index if not exists agora_posts_engage_created on public.agora_posts (engage_count desc, created_at desc) where parent_id is null and deleted_at is null;
