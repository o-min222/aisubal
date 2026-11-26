-- A105 (Colin t348u): in-app 화면 피드백. An allowed member (admin, or members.feedback_enabled set
-- from 관리 › 유저) turns on feedback mode, picks an element and leaves a note; the server stores a
-- viewport screenshot in the private feedback-shots bucket and calls feedback_item_submit().
-- * feedback_items: RLS on, no table grants — everything goes through the RPCs below.
-- * Kill switch: site_config.feedback_picker (missing key = on; 'false' = nobody can submit).
-- * Admins get a notification (kind 'feedback', category 'admin', target_kind 'feedback') → web push.
--   Category 'admin' has no member toggle; the row is inserted directly (not through notify__push,
--   which reads a notification_prefs column per category).
-- * Review: admin_feedback_review (approve / reject), admin_feedback_set_status (진행 중 / 배포됨),
--   admin_feedback_webhook_result (what happened to the server's dev-request webhook).
-- * Progress callback: feedback_progress(p_secret, …) for the bot, gated by the sha256 of
--   FEEDBACK_PROGRESS_SECRET in feedback_config (hash only; set out of band, like push_config).
-- No anon access to the table or the bucket.

alter table public.members add column if not exists feedback_enabled boolean not null default false;

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'in_progress', 'deployed')),
  body text not null check (char_length(body) between 1 and 2000),
  route text not null check (char_length(route) between 1 and 500),
  viewport jsonb not null default '{}'::jsonb check (pg_column_size(viewport) <= 400),
  theme text check (theme in ('light', 'dark')),
  locale text check (locale in ('ko', 'en')),
  selector text check (char_length(selector) <= 500),
  component text check (char_length(component) <= 200),
  element_text text check (char_length(element_text) <= 300),
  bbox jsonb check (pg_column_size(bbox) <= 400),
  user_agent text check (char_length(user_agent) <= 400),
  screenshot_path text check (char_length(screenshot_path) <= 200),
  admin_note text check (char_length(admin_note) <= 1000),
  reviewed_by uuid references public.members(id) on delete set null,
  reviewed_at timestamptz,
  webhook_status text check (webhook_status in ('sent', 'skipped', 'failed')),
  webhook_note text check (char_length(webhook_note) <= 300),
  webhook_at timestamptz,
  progress_note text check (char_length(progress_note) <= 500),
  progress_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_items_status_idx on public.feedback_items (status, created_at desc);
create index if not exists feedback_items_author_idx on public.feedback_items (author_id, created_at desc);
alter table public.feedback_items enable row level security;
revoke all on public.feedback_items from public, anon, authenticated;

create table if not exists public.feedback_config (
  id boolean primary key default true check (id),
  progress_secret_hash text
);
alter table public.feedback_config enable row level security;
revoke all on public.feedback_config from public, anon, authenticated;
insert into public.feedback_config (id) values (true) on conflict (id) do nothing;

-- who may use the picker right now
create or replace function public.feedback__allowed() returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select value from public.site_config where key = 'feedback_picker'), 'true') <> 'false'
     and exists (select 1 from public.members m where m.auth_id = (select auth.uid())
       and m.signup_completed_at is not null and not m.is_banned and (m.is_admin or m.feedback_enabled));
$$;
revoke all on function public.feedback__allowed() from public, anon, authenticated;
grant execute on function public.feedback__allowed() to authenticated;

-- get_my_member() carries feedback_allowed so the shell needs no extra round trip
create or replace function public.get_my_member() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
DECLARE uid UUID := (SELECT auth.uid()); r public.members%ROWTYPE; p public.member_private%ROWTYPE; np public.nickname_profiles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.members WHERE auth_id = uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.member_private WHERE member_id = r.id;
  SELECT * INTO np FROM public.nickname_profiles WHERE member_id = r.id;
  RETURN to_jsonb(r) || jsonb_build_object('email', COALESCE(p.email, ''), 'private_real_name', p.real_name,
    'private_google_avatar_url', p.google_avatar_url,
    'nickname', np.nickname, 'nickname_bio', np.bio, 'nickname_avatar_url', np.avatar_url,
    'nickname_created_at', np.created_at, 'nickname_id', np.id,
    'feedback_allowed', public.feedback__allowed());
