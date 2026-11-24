-- A61 change (Colin, 9:04 AM): one '새 소식' push to EVERY member with push on and the category enabled,
-- once per KST day, even if they visited recently and even if nothing is new. Replaces 0110's rules.
--   * window: from site_config digest_hour (default 12) to 21:59 KST; nothing 22:00–07:59 (quiet hours).
--     The hourly job (:23) keeps trying until each member got today's one (e.g. a device added later).
--   * at most one per KST day (weekly mode: one per 7 days); the hot-post second push is gone.
--   * what it says, first match wins:
--       1. new posts since the member's last visit / last digest → '새 글 N개' + the top one's title → /feed
--       2. a popular post from the last 7 days they haven't reacted to, replied to, or been shown → that post
--       3. an older well-reacted post (≥ 3 likes + reactions + replies), same exclusions → that post
--       4. a gentle '오늘 들러 보세요' → /feed
--   * only 전체 회원, real-name, non-group root posts by members (digest__visible), never their own.
--   * the in-app row is stored as already read, so it never inflates the bell badge.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','first_post','digest','digest_hot','digest_pick','digest_nudge']));

-- a post the member might like to be pointed at: visible, not theirs, not already engaged with or shown
create or replace function public.digest__fresh_for(p public.posts, p_member uuid) returns boolean
language sql stable security definer set search_path to '' as $$
  select public.digest__visible(p) and p.author_id <> p_member
    and not exists (select 1 from public.post_likes l where l.post_id = p.id and l.member_id = p_member)
    and not exists (select 1 from public.post_reactions r where r.post_id = p.id and r.member_id = p_member)
    and not exists (select 1 from public.posts c where c.root_id = p.id and c.author_id = p_member)
    and not exists (select 1 from public.notifications n where n.recipient_id = p_member and n.category = 'digest'
                    and n.target_id = p.id)
$$;

create or replace function public.digest__run(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_kst timestamp := p_now at time zone 'Asia/Seoul';
  v_hour integer := extract(hour from (p_now at time zone 'Asia/Seoul'));
  v_start integer; v_counts jsonb := '{"new":0,"pick":0,"older":0,"nudge":0}'::jsonb;
  m record; v_since timestamptz; v_cnt integer; v_top public.posts%rowtype; v_kind text; v_slot text;
begin
  select coalesce((select case when value ~ '^([89]|1[0-9]|2[01])$' then value::int end from public.site_config where key = 'digest_hour'), 12) into v_start;
  if v_hour < 8 or v_hour > 21 then return jsonb_build_object('skipped', 'quiet_hours'); end if;
  if v_hour < v_start then return jsonb_build_object('skipped', 'before_window'); end if;

  for m in
    select mem.id, mem.last_seen_at, coalesce(np.digest_weekly, false) as weekly, dl.last_digest_at
    from public.members mem
    left join public.notification_prefs np on np.member_id = mem.id
    left join public.digest_log dl on dl.member_id = mem.id
    where mem.signup_completed_at is not null and not mem.is_banned and mem.first_mission_at is not null
      and coalesce(np.digest, true)
      and exists (select 1 from public.push_subscriptions s where s.member_id = mem.id)
      and (dl.last_digest_at is null
           or (dl.last_digest_at at time zone 'Asia/Seoul')::date < v_kst::date
              and (not coalesce(np.digest_weekly, false) or dl.last_digest_at < p_now - interval '6 days 20 hours'))
  loop
    v_top := null; v_kind := null; v_cnt := 0;
    -- 1) what's new since they last looked
    v_since := greatest(coalesce(m.last_seen_at, '-infinity'::timestamptz), coalesce(m.last_digest_at, '-infinity'::timestamptz),
                        p_now - case when m.weekly then interval '7 days' else interval '36 hours' end);
    select count(*) into v_cnt from public.posts p
      where public.digest__visible(p) and p.author_id <> m.id and p.created_at > v_since and p.created_at <= p_now;
    if v_cnt > 0 then
      select * into v_top from public.posts p
        where public.digest__visible(p) and p.author_id <> m.id and p.created_at > v_since and p.created_at <= p_now
        order by coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc, p.created_at desc
        limit 1;
      v_kind := 'digest'; v_slot := 'new';
    end if;
    -- 2) a recent popular post they haven't touched
    if v_kind is null then
      select * into v_top from public.posts p
        where p.created_at > p_now - interval '7 days' and p.created_at <= p_now and public.digest__fresh_for(p, m.id)
          and coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) >= 1
        order by coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc, p.created_at desc
        limit 1;
      if found then v_kind := 'digest_pick'; v_slot := 'pick'; end if;
    end if;
    -- 3) an older well-reacted one
    if v_kind is null then
      select * into v_top from public.posts p
        where p.created_at <= p_now - interval '7 days' and public.digest__fresh_for(p, m.id)
          and coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) >= 3
        order by coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc, p.created_at desc
        limit 1;
      if found then v_kind := 'digest_pick'; v_slot := 'older'; end if;
    end if;
    -- 4) a gentle nudge
    if v_kind is null then v_kind := 'digest_nudge'; v_slot := 'nudge'; end if;

    insert into public.notifications(recipient_id, kind, category, actor_kind, target_kind, target_id, link, excerpt,
                                     item_count, read_at, dedupe_key, created_at)
    values (m.id, v_kind, 'digest', 'someone',
            case when v_top.id is null then null else 'post' end, v_top.id,
            case when v_kind = 'digest_pick' then '/posts/' || v_top.id else '/feed' end,
            case when v_top.id is null then null else public.digest__title(v_top) end,
            greatest(v_cnt, 1), p_now, 'digest:' || to_char(v_kst, 'YYYY-MM-DD'), p_now)
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
    if found then
      insert into public.digest_log(member_id, last_digest_at) values (m.id, p_now)
        on conflict (member_id) do update set last_digest_at = excluded.last_digest_at;
      v_counts := jsonb_set(v_counts, array[v_slot], to_jsonb((v_counts->>v_slot)::int + 1));
    end if;
  end loop;
  return v_counts;
end $$;

revoke all on function public.digest__run(timestamptz), public.digest__fresh_for(public.posts, uuid) from public, anon, authenticated;
