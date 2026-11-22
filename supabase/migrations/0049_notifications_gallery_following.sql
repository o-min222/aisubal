-- Notifications, round 2 (Colin's list): gallery submission outcomes and new posts by
-- people I follow, each with its own toggle.
-- * gallery: AI 추천 (pending, waiting for an admin), 승인, AI 추천 → 승인 확정, 반려 (with the reason).
--   The reviewer stays unnamed; the submitter just sees the outcome.
-- * following: top-level posts in the main feed under the real profile (no 부캐 / group /
--   agent posts). Batched: while a follower hasn't read it, more posts by the same person
--   within 24h fold into ONE row ('A님이 새 글 3개를 올렸어요', link → their profile).

alter table public.notifications add column if not exists item_count int not null default 1;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'comment', 'reply', 'like', 'follow', 'friend_request', 'friend_accept', 'invite_joined', 'agent_reply', 'agent_like',
  'gallery_recommended', 'gallery_approved', 'gallery_confirmed', 'gallery_rejected', 'follow_post'));
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (category in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following'));
alter table public.notifications drop constraint if exists notifications_target_kind_check;
alter table public.notifications add constraint notifications_target_kind_check check (target_kind in ('post', 'agora', 'anon', 'member', 'submission'));
create index if not exists notifications_follow_post_idx on public.notifications(actor_member_id, recipient_id) where kind = 'follow_post' and read_at is null;

alter table public.notification_prefs add column if not exists gallery boolean not null default true;
alter table public.notification_prefs add column if not exists following boolean not null default true;

-- ---------------------------------------------------------------- gallery submissions
create or replace function public.notify__tool_submission() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare v_slug text; v_excerpt text;
begin
  if new.ai_recommended_at is not null and old.ai_recommended_at is null and new.status = 'pending' then
    perform public.notify__push(new.submitter_id, 'gallery_recommended', 'gallery', 'agent', null, new.ai_recommended_label, null,
      'submission', new.id, null, '/gallery/submissions?open=' || new.id, new.name, 'gallery:' || new.id || ':recommended');
  end if;
  if old.status = 'pending' and new.status = 'approved' then
    select e.slug into v_slug from public.toolbox_entries e where e.id = new.entry_id;
    perform public.notify__push(new.submitter_id,
      case when new.ai_recommended_at is not null then 'gallery_confirmed' else 'gallery_approved' end, 'gallery', 'someone', null, null, null,
      'submission', new.id, null, coalesce('/gallery/' || v_slug, '/gallery/submissions?open=' || new.id), new.name, 'gallery:' || new.id || ':approved');
  elsif old.status = 'pending' and new.status = 'rejected' then
    v_excerpt := new.name || coalesce(' — ' || nullif(btrim(new.reason), ''), '');
    perform public.notify__push(new.submitter_id, 'gallery_rejected', 'gallery', 'someone', null, null, null,
      'submission', new.id, null, '/gallery/submissions?open=' || new.id, v_excerpt, 'gallery:' || new.id || ':rejected');
  end if;
  return null;
end;
$$;
drop trigger if exists tool_submissions_notify on public.tool_submissions;
create trigger tool_submissions_notify after update of status, ai_recommended_at on public.tool_submissions
  for each row execute function public.notify__tool_submission();

-- ---------------------------------------------------------------- new posts by people I follow
create or replace function public.notify__follow_post() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare v_handle text; v_excerpt text; v_post_link text := '/posts/' || new.id;
begin
  if new.parent_id is not null or new.group_id is not null or new.author_kind <> 'member' or new.posted_as <> 'real'
     or new.is_hidden or new.deleted_at is not null then return null; end if;
  select m.handle into v_handle from public.members m where m.id = new.author_id;
  v_excerpt := left(coalesce(nullif(btrim(new.title), ''), new.content), 140);
  -- fold into the follower's unread row from the last 24h
  update public.notifications n
     set item_count = n.item_count + 1, created_at = now(), target_id = new.id, source_id = new.id, excerpt = v_excerpt,
         link = coalesce('/u/' || v_handle, v_post_link)
   where n.kind = 'follow_post' and n.actor_member_id = new.author_id and n.read_at is null
     and n.created_at > now() - interval '24 hours'
     and n.recipient_id in (select f.follower_id from public.follows f where f.followee_id = new.author_id);
  insert into public.notifications(recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, source_id, link, excerpt)
  select f.follower_id, 'follow_post', 'following', 'member', new.author_id, 'post', new.id, new.id, v_post_link, v_excerpt
    from public.follows f
    join public.members m on m.id = f.follower_id and m.signup_completed_at is not null and not m.is_banned
    left join public.notification_prefs p on p.member_id = f.follower_id
   where f.followee_id = new.author_id and f.follower_id <> new.author_id and coalesce(p.following, true)
     and not exists (select 1 from public.notifications n where n.recipient_id = f.follower_id and n.kind = 'follow_post'
                       and n.actor_member_id = new.author_id and n.read_at is null and n.created_at > now() - interval '24 hours');
  return null;
end;
$$;
drop trigger if exists posts_notify_follow_post on public.posts;
create trigger posts_notify_follow_post after insert on public.posts for each row execute function public.notify__follow_post();

-- ---------------------------------------------------------------- readers: count = folded posts too
create or replace function public.notifications_list(p_category text default null, p_offset integer default 0, p_limit integer default 20)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare v_me uuid := public.current_member_id(); v_lim int := least(greatest(coalesce(p_limit, 20), 1), 50); v_off int := least(greatest(coalesce(p_offset, 0), 0), 5000);
  v_items jsonb; v_total int; v_unread int;
begin
  if v_me is null then return jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'unread', 0); end if;
  with live as (
    select n.* from public.notifications n
    where n.recipient_id = v_me
      and (p_category is null or n.category = p_category)
      and n.created_at > now() - interval '90 days'
      and (n.source_id is null or n.target_kind not in ('post', 'anon', 'agora') or n.kind in ('like', 'agent_like') or case n.target_kind
        when 'post' then exists (select 1 from public.posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden)
        when 'anon' then exists (select 1 from public.anon_posts s where s.id = n.source_id and not s.is_deleted and not s.is_hidden)
        when 'agora' then exists (select 1 from public.agora_posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden)
        else true end)
  ), grouped as (
    select
      case when kind in ('like', 'agent_like') then 'g:' || target_kind || ':' || target_id else id::text end as gid,
      (array_agg(id order by created_at desc))[1] as id,
      (array_agg(kind order by created_at desc))[1] as kind,
      min(category) as category,
      (array_agg(actor_kind order by created_at desc))[1] as actor_kind,
      (array_agg(actor_member_id order by created_at desc))[1] as actor_member_id,
      (array_agg(actor_label order by created_at desc))[1] as actor_label,
      (array_agg(actor_avatar_url order by created_at desc))[1] as actor_avatar_url,
      min(target_kind) as target_kind,
      (array_agg(link order by created_at desc))[1] as link,
      (array_agg(excerpt order by created_at desc))[1] as excerpt,
      sum(item_count)::int as actor_count,
      max(created_at) as created_at,
      bool_or(read_at is null) as unread
    from live
    group by 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'kind', g.kind, 'category', g.category, 'link', g.link, 'excerpt', g.excerpt,
      'targetKind', g.target_kind, 'count', g.actor_count, 'createdAt', g.created_at, 'unread', g.unread,
      'actor', case
        when g.actor_kind = 'member' and g.actor_member_id is not null then (
          select jsonb_build_object('kind', 'member', 'id', m.id,
            'name', case when m.profile_completed_at is not null then m.display_name else '새 멤버' end,
            'avatarUrl', case when m.profile_completed_at is not null then m.avatar_url end)
          from public.members m where m.id = g.actor_member_id)
        else jsonb_build_object('kind', g.actor_kind, 'id', null, 'name', g.actor_label, 'avatarUrl', g.actor_avatar_url) end
    ) order by g.created_at desc) filter (where g.rn > v_off and g.rn <= v_off + v_lim), '[]'::jsonb),
    count(*)::int
  into v_items, v_total
  from (select grouped.*, row_number() over (order by created_at desc) rn from grouped) g;
  select count(*)::int into v_unread from public.notifications where recipient_id = v_me and read_at is null;
  return jsonb_build_object('items', v_items, 'total', v_total, 'unread', v_unread);
