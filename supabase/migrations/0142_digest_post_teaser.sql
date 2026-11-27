-- A120: the daily 새 소식 / "come check AI쓰발" notification carries a real post teaser
-- (author display name · first ~56 characters) and deep-links to that post. Picks a post the
-- recipient can see (digest__visible: 전체-회원, real-name, non-group, not deleted/hidden,
-- not their own), preferring people they follow, then engagement, then recency, and skipping
-- posts they already liked, reacted to, replied to, or were shown. If nothing qualifies, the
-- existing generic 오늘 들러 보세요 copy and /feed link remain. Quiet hours, once-a-day caps,
-- weekly mode, and "only members with push + digest pref" are unchanged from 0111.

create or replace function public.digest__teaser(p public.posts) returns text
language plpgsql stable security definer set search_path to '' as $$
declare v_name text; v_body text;
begin
  select left(btrim(coalesce(m.display_name, '')), 20) into v_name from public.members m where m.id = p.author_id;
  v_name := coalesce(nullif(v_name, ''), '멤버');
  v_body := left(btrim(regexp_replace(coalesce(p.content, ''), '[[:space:]]+', ' ', 'g')), 56);
  if v_body = '' then v_body := left(btrim(coalesce(p.title, '')), 56); end if;
  if v_body = '' then v_body := '새 글'; end if;
  return v_name || ' · ' || v_body;
end $$;
revoke all on function public.digest__teaser(public.posts) from public, anon, authenticated;

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
        order by (exists (select 1 from public.follows f where f.follower_id = m.id and f.followee_id = p.author_id)) desc,
                 coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc,
                 p.created_at desc
        limit 1;
      v_kind := 'digest'; v_slot := 'new';
    end if;
    -- 2) a recent popular post they haven't touched
    if v_kind is null then
      select * into v_top from public.posts p
        where p.created_at > p_now - interval '7 days' and p.created_at <= p_now and public.digest__fresh_for(p, m.id)
          and coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) >= 1
        order by (exists (select 1 from public.follows f where f.follower_id = m.id and f.followee_id = p.author_id)) desc,
                 coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc,
                 p.created_at desc
        limit 1;
      if found then v_kind := 'digest_pick'; v_slot := 'pick'; end if;
    end if;
    -- 3) an older well-reacted one
    if v_kind is null then
      select * into v_top from public.posts p
        where p.created_at <= p_now - interval '7 days' and public.digest__fresh_for(p, m.id)
          and coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) >= 3
        order by (exists (select 1 from public.follows f where f.follower_id = m.id and f.followee_id = p.author_id)) desc,
                 coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc,
                 p.created_at desc
        limit 1;
      if found then v_kind := 'digest_pick'; v_slot := 'older'; end if;
    end if;
    -- 4) any recent visible post they haven't been shown, so the "come check" nudge still has a teaser
    if v_kind is null then
      select * into v_top from public.posts p
        where p.created_at > p_now - interval '30 days' and p.created_at <= p_now and public.digest__fresh_for(p, m.id)
        order by (exists (select 1 from public.follows f where f.follower_id = m.id and f.followee_id = p.author_id)) desc,
                 coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc,
                 p.created_at desc
        limit 1;
      if found then v_kind := 'digest_nudge'; v_slot := 'nudge';
      else v_kind := 'digest_nudge'; v_slot := 'nudge'; v_top := null; end if;
    end if;

    insert into public.notifications(recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, link, excerpt,
                                     item_count, read_at, dedupe_key, created_at)
    values (m.id, v_kind, 'digest',
            case when v_top.id is null then 'someone' else 'member' end,
            v_top.author_id,
            case when v_top.id is null then null else 'post' end, v_top.id,
            case when v_top.id is not null then '/posts/' || v_top.id else '/feed' end,
            case when v_top.id is not null then public.digest__teaser(v_top) else null end,
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

revoke all on function public.digest__run(timestamptz), public.digest__teaser(public.posts) from public, anon, authenticated;
