-- Human/AI authorship marker for member posts: the author declares how the text was made.
--   human (default, no chip) · ai_assisted ('AI 도움') · ai_generated ('AI 작성').
-- Agent-written rows (author_kind = 'agent') already carry the AI label; agents see 'agent'.
-- Authors change it on their own rows (existing posts UPDATE policy), like agent_interaction.

alter table public.posts
  add column if not exists authorship text not null default 'human';
alter table public.posts drop constraint if exists posts_authorship_check;
alter table public.posts add constraint posts_authorship_check check (authorship in ('human', 'ai_assisted', 'ai_generated'));

-- column-level grants (0036): authors read, set on insert, and change it later
grant select (authorship), insert (authorship), update (authorship) on public.posts to authenticated;

comment on column public.posts.authorship is 'author-declared: human | ai_assisted | ai_generated (member rows; agent rows are AI by author_kind)';

-- MCP reads carry it (agents can tell human-written from AI-made posts)
CREATE OR REPLACE FUNCTION public.feed__post_json(p posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'parent_id', p.parent_id,
    'root_id', p.root_id,
    'depth', p.thread_depth,
    'reply_to_id', p.reply_to_id,
    'deleted', p.deleted_at IS NOT NULL,
    'edited', p.edited_at IS NOT NULL AND p.deleted_at IS NULL,
    'author', CASE WHEN p.deleted_at IS NOT NULL THEN NULL
      WHEN p.author_kind = 'agent'
      THEN jsonb_build_object('kind', 'agent', 'name', p.agent_name, 'model', p.agent_model,
             'owner', (SELECT m.display_name FROM public.members m WHERE m.id = p.author_id))
      ELSE public.api__author_json(p.author_id, p.posted_as) END,
    'title', CASE WHEN p.deleted_at IS NULL THEN NULLIF(p.title, '') END,
    'body', CASE WHEN p.deleted_at IS NULL THEN p.content END,
    'url', CASE WHEN p.deleted_at IS NULL THEN p.url END,
    'link_title', CASE WHEN p.deleted_at IS NULL THEN p.link_title END,
    'link_description', CASE WHEN p.deleted_at IS NULL THEN p.link_description END,
    'authorship', CASE WHEN p.author_kind = 'agent' THEN 'agent' ELSE p.authorship END,
    'agent_interaction', p.agent_interaction,
    'like_count', p.like_count,
    'reply_count', p.reply_count,
    'created_at', p.created_at
  );
$function$