END;
$$;

-- one row per pick; the screenshot (if any) is already uploaded to {auth uid}/{id}.webp
create or replace function public.feedback_item_submit(
  p_id uuid, p_body text, p_route text, p_viewport jsonb, p_theme text, p_locale text, p_selector text,
  p_component text, p_element_text text, p_bbox jsonb, p_user_agent text, p_shot_path text
) returns uuid
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_body text := btrim(coalesce(p_body, ''));
begin
  if v_me is null or not public.feedback__allowed() then raise exception 'feedback_not_allowed' using errcode = 'P0001'; end if;
  if v_body = '' then raise exception 'feedback_empty' using errcode = 'P0001'; end if;
  if (select count(*) from public.feedback_items where author_id = v_me and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  if p_shot_path is not null and (p_shot_path <> (select auth.uid())::text || '/' || p_id::text || '.webp'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'feedback-shots' and o.name = p_shot_path)) then
    raise exception 'feedback_bad_shot' using errcode = 'P0001';
  end if;
  insert into public.feedback_items (id, author_id, body, route, viewport, theme, locale, selector, component, element_text, bbox, user_agent, screenshot_path)
  values (p_id, v_me, left(v_body, 2000), left(coalesce(nullif(btrim(p_route), ''), '/'), 500),
    case when jsonb_typeof(p_viewport) = 'object' and pg_column_size(p_viewport) <= 400 then p_viewport else '{}'::jsonb end,
    case when p_theme in ('light', 'dark') then p_theme end, case when p_locale in ('ko', 'en') then p_locale end,
    left(nullif(btrim(p_selector), ''), 500), left(nullif(btrim(p_component), ''), 200), left(nullif(btrim(p_element_text), ''), 300),
    case when jsonb_typeof(p_bbox) = 'object' and pg_column_size(p_bbox) <= 400 then p_bbox end,
    left(nullif(btrim(p_user_agent), ''), 400), p_shot_path);
  return p_id;
end $$;
revoke all on function public.feedback_item_submit(uuid, text, text, jsonb, text, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.feedback_item_submit(uuid, text, text, jsonb, text, text, text, text, text, jsonb, text, text) to authenticated;

-- notifications: new kind / category / target kind
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','first_post','digest','digest_hot','digest_pick','digest_nudge','question','repost','feedback']));
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (category = any (array[
  'replies','likes','social','invites','agents','gallery','following','badges','meetups','newcomers','digest','admin']));
alter table public.notifications drop constraint if exists notifications_target_kind_check;
alter table public.notifications add constraint notifications_target_kind_check check (target_kind = any (array[
  'post','agora','anon','member','submission','moim','feedback']));

create or replace function public.feedback_items__notify() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.notifications (recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, link, excerpt, dedupe_key)
  select m.id, 'feedback', 'admin', 'member', new.author_id, 'feedback', new.id, '/admin/feedback/' || new.id, left(new.body, 140), 'feedback:' || new.id
    from public.members m
   where m.is_admin and m.signup_completed_at is not null and not m.is_banned and m.id <> new.author_id
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
exception when others then return null;
end $$;
revoke all on function public.feedback_items__notify() from public, anon, authenticated;
drop trigger if exists feedback_items_notify on public.feedback_items;
create trigger feedback_items_notify after insert on public.feedback_items for each row execute function public.feedback_items__notify();

-- admin reads
create or replace function public.feedback__row(f public.feedback_items) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', f.id, 'status', f.status, 'body', f.body, 'route', f.route, 'viewport', f.viewport,
    'theme', f.theme, 'locale', f.locale, 'selector', f.selector, 'component', f.component, 'elementText', f.element_text,
    'bbox', f.bbox, 'userAgent', f.user_agent, 'hasShot', f.screenshot_path is not null, 'adminNote', f.admin_note,
    'reviewedAt', f.reviewed_at, 'webhookStatus', f.webhook_status, 'webhookNote', f.webhook_note, 'webhookAt', f.webhook_at,
    'progressNote', f.progress_note, 'progressAt', f.progress_at, 'createdAt', f.created_at, 'updatedAt', f.updated_at,
    'author', (select jsonb_build_object('id', m.id, 'name', m.display_name, 'handle', m.handle, 'avatarUrl', m.avatar_url)
                 from public.members m where m.id = f.author_id));
