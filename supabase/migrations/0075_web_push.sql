-- 0075 web push (D1): one subscription per device, a small outbox fed by the notifications table,
-- and a secret-gated claim/report pair for the Vercel dispatcher (anon key only; no service role).
-- notify__push already applies the member's category toggles, so every notification row is allowed.
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  user_agent text check (length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  last_test_at timestamptz,
  failures int not null default 0
);
create index if not exists push_subscriptions_member_idx on public.push_subscriptions(member_id);
alter table public.push_subscriptions enable row level security;

create table if not exists public.push_outbox (
  id bigserial primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete cascade, -- set only for a device test
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0
);
create index if not exists push_outbox_pending_idx on public.push_outbox(id) where claimed_at is null;
alter table public.push_outbox enable row level security;

-- one row: the dispatcher secret's sha256 and where to nudge. Hash only, never the secret.
create table if not exists public.push_config (
  id boolean primary key default true check (id),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  dispatch_url text not null check (dispatch_url ~ '^https://')
);
alter table public.push_config enable row level security;

create or replace function public.push__me() returns uuid
language sql stable security definer set search_path to '' as $$
  select m.id from public.members m
  where m.id = public.current_member_id() and m.signup_completed_at is not null and not m.is_banned
$$;

create or replace function public.push__nudge() returns void
language plpgsql security definer set search_path to '' as $$
declare v_url text;
begin
  select dispatch_url into v_url from public.push_config;
  if v_url is null then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 5000);
exception when others then null; -- a push must never break the action that caused it
end;
$$;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.push__me();
begin
  if v_me is null then raise exception 'push_not_member' using errcode = 'P0001'; end if;
  insert into public.push_subscriptions(member_id, endpoint, p256dh, auth, user_agent)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  on conflict (endpoint) do update set member_id = v_me, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, failures = 0;
  -- at most 10 devices: the oldest falls off
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where member_id = v_me order by created_at desc offset 10);
  return true;
end;
$$;

create or replace function public.push_unsubscribe(p_endpoint text) returns boolean
language sql security definer set search_path to '' as $$
  with d as (delete from public.push_subscriptions where endpoint = p_endpoint and member_id = public.push__me() returning 1)
  select exists (select 1 from d)
$$;

create or replace function public.push_status(p_endpoint text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and member_id = public.push__me())
$$;

create or replace function public.push_test(p_endpoint text) returns text
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.push__me(); s public.push_subscriptions%rowtype;
begin
  if v_me is null then return 'not_member'; end if;
  select * into s from public.push_subscriptions where endpoint = p_endpoint and member_id = v_me for update;
  if not found then return 'not_subscribed'; end if;
  if s.last_test_at > now() - interval '20 seconds' then return 'rate_limited'; end if;
  update public.push_subscriptions set last_test_at = now() where id = s.id;
  insert into public.push_outbox(member_id, subscription_id) values (v_me, s.id);
  perform public.push__nudge();
  return 'queued';
end;
$$;

create or replace function public.push__on_notification() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if exists (select 1 from public.push_subscriptions where member_id = new.recipient_id) then
    insert into public.push_outbox(member_id, notification_id) values (new.recipient_id, new.id);
    perform public.push__nudge();
  end if;
  return null;
exception when others then return null;
end;
$$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push__on_notification();

create or replace function public.push__secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce(length(p_secret) >= 32 and
    (select secret_hash from public.push_config) = encode(extensions.digest(p_secret, 'sha256'), 'hex'), false)
$$;

-- Claims up to p_limit outbox rows (retry after 2 min, 3 attempts) and returns one job per device.
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
    'unread', (select count(*) from public.notifications x where x.recipient_id = c.member_id and x.read_at is null),
    'item', case when n.id is null then null else jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'category', n.category, 'link', n.link, 'excerpt', n.excerpt,
      'targetKind', n.target_kind, 'targetId', n.target_id, 'count', n.item_count, 'createdAt', n.created_at, 'unread', true,
      'actor', case
        when n.actor_kind = 'member' and n.actor_member_id is not null then (
          select jsonb_build_object('kind', 'member', 'id', a.id,
            'name', case when a.profile_completed_at is not null then a.display_name else '새 멤버' end, 'avatarUrl', null)
          from public.members a where a.id = n.actor_member_id)
        else jsonb_build_object('kind', n.actor_kind, 'id', null, 'name', n.actor_label, 'avatarUrl', null) end) end
  )), '[]'::jsonb) into v
  from c
  join public.members m on m.id = c.member_id
  left join public.notifications n on n.id = c.notification_id
  join public.push_subscriptions s on s.member_id = c.member_id and (c.subscription_id is null or s.id = c.subscription_id)
  where (c.notification_id is null) = (c.subscription_id is not null); -- test rows have no notification and vice versa
  return v;
end;
$$;

-- p_done: outbox rows finished; p_ok: devices that accepted; p_gone: 404/410 (expired) -> delete;
-- p_failed: other errors -> count, delete after 5 in a row.
create or replace function public.push_dispatch_report(p_secret text, p_done bigint[], p_ok uuid[], p_gone uuid[], p_failed uuid[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_gone int; v_dropped int;
begin
  if not public.push__secret_ok(p_secret) then raise exception 'push_forbidden' using errcode = 'P0001'; end if;
  delete from public.push_outbox where id = any(coalesce(p_done, '{}'));
  update public.push_subscriptions set last_ok_at = now(), failures = 0 where id = any(coalesce(p_ok, '{}'));
  delete from public.push_subscriptions where id = any(coalesce(p_gone, '{}'));
  get diagnostics v_gone = row_count;
  update public.push_subscriptions set failures = failures + 1 where id = any(coalesce(p_failed, '{}'));
  delete from public.push_subscriptions where failures >= 5;
  get diagnostics v_dropped = row_count;
  return jsonb_build_object('gone', v_gone, 'dropped', v_dropped);
end;
$$;

revoke all on function public.push__me(), public.push__nudge(), public.push__on_notification(), public.push__secret_ok(text) from public, anon, authenticated;
revoke all on function public.push_subscribe(text, text, text, text), public.push_unsubscribe(text), public.push_status(text), public.push_test(text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text), public.push_unsubscribe(text), public.push_status(text), public.push_test(text) to authenticated;
revoke all on function public.push_dispatch_claim(text, int), public.push_dispatch_report(text, bigint[], uuid[], uuid[], uuid[]) from public;
grant execute on function public.push_dispatch_claim(text, int), public.push_dispatch_report(text, bigint[], uuid[], uuid[], uuid[]) to anon, authenticated;