end;
$$;
revoke all on function public.notifications_list(text, integer, integer) from public, anon;
grant execute on function public.notifications_list(text, integer, integer) to authenticated;

create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path to ''
as $$
  select coalesce((select jsonb_build_object('replies', p.replies, 'likes', p.likes, 'social', p.social, 'invites', p.invites,
      'agents', p.agents, 'gallery', p.gallery, 'following', p.following)
    from public.notification_prefs p where p.member_id = public.current_member_id()),
    jsonb_build_object('replies', true, 'likes', true, 'social', true, 'invites', true, 'agents', true, 'gallery', true, 'following', true))
$$;
revoke all on function public.notification_prefs_get() from public, anon;
grant execute on function public.notification_prefs_get() to authenticated;

create or replace function public.notification_prefs_set(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_key not in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following') then raise exception 'bad_pref' using errcode = 'P0001'; end if;
  insert into public.notification_prefs(member_id) values (v_me) on conflict (member_id) do nothing;
  execute format('update public.notification_prefs set %I = $1, updated_at = now() where member_id = $2', p_key) using coalesce(p_on, true), v_me;
  return public.notification_prefs_get();
end;
$$;
revoke all on function public.notification_prefs_set(text, boolean) from public, anon;
grant execute on function public.notification_prefs_set(text, boolean) to authenticated;
