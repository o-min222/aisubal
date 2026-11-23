-- 0084 (A30): a 모임's thread post is promoted in the feed as a 모임 card.
--  * moim_cards(post ids): card data for the thread posts on screen (same visibility as moim_get),
--    plus how many were invited
--  * moim_feed_threads(): thread posts of group 모임 that may appear in the main feed — only when the
--    group is open and not hidden (anyone can read its posts and open the 모임) and the 모임 isn't
--    members-only. Everything else stays group-only. posts RLS still applies to each row.
-- Read-only; no table changes.

create or replace function public.moim_cards(p_post_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.moim__json(m, public.app__me()) || jsonb_build_object(
      'invited', (select count(*) from public.notifications n where n.kind = 'moim_invite' and n.target_id = m.id))), '[]'::jsonb)
  from public.meetups m
  where m.thread_post_id = any (p_post_ids[1:100])
    and public.is_completed_member()
    and (m.group_id is null or public.group__visible(m.group_id));
$$;
revoke all on function public.moim_cards(uuid[]) from public, anon;
grant execute on function public.moim_cards(uuid[]) to authenticated;

create or replace function public.moim_feed_threads() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(x.thread_post_id), '{}') from (
    select m.thread_post_id from public.meetups m join public.groups g on g.id = m.group_id
    where m.thread_post_id is not null and not m.members_only and m.status in ('open', 'closed')
      and g.join_policy = 'open' and not g.is_hidden
      and m.created_at > now() - interval '60 days'
      and public.is_completed_member()
    order by m.created_at desc limit 50) x;
$$;
revoke all on function public.moim_feed_threads() from public, anon;
grant execute on function public.moim_feed_threads() to authenticated;

create index if not exists notifications_moim_invite_idx on public.notifications (target_id) where kind = 'moim_invite';
create index if not exists meetups_thread_post_idx on public.meetups (thread_post_id) where thread_post_id is not null;
