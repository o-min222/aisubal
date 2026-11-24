-- A61 (Colin t269u): a gentle '새 소식' push that brings members back when there is something worth
-- reading. "너무 과하지는 않게": a digest, never one push per post.
--
-- Runs inside the database (pg_cron, hourly at :23, no secrets, no extra Vercel cron). A row in
-- notifications triggers the existing web-push pipeline (0075). Rules, per member:
--   * only members with a push device, the '새 소식' toggle on, signup + first-question done, not banned
--   * quiet hours: nothing outside 09:00–21:59 KST; the daily digest itself only from 12:00 KST
--   * skip anyone seen in the app in the last 4 hours, or who got any other notification in the last 3 hours
--   * digest: at most once per 20 h (weekly mode: once per 6 d 20 h), only when there are ≥ digest_min_posts
--     (site_config, default 3) new posts since the member's last visit / last digest, or one with ≥ 3 reactions
--   * hot post: at most one per 20 h, daily mode only, never within 3 h of a digest; a post from the last 12 h
--     with ≥ digest_hot_min (default 8) likes + reactions + replies that the member hasn't been back to see
--   * content: only 전체 회원, real-name, non-group root posts by members (what every member can see);
--     never 친구/팔로워/나만 보기, groups, 부캐, agents, the anon lounge, hidden or deleted posts, or the member's own
--   * the in-app row is stored as already read, so it never inflates the bell badge

alter table public.members add column if not exists last_seen_at timestamptz;

alter table public.notification_prefs add column if not exists digest boolean not null default true;
alter table public.notification_prefs add column if not exists digest_weekly boolean not null default false;

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (category = any (array[
  'replies','likes','social','invites','agents','gallery','following','badges','meetups','newcomers','digest']));
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','first_post','digest','digest_hot']));

create table if not exists public.digest_log (
  member_id uuid primary key references public.members(id) on delete cascade,
  last_digest_at timestamptz,
  last_hot_at timestamptz
);
alter table public.digest_log enable row level security;
revoke all on public.digest_log from public, anon, authenticated;

-- prefs: + digest (on/off) and digest_weekly (매일 / 주 1회)
create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('replies', p.replies, 'likes', p.likes, 'social', p.social, 'invites', p.invites,
      'agents', p.agents, 'gallery', p.gallery, 'following', p.following, 'badges', p.badges, 'meetups', p.meetups,
      'newcomers', p.newcomers, 'digest', p.digest, 'digest_weekly', p.digest_weekly)
    from public.notification_prefs p where p.member_id = public.current_member_id()),
    jsonb_build_object('replies', true, 'likes', true, 'social', true, 'invites', true, 'agents', true, 'gallery', true,
      'following', true, 'badges', true, 'meetups', true, 'newcomers', true, 'digest', true, 'digest_weekly', false))
$$;

create or replace function public.notification_prefs_set(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_key not in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following', 'badges', 'meetups', 'newcomers',
                   'digest', 'digest_weekly') then raise exception 'bad_pref' using errcode = 'P0001'; end if;
  insert into public.notification_prefs(member_id) values (v_me) on conflict (member_id) do nothing;
  execute format('update public.notification_prefs set %I = $1, updated_at = now() where member_id = $2', p_key)
    using coalesce(p_on, p_key <> 'digest_weekly'), v_me;
  return public.notification_prefs_get();
end $$;

-- the app pings this when a member opens it (client-throttled; at most one write per 5 minutes here)
create or replace function public.member_seen() returns void
language sql security definer set search_path to '' as $$
  update public.members set last_seen_at = now()
  where id = public.current_member_id() and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
$$;

-- the posts a digest may mention: what every completed member can see
create or replace function public.digest__visible(p public.posts) returns boolean
language sql immutable set search_path to '' as $$
  select p.parent_id is null and p.deleted_at is null and not coalesce(p.is_hidden, false)
     and p.visibility = 'members' and p.group_id is null and p.as_group_id is null
     and p.posted_as = 'real' and p.author_kind = 'member' and p.agent_token_id is null
$$;

create or replace function public.digest__title(p public.posts) returns text
language sql immutable set search_path to '' as $$
  select left(coalesce(nullif(btrim(p.title), ''),
    nullif(btrim(split_part(regexp_replace(coalesce(p.content, ''), '^\s+', ''), E'\n', 1)), ''), '새 글'), 80)
$$;

