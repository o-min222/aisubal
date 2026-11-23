-- A54: first-question mission after the pledge — the answer is the member's first post (전체 회원) and unlocks the feed.
-- A55: that first post is never met with silence — the inviter (and, while the community is small, every admin) hears about it.

-- ---- A54 -------------------------------------------------------------------------------
alter table public.members add column if not exists first_mission_at timestamptz;
-- everyone already in has "done" it
update public.members set first_mission_at = coalesce(signup_completed_at, created_at, now())
  where signup_completed_at is not null and first_mission_at is null;

create table if not exists public.onboarding_prompts (
  id uuid primary key default gen_random_uuid(),
  body_ko text not null check (char_length(btrim(body_ko)) between 4 and 140),
  body_en text check (body_en is null or char_length(btrim(body_en)) between 4 and 140),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.onboarding_prompts enable row level security;
revoke all on public.onboarding_prompts from public, anon, authenticated;  -- RPC only

insert into public.onboarding_prompts (body_ko, body_en, sort)
select * from (values
  ('요즘 제일 손에 붙은 AI 워크플로 하나만 소개해 주세요.', 'Share one AI workflow that has really stuck with you lately.', 10),
  ('AI 덕분에 최근에 아낀 시간, 어디서 아꼈나요?', 'Where did AI save you time recently?', 20),
  ('지금 쓰는 AI 툴 조합(스택)과 이유를 알려 주세요.', 'What is your current AI tool stack, and why?', 30),
  ('AI로 해보고 싶은데 아직 못 푼 문제가 있나요?', 'Is there a problem you want to solve with AI but haven''t cracked yet?', 40)
) v(ko, en, s)
where not exists (select 1 from public.onboarding_prompts);

create or replace function public.onboarding__is_admin() returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.members m where m.auth_id = (select auth.uid()) and m.is_admin and not m.is_banned)
$$;
revoke all on function public.onboarding__is_admin() from public, anon, authenticated;

-- my question: rotates across members (stable per member so a reload doesn't change it)
create or replace function public.onboarding_prompt_mine() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_n integer; r public.onboarding_prompts%rowtype;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.onboarding_prompts where active;
  if v_n = 0 then return null; end if;
  select * into r from public.onboarding_prompts where active order by sort, created_at, id
    offset (abs(hashtext(v_me::text)) % v_n) limit 1;
  return jsonb_build_object('id', r.id, 'ko', r.body_ko, 'en', r.body_en,
    'done', (select m.first_mission_at is not null from public.members m where m.id = v_me));
end $$;
revoke all on function public.onboarding_prompt_mine() from public, anon;
grant execute on function public.onboarding_prompt_mine() to authenticated;

-- admin: list / save / delete prompts
create or replace function public.onboarding_prompts_admin() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ko', p.body_ko, 'en', p.body_en, 'active', p.active, 'sort', p.sort) order by p.sort, p.created_at)
    from public.onboarding_prompts p), '[]'::jsonb);
end $$;
create or replace function public.onboarding_prompt_save(p_id uuid, p_ko text, p_en text, p_active boolean, p_sort integer default null) returns uuid
language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.onboarding_prompts (body_ko, body_en, active, sort)
    values (btrim(p_ko), nullif(btrim(coalesce(p_en, '')), ''), coalesce(p_active, true),
      coalesce(p_sort, (select coalesce(max(sort), 0) + 10 from public.onboarding_prompts)))
    returning id into v_id;
  else
    update public.onboarding_prompts set body_ko = btrim(p_ko), body_en = nullif(btrim(coalesce(p_en, '')), ''),
      active = coalesce(p_active, active), sort = coalesce(p_sort, sort), updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
create or replace function public.onboarding_prompt_delete(p_id uuid) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.onboarding_prompts where id = p_id;
  return found;
