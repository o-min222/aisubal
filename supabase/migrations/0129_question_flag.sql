-- A97 (Colin t334u/t335u, revises A93): a question is what the author marked with the composer's
-- 질문해요 button, not what the text starts with.
-- * posts.is_question (default false), set on insert only: authenticated gets column select + insert,
--   never update, so a post can't be turned into (or out of) a question afterwards.
-- * Only a root, real-name, non-group member post can be a question (posts_question_kind_chk), the same
--   posts A93's fan-out already limited itself to.
-- * question__fanout_due now keys on the flag instead of post__is_question(content); everything else
--   (visibility via post__can_see, friends + followers, banned/unfinished skipped, 'following' prefs, the
--   per-day cap, once per post, the follow_post hand-off) is unchanged from 0127.
-- * Backfill: existing root real-name posts that open with the old starter get the flag (the fan-out already
--   ran or was skipped for them, and the trigger is insert-only, so nothing is sent). The app hides the
--   starter text on a flagged post so the 질문 tag isn't doubled.
-- post__is_question stays (the backfill and post__question_line's starter-stripping use it).

alter table public.posts add column if not exists is_question boolean not null default false;

update public.posts set is_question = true
 where not is_question and public.post__is_question(content)
   and parent_id is null and group_id is null and as_group_id is null and posted_as = 'real' and author_kind = 'member' and deleted_at is null;

alter table public.posts drop constraint if exists posts_question_kind_chk;
alter table public.posts add constraint posts_question_kind_chk check (
  not is_question or (parent_id is null and group_id is null and as_group_id is null and posted_as = 'real' and author_kind = 'member'));

grant select (is_question), insert (is_question) on public.posts to authenticated;

create or replace function public.question__fanout_due(p public.posts) returns boolean
language plpgsql stable security definer set search_path to ''
as $$
declare v_cap integer; v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not p.is_question or p.parent_id is not null or p.group_id is not null or p.author_kind <> 'member' or p.posted_as <> 'real'
     or p.is_hidden or p.deleted_at is not null or coalesce(p.visibility, 'members') = 'private' then return false; end if;
  if exists (select 1 from public.question_fanouts q where q.post_id = p.id) then return false; end if;
  if not exists (select 1 from public.members m where m.id = p.author_id and m.signup_completed_at is not null and not m.is_banned) then return false; end if;
  select coalesce((select case when value ~ '^[0-9]{1,3}$' then value::int end from public.site_config where key = 'question_fanout_daily_cap'), 3) into v_cap;
  return (select count(*) from public.question_fanouts q
           where q.author_id = p.author_id and (q.created_at at time zone 'Asia/Seoul')::date = v_day) < v_cap;
end;
$$;
revoke all on function public.question__fanout_due(public.posts) from public, anon, authenticated;