create or replace function public.digest__run(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_kst timestamp := p_now at time zone 'Asia/Seoul';
  v_hour integer := extract(hour from (p_now at time zone 'Asia/Seoul'));
  v_min integer; v_hot integer; v_digests integer := 0; v_hots integer := 0;
  m record; v_since timestamptz; v_cnt integer; v_top public.posts%rowtype; v_top_eng integer; h public.posts%rowtype;
begin
  if v_hour < 9 or v_hour > 21 then return jsonb_build_object('skipped', 'quiet_hours'); end if;
  select coalesce((select case when value ~ '^[0-9]{1,3}$' then value::int end from public.site_config where key = 'digest_min_posts'), 3) into v_min;
  select coalesce((select case when value ~ '^[0-9]{1,3}$' then value::int end from public.site_config where key = 'digest_hot_min'), 8) into v_hot;

  for m in
    select mem.id, mem.last_seen_at, coalesce(np.digest_weekly, false) as weekly, dl.last_digest_at, dl.last_hot_at
    from public.members mem
    left join public.notification_prefs np on np.member_id = mem.id
    left join public.digest_log dl on dl.member_id = mem.id
    where mem.signup_completed_at is not null and not mem.is_banned and mem.first_mission_at is not null
      and coalesce(np.digest, true)
      and exists (select 1 from public.push_subscriptions s where s.member_id = mem.id)
      and (mem.last_seen_at is null or mem.last_seen_at < p_now - interval '4 hours')
      and not exists (select 1 from public.notifications n where n.recipient_id = mem.id and n.category <> 'digest'
                      and n.created_at > p_now - interval '3 hours')
  loop
    -- 1) the digest
    if v_hour >= 12 and (m.last_digest_at is null
        or m.last_digest_at < p_now - case when m.weekly then interval '6 days 20 hours' else interval '20 hours' end) then
      v_since := greatest(coalesce(m.last_seen_at, '-infinity'::timestamptz), coalesce(m.last_digest_at, '-infinity'::timestamptz),
                          p_now - case when m.weekly then interval '7 days' else interval '36 hours' end);
      select count(*) into v_cnt from public.posts p
        where public.digest__visible(p) and p.author_id <> m.id and p.created_at > v_since and p.created_at <= p_now;
      if v_cnt > 0 then
        select * into v_top from public.posts p
          where public.digest__visible(p) and p.author_id <> m.id and p.created_at > v_since and p.created_at <= p_now
          order by coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc, p.created_at desc
          limit 1;
        v_top_eng := coalesce(v_top.like_count, 0) + coalesce(v_top.reaction_count, 0) + coalesce(v_top.reply_count, 0);
        if v_cnt >= v_min or v_top_eng >= 3 then
          insert into public.notifications(recipient_id, kind, category, actor_kind, target_kind, target_id, link, excerpt,
                                           item_count, read_at, dedupe_key, created_at)
          values (m.id, 'digest', 'digest', 'someone', 'post', v_top.id, '/feed', public.digest__title(v_top),
                  v_cnt, p_now, 'digest:' || to_char(v_kst, 'YYYY-MM-DD'), p_now)
          on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
          if found then
            insert into public.digest_log(member_id, last_digest_at) values (m.id, p_now)
              on conflict (member_id) do update set last_digest_at = excluded.last_digest_at;
            v_digests := v_digests + 1;
            continue;
          end if;
        end if;
      end if;
    end if;

    -- 2) a genuinely hot post (daily mode only)
    if not m.weekly and (m.last_hot_at is null or m.last_hot_at < p_now - interval '20 hours')
       and (m.last_digest_at is null or m.last_digest_at < p_now - interval '3 hours') then
      select * into h from public.posts p
        where public.digest__visible(p) and p.author_id <> m.id
          and p.created_at > p_now - interval '12 hours' and p.created_at <= p_now
          and p.created_at > coalesce(m.last_seen_at, '-infinity'::timestamptz)
          and coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) >= v_hot
          and not exists (select 1 from public.notifications n where n.recipient_id = m.id and n.category = 'digest'
                          and n.target_id = p.id)
        order by coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc
        limit 1;
      if found then
        insert into public.notifications(recipient_id, kind, category, actor_kind, target_kind, target_id, link, excerpt,
                                         item_count, read_at, dedupe_key, created_at)
        values (m.id, 'digest_hot', 'digest', 'someone', 'post', h.id, '/posts/' || h.id, public.digest__title(h),
                coalesce(h.like_count, 0) + coalesce(h.reaction_count, 0) + coalesce(h.reply_count, 0), p_now, 'hot:' || h.id, p_now)
        on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
        if found then
          insert into public.digest_log(member_id, last_hot_at) values (m.id, p_now)
            on conflict (member_id) do update set last_hot_at = excluded.last_hot_at;
          v_hots := v_hots + 1;
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('digests', v_digests, 'hot', v_hots);
end $$;

revoke all on function public.digest__run(timestamptz), public.digest__visible(public.posts), public.digest__title(public.posts)
  from public, anon, authenticated;
revoke all on function public.member_seen(), public.notification_prefs_get(), public.notification_prefs_set(text, boolean) from public, anon;
grant execute on function public.member_seen(), public.notification_prefs_get(), public.notification_prefs_set(text, boolean) to authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'digest-push';
  perform cron.schedule('digest-push', '23 * * * *', 'select public.digest__run()');
end $$;