end $$;
revoke all on function public.onboarding_prompts_admin() from public, anon;
revoke all on function public.onboarding_prompt_save(uuid, text, text, boolean, integer) from public, anon;
revoke all on function public.onboarding_prompt_delete(uuid) from public, anon;
grant execute on function public.onboarding_prompts_admin() to authenticated;
grant execute on function public.onboarding_prompt_save(uuid, text, text, boolean, integer) to authenticated;
grant execute on function public.onboarding_prompt_delete(uuid) to authenticated;

-- ---- A55: notification plumbing ---------------------------------------------------------
alter table public.notification_prefs add column if not exists newcomers boolean not null default true;
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (category = any (array[
  'replies','likes','social','invites','agents','gallery','following','badges','meetups','newcomers']));
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','first_post']));

create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce((select jsonb_build_object('replies', p.replies, 'likes', p.likes, 'social', p.social, 'invites', p.invites,
      'agents', p.agents, 'gallery', p.gallery, 'following', p.following, 'badges', p.badges, 'meetups', p.meetups, 'newcomers', p.newcomers)
    from public.notification_prefs p where p.member_id = public.current_member_id()),
    jsonb_build_object('replies', true, 'likes', true, 'social', true, 'invites', true, 'agents', true, 'gallery', true,
      'following', true, 'badges', true, 'meetups', true, 'newcomers', true))
$$;
create or replace function public.notification_prefs_set(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_key not in ('replies', 'likes', 'social', 'invites', 'agents', 'gallery', 'following', 'badges', 'meetups', 'newcomers') then raise exception 'bad_pref' using errcode = 'P0001'; end if;
  insert into public.notification_prefs(member_id) values (v_me) on conflict (member_id) do nothing;
  execute format('update public.notification_prefs set %I = $1, updated_at = now() where member_id = $2', p_key) using coalesce(p_on, true), v_me;
  return public.notification_prefs_get();
end $$;

-- ---- A54 + A55: finish the mission --------------------------------------------------------
-- p_post must be my own root 전체 회원 post (not a group post, not a 부캐/group identity).
-- First completion only: mark done, then tell the inviter and — while completed members <= site_config
-- 'newcomer_alert_max' (default 100; 0 = off) — every admin. Returns {ok, first, notified}.
create or replace function public.onboarding_mission_complete(p_post uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id(); m public.members%rowtype; p public.posts%rowtype;
  v_max integer; v_count integer; v_n integer := 0; a record;
begin
  if v_me is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  select * into p from public.posts where id = p_post;
  if not found or p.author_id <> v_me or p.parent_id is not null or p.deleted_at is not null
     or p.visibility <> 'members' or p.group_id is not null or p.as_group_id is not null or p.posted_as <> 'real' then
    raise exception 'mission_bad_post' using errcode = 'P0001';
  end if;
  update public.members set first_mission_at = now() where id = v_me and first_mission_at is null returning * into m;
  if not found then return jsonb_build_object('ok', true, 'first', false, 'notified', 0); end if;

  if m.invited_by_id is not null then
    perform public.notify__push(m.invited_by_id, 'first_post', 'newcomers', 'member', v_me, null, null, 'post', p.id, p.id,
      '/posts/' || p.id, p.content, 'firstpost:' || v_me);
    v_n := v_n + 1;
  end if;
  select coalesce((select nullif(value, '')::integer from public.site_config where key = 'newcomer_alert_max'), 100) into v_max;
  select count(*) into v_count from public.members where signup_completed_at is not null and not is_banned;
  if v_max > 0 and v_count <= v_max then
    for a in select id from public.members where is_admin and not is_banned and id <> v_me and id is distinct from m.invited_by_id loop
      perform public.notify__push(a.id, 'first_post', 'newcomers', 'member', v_me, null, null, 'post', p.id, p.id,
        '/posts/' || p.id, p.content, 'firstpost:' || v_me);
      v_n := v_n + 1;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'first', true, 'notified', v_n);
end $$;
revoke all on function public.onboarding_mission_complete(uuid) from public, anon;
grant execute on function public.onboarding_mission_complete(uuid) to authenticated;