$$;
revoke all on function public.feedback__row(public.feedback_items) from public, anon, authenticated;

create or replace function public.admin_feedback_list(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.app__is_admin() then raise exception 'not authorized'; end if;
  return coalesce((select jsonb_agg(public.feedback__row(f) order by (f.status = 'pending') desc, f.created_at desc)
    from (select * from public.feedback_items x where p_status is null or x.status = p_status
          order by (x.status = 'pending') desc, x.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 200)) f), '[]'::jsonb);
end $$;
revoke all on function public.admin_feedback_list(text, integer) from public, anon, authenticated;
grant execute on function public.admin_feedback_list(text, integer) to authenticated;

create or replace function public.admin_feedback_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare f public.feedback_items%rowtype;
begin
  if not public.app__is_admin() then raise exception 'not authorized'; end if;
  select * into f from public.feedback_items where id = p_id;
  if not found then return null; end if;
  return public.feedback__row(f) || jsonb_build_object('screenshotPath', f.screenshot_path);
end $$;
revoke all on function public.admin_feedback_get(uuid) from public, anon, authenticated;
grant execute on function public.admin_feedback_get(uuid) to authenticated;

-- approve / reject (approve also re-opens a rejected item)
create or replace function public.admin_feedback_review(p_id uuid, p_action text, p_note text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare f public.feedback_items%rowtype;
begin
  if not public.app__is_admin() then raise exception 'not authorized'; end if;
  select * into f from public.feedback_items where id = p_id for update;
  if not found then raise exception 'feedback_not_found' using errcode = 'P0001'; end if;
  if p_action = 'approve' and f.status in ('pending', 'rejected') then
    update public.feedback_items set status = 'approved', reviewed_by = public.current_member_id(), reviewed_at = now(),
      admin_note = coalesce(left(nullif(btrim(p_note), ''), 1000), admin_note), updated_at = now() where id = p_id returning * into f;
  elsif p_action = 'reject' and f.status in ('pending', 'approved') then
    update public.feedback_items set status = 'rejected', reviewed_by = public.current_member_id(), reviewed_at = now(),
      admin_note = coalesce(left(nullif(btrim(p_note), ''), 1000), admin_note), updated_at = now() where id = p_id returning * into f;
  else
    raise exception 'feedback_bad_transition' using errcode = 'P0001';
  end if;
  return public.feedback__row(f) || jsonb_build_object('screenshotPath', f.screenshot_path);
end $$;
revoke all on function public.admin_feedback_review(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_feedback_review(uuid, text, text) to authenticated;

-- shared by the admin buttons and the bot callback: approved → in_progress → deployed (forward, or the same step again)
create or replace function public.feedback__progress(p_id uuid, p_status text, p_note text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare f public.feedback_items%rowtype;
begin
  select * into f from public.feedback_items where id = p_id for update;
  if not found then raise exception 'feedback_not_found' using errcode = 'P0001'; end if;
  if not ((p_status = 'in_progress' and f.status in ('approved', 'in_progress'))
       or (p_status = 'deployed' and f.status in ('approved', 'in_progress', 'deployed'))) then
    raise exception 'feedback_bad_transition' using errcode = 'P0001';
  end if;
  update public.feedback_items set status = p_status, progress_at = now(),
    progress_note = coalesce(left(nullif(btrim(p_note), ''), 500), progress_note), updated_at = now()
   where id = p_id returning * into f;
  return public.feedback__row(f);
end $$;
revoke all on function public.feedback__progress(uuid, text, text) from public, anon, authenticated;

create or replace function public.admin_feedback_set_status(p_id uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  if not public.app__is_admin() then raise exception 'not authorized'; end if;
  return public.feedback__progress(p_id, p_status, p_note);
end $$;
revoke all on function public.admin_feedback_set_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_feedback_set_status(uuid, text, text) to authenticated;

create or replace function public.admin_feedback_webhook_result(p_id uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare f public.feedback_items%rowtype;
begin
  if not public.app__is_admin() then raise exception 'not authorized'; end if;
  if p_status not in ('sent', 'skipped', 'failed') then raise exception 'feedback_bad_webhook_status' using errcode = 'P0001'; end if;
  update public.feedback_items set webhook_status = p_status, webhook_note = left(nullif(btrim(p_note), ''), 300), webhook_at = now(), updated_at = now()
   where id = p_id returning * into f;
  if not found then raise exception 'feedback_not_found' using errcode = 'P0001'; end if;
  return public.feedback__row(f);
end $$;
revoke all on function public.admin_feedback_webhook_result(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_feedback_webhook_result(uuid, text, text) to authenticated;

-- bot callback (POST /api/feedback/progress verifies the HMAC, then passes the secret here)
create or replace function public.feedback_progress(p_secret text, p_id uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_hash text := (select progress_secret_hash from public.feedback_config where id);
begin
  if v_hash is null or p_secret is null or v_hash <> encode(extensions.digest(p_secret, 'sha256'), 'hex') then
    raise exception 'feedback_forbidden' using errcode = 'P0001';
  end if;
  return public.feedback__progress(p_id, p_status, p_note);
end $$;
revoke all on function public.feedback_progress(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.feedback_progress(text, uuid, text, text) to anon, authenticated;

-- 관리 › 유저: feedback tester flag
create or replace function public.admin_set_feedback_enabled(p_member uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v boolean;
begin
  if not public.app__is_admin() then raise exception 'not authorized'; end if;
  update public.members set feedback_enabled = coalesce(p_on, false) where id = p_member returning feedback_enabled into v;
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', p_member, 'feedbackEnabled', v);
end $$;
revoke all on function public.admin_set_feedback_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_feedback_enabled(uuid, boolean) to authenticated;

create or replace function public.admin_list_users() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
BEGIN
  IF NOT public.app__is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at), '[]'::jsonb) FROM (
    SELECT m.id, m.display_name AS name, m.handle, pv.real_name AS "realName", pv.email,
      (SELECT COUNT(*)::int FROM public.posts p WHERE p.author_id = m.id) AS posts,
      m.is_admin AS "isAdmin", m.is_banned AS "isBanned", m.feedback_enabled AS "feedbackEnabled", m.created_at
    FROM public.members m LEFT JOIN public.member_private pv ON pv.member_id = m.id
    WHERE m.signup_completed_at IS NOT NULL) x);
END;
$$;

-- ---- storage: private bucket; allowed members write (and read back) their own folder, admins read all
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-shots', 'feedback-shots', false, 1572864, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists feedback_shots_insert_own on storage.objects;
create policy feedback_shots_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-shots' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.feedback__allowed()));
drop policy if exists feedback_shots_read_admin on storage.objects;
create policy feedback_shots_read_admin on storage.objects for select to authenticated
  using (bucket_id = 'feedback-shots' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.app__is_admin())));
drop policy if exists feedback_shots_delete_admin on storage.objects;
create policy feedback_shots_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'feedback-shots' and (select public.app__is_admin()));
