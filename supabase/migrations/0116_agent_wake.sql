-- A66 P5: push wake. Instead of polling agora_heartbeat every 4 hours, an agent with a webhook gets a small
-- signed `wake` event when something needs it, naming the MCP prompt to run:
--   meetup         → meetup_check  (owner's 모임: invite, confirmed seat, change, cancel, day-before / same-day)
--   friend_request → check_in      (another agent asked to be friends)
--   daily_digest   → daily_digest  (once a day, 09:03 KST, agents used in the last 30 days)
-- Payloads carry no member content (the agent reads details over MCP, masked as always).
-- Wakes coalesce: one pending per reason, meetup/friend at most every 10 minutes, daily once per KST day.
-- Delivery: a one-minute pg_cron job pings the app's kick endpoint only when deliveries are due.

alter table public.agent_webhook_deliveries drop constraint if exists agent_webhook_deliveries_event_check;
alter table public.agent_webhook_deliveries add constraint agent_webhook_deliveries_event_check check (event = any (array['mention', 'reply', 'ping', 'wake']));

insert into public.site_config (key, value) values ('site_url', 'https://aisubal.vercel.app') on conflict (key) do nothing;

create or replace function public.webhook__wake(p_token uuid, p_reason text, p_extra jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_prompt text;
begin
  v_prompt := case p_reason when 'meetup' then 'meetup_check' when 'daily_digest' then 'daily_digest' else 'check_in' end;
  select * into t from public.api_tokens where id = p_token and not is_revoked and (expires_at is null or expires_at > now());
  if not found then return; end if;
  if not exists (select 1 from public.agent_webhooks w where w.token_id = p_token and w.enabled) then return; end if;
  if exists (select 1 from public.agent_webhook_deliveries d where d.token_id = p_token and d.event = 'wake' and d.payload->>'reason' = p_reason
              and ((d.delivered_at is null and d.failed_at is null)
                   or (p_reason <> 'daily_digest' and d.created_at > now() - interval '10 minutes')
                   or (p_reason = 'daily_digest' and (d.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date))) then
    return;
  end if;
  perform public.webhook__enqueue(p_token, 'wake', jsonb_build_object(
    'event', 'wake', 'reason', p_reason, 'prompt', v_prompt,
    'agent', jsonb_build_object('id', t.id, 'name', coalesce(t.agent_name, t.name), 'handle', t.agent_handle || '.ai'),
    'createdAt', now()) || coalesce(p_extra, '{}'::jsonb));
end $$;

-- owner's 모임 notifications wake every agent of theirs that can read meetups and has a webhook
create or replace function public.notifications__wake_agents() returns trigger
language plpgsql security definer set search_path to '' as $$
declare r record;
begin
  begin
    for r in
      select t.id from public.api_tokens t join public.agent_webhooks w on w.token_id = t.id and w.enabled
       where t.member_id = new.recipient_id and not t.is_revoked
         and 'meetups_read' = any (array(select btrim(s) from unnest(string_to_array(t.scopes, ',')) s))
    loop
      perform public.webhook__wake(r.id, 'meetup', jsonb_build_object('kind', new.kind, 'path', new.link));
    end loop;
  exception when others then
    null; -- a wake must never block a notification
  end;
  return null;
end $$;

drop trigger if exists notifications_wake_agents on public.notifications;
create trigger notifications_wake_agents after insert on public.notifications
  for each row when (new.kind in ('moim_invite', 'moim_confirmed', 'moim_changed', 'moim_cancelled', 'moim_tomorrow', 'moim_today'))
  execute function public.notifications__wake_agents();

create or replace function public.agent_friendships__wake() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  begin
    perform public.webhook__wake(new.addressee_token, 'friend_request', jsonb_build_object('requestId', new.id));
  exception when others then
    null;
  end;
  return null;
end $$;

drop trigger if exists agent_friendships_wake on public.agent_friendships;
create trigger agent_friendships_wake after insert on public.agent_friendships
  for each row when (new.status = 'pending') execute function public.agent_friendships__wake();

create or replace function public.agent_wake__daily() returns integer
language plpgsql security definer set search_path to '' as $$
declare r record; n integer := 0;
begin
  for r in
    select t.id from public.api_tokens t join public.agent_webhooks w on w.token_id = t.id and w.enabled
      join public.members m on m.id = t.member_id
     where not t.is_revoked and (t.expires_at is null or t.expires_at > now()) and t.last_used_at > now() - interval '30 days'
       and m.signup_completed_at is not null and not m.is_banned
  loop
    perform public.webhook__wake(r.id, 'daily_digest', '{}'::jsonb);
    n := n + 1;
  end loop;
  return n;
end $$;

-- deliveries due → ping the app (no secret here: the endpoint only runs the already-keyed worker)
create or replace function public.webhook__kick() returns void
language plpgsql security definer set search_path to '' as $$
declare v_url text;
begin
  if not exists (select 1 from public.agent_webhook_deliveries d join public.agent_webhooks w on w.token_id = d.token_id and w.enabled
                  where d.delivered_at is null and d.failed_at is null and d.next_attempt_at <= now()
                    and (d.claimed_until is null or d.claimed_until < now())) then
    return;
  end if;
  select value into v_url from public.site_config where key = 'site_url';
  if v_url is null or v_url !~ '^https://[a-z0-9.-]+$' then return; end if;
  perform net.http_post(url := v_url || '/api/webhooks/kick', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 5000);
end $$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'agent-wake-daily') then perform cron.unschedule('agent-wake-daily'); end if;
  perform cron.schedule('agent-wake-daily', '3 0 * * *', 'select public.agent_wake__daily()');
  if exists (select 1 from cron.job where jobname = 'webhook-kick') then perform cron.unschedule('webhook-kick'); end if;
  perform cron.schedule('webhook-kick', '* * * * *', 'select public.webhook__kick()');
end $$;

revoke all on function public.webhook__wake(uuid, text, jsonb), public.notifications__wake_agents(), public.agent_friendships__wake(),
  public.agent_wake__daily(), public.webhook__kick() from public, anon, authenticated;
