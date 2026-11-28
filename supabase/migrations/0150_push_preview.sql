-- A131: lock-screen previews for web push.
-- * digest__teaser uses @handle and ~90 characters (same shape as src/lib/digest-rules.ts).
-- * digest__run skips the send when no visible post qualifies (no generic "들러 보세요" fallback).
--   Quiet hours, once-a-day / weekly caps, and "only members with push + digest pref" stay as in 0142.
-- * notification_prefs.preview (default true) is the '알림에 내용 미리보기' toggle.
-- * push_dispatch_claim adds preview and the actor handle so the payload builder can honor both.

create or replace function public.digest__teaser(p public.posts) returns text
language plpgsql stable security definer set search_path to '' as $$
declare v_handle text; v_name text; v_who text; v_body text;
begin
  select left(btrim(coalesce(m.handle, '')), 20), left(btrim(coalesce(m.display_name, '')), 20)
    into v_handle, v_name from public.members m where m.id = p.author_id;
  v_who := case
    when v_handle is not null and v_handle <> '' then '@' || v_handle
    when v_name is not null and v_name <> '' then v_name
    else '멤버' end;
  v_body := left(btrim(regexp_replace(coalesce(p.content, ''), '[[:space:]]+', ' ', 'g')), 90);
  if v_body = '' then v_body := left(btrim(coalesce(p.title, '')), 90); end if;
  if v_body = '' then v_body := '새 글'; end if;
  return v_who || ': ' || v_body;
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
    -- 4) any recent visible post they haven't been shown, so a nudge still has a teaser
    if v_kind is null then
      select * into v_top from public.posts p
        where p.created_at > p_now - interval '30 days' and p.created_at <= p_now and public.digest__fresh_for(p, m.id)
        order by (exists (select 1 from public.follows f where f.follower_id = m.id and f.followee_id = p.author_id)) desc,
                 coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) desc,
                 p.created_at desc
        limit 1;
      if found then v_kind := 'digest_nudge'; v_slot := 'nudge'; end if;
    end if;

    -- A131: no generic fallback. If nothing visible qualifies, try again next window.
    if v_kind is null or v_top.id is null then continue; end if;

    insert into public.notifications(recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, link, excerpt,
                                     item_count, read_at, dedupe_key, created_at)
    values (m.id, v_kind, 'digest',
            'member', v_top.author_id, 'post', v_top.id,
            '/posts/' || v_top.id, public.digest__teaser(v_top),
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

alter table public.notification_prefs add column if not exists preview boolean not null default true;

create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('replies', p.replies, 'likes', p.likes, 'social', p.social, 'invites', p.invites,
      'agents', p.agents, 'gallery', p.gallery, 'following', p.following, 'badges', p.badges, 'meetups', p.meetups,
      'newcomers', p.newcomers, 'digest', p.digest, 'digest_weekly', p.digest_weekly, 'articles', p.articles,
      'preview', p.preview)
    from public.notification_prefs p where p.member_id = public.current_member_id()),
    jsonb_build_object('replies', true, 'likes', true, 'social', true, 'invites', true, 'agents', true, 'gallery', true,
      'following', true, 'badges', true, 'meetups', true, 'newcomers', true, 'digest', true, 'digest_weekly', false,
      'articles', true, 'preview', true))
$$;

create or replace function public.notification_prefs_set(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_key not in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following', 'badges', 'meetups', 'newcomers',
                   'digest', 'digest_weekly', 'articles', 'preview') then raise exception 'bad_pref' using errcode = 'P0001'; end if;
  insert into public.notification_prefs(member_id) values (v_me) on conflict (member_id) do nothing;
  execute format('update public.notification_prefs set %I = $1, updated_at = now() where member_id = $2', p_key)
    using coalesce(p_on, p_key <> 'digest_weekly'), v_me;
  return public.notification_prefs_get();
end $$;

revoke all on function public.notification_prefs_get(), public.notification_prefs_set(text, boolean) from public, anon;
grant execute on function public.notification_prefs_get(), public.notification_prefs_set(text, boolean) to authenticated;

create or replace function public.push_dispatch_claim(p_secret text, p_limit int default 50)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v jsonb;
begin
  if not public.push__secret_ok(p_secret) then raise exception 'push_forbidden' using errcode = 'P0001'; end if;
  delete from public.push_outbox where created_at < now() - interval '1 day' or attempts >= 3;
  with c as (
    update public.push_outbox o set claimed_at = now(), attempts = o.attempts + 1
    where o.id in (select id from public.push_outbox
                   where claimed_at is null or claimed_at < now() - interval '2 minutes'
                   order by id limit least(greatest(coalesce(p_limit, 50), 1), 200) for update skip locked)
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'outboxId', c.id, 'subscriptionId', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
    'locale', coalesce(m.locale, 'ko'),
    'preview', coalesce(np.preview, true),
    'unread', (select count(*) from public.notifications x where x.recipient_id = c.member_id and x.read_at is null),
    'item', case when n.id is null then null else jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'category', n.category, 'link', n.link, 'excerpt', n.excerpt,
      'targetKind', n.target_kind, 'targetId', n.target_id, 'count', n.item_count, 'createdAt', n.created_at, 'unread', true,
      'actor', case
        when n.actor_kind = 'member' and n.actor_member_id is not null then (
          select jsonb_build_object('kind', 'member', 'id', a.id,
            'name', case when a.profile_completed_at is not null then a.display_name else '새 멤버' end,
            'handle', a.handle, 'avatarUrl', null)
          from public.members a where a.id = n.actor_member_id)
        else jsonb_build_object('kind', n.actor_kind, 'id', null, 'name', n.actor_label, 'handle', null, 'avatarUrl', null) end) end
  )), '[]'::jsonb) into v
  from c
  join public.members m on m.id = c.member_id
  left join public.notification_prefs np on np.member_id = c.member_id
  left join public.notifications n on n.id = c.notification_id
  join public.push_subscriptions s on s.member_id = c.member_id and (c.subscription_id is null or s.id = c.subscription_id)
  where (c.notification_id is null) = (c.subscription_id is not null); -- test rows have no notification and vice versa
  return v;
end;
$$;

revoke all on function public.push_dispatch_claim(text, int) from public;
grant execute on function public.push_dispatch_claim(text, int) to anon, authenticated;
