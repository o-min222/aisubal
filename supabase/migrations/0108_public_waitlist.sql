-- A57: public waitlist (/join) for people without a Google login or an invite.
-- Separate from public.waitlist (signed-in users without an invite, auth_id NOT NULL).
-- Insert only through waitlist_join (anon): deduped by email, rate-limited per client and globally.
-- The response never says whether an email was already on the list.

create table if not exists public.public_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text check (reason is null or char_length(reason) <= 300),
  source text check (source is null or source ~ '^[a-z0-9_-]{1,32}$'),
  locale text check (locale is null or locale in ('ko', 'en')),
  client_hash text,
  status text not null default 'waiting' check (status in ('waiting', 'invited', 'dismissed')),
  invite_code text,
  invited_at timestamptz,
  invited_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists public_waitlist_email_key on public.public_waitlist (lower(email));
create index if not exists public_waitlist_client_idx on public.public_waitlist (client_hash, created_at);
create index if not exists public_waitlist_status_idx on public.public_waitlist (status, created_at);
alter table public.public_waitlist enable row level security;
revoke all on public.public_waitlist from public, anon, authenticated;

create or replace function public.waitlist_join(p_email text, p_reason text default null, p_source text default null,
  p_locale text default null, p_client text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_client text := left(nullif(btrim(coalesce(p_client, '')), ''), 64);
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'waitlist_bad_email' using errcode = 'P0001';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then raise exception 'waitlist_bad_reason' using errcode = 'P0001'; end if;
  -- rate limits: 5 sign-ups per client per hour, 300 per hour overall
  if v_client is not null and (select count(*) from public.public_waitlist
      where client_hash = v_client and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'waitlist_rate' using errcode = 'P0001';
  end if;
  if (select count(*) from public.public_waitlist where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'waitlist_rate' using errcode = 'P0001';
  end if;
  insert into public.public_waitlist (email, reason, source, locale, client_hash)
    values (v_email, v_reason,
      case when p_source ~ '^[a-z0-9_-]{1,32}$' then p_source end,
      case when p_locale in ('ko', 'en') then p_locale end, v_client)
    on conflict (lower(email)) do nothing;
  return jsonb_build_object('ok', true, 'waiting', public.waitlist_count());
end $$;

create or replace function public.waitlist_count() returns integer
language sql stable security definer set search_path to '' as $$
  select count(*)::integer from public.public_waitlist where status = 'waiting';
$$;

-- admin: list, invite (issues a code owned by the admin; nothing is sent), dismiss / restore
create or replace function public.waitlist_admin(p_status text default 'waiting') returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'email', w.email, 'reason', w.reason, 'source', w.source,
      'locale', w.locale, 'status', w.status, 'code', w.invite_code, 'used', ic.used_at is not null,
      'created_at', w.created_at, 'invited_at', w.invited_at) order by w.created_at desc)
    from (select * from public.public_waitlist where p_status = 'all' or status = p_status order by created_at desc limit 200) w
    left join public.invite_codes ic on ic.code = w.invite_code), '[]'::jsonb);
end $$;

create or replace function public.waitlist_invite(p_id uuid) returns text
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); w public.public_waitlist%rowtype; v_code text;
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into w from public.public_waitlist where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if w.invite_code is not null then return w.invite_code; end if;
  loop
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.invite_codes where code = v_code);
  end loop;
  -- batch 0: outside the member's refill batches, so it never triggers or blocks a refill
  insert into public.invite_codes (code, created_by_id, batch, note) values (v_code, v_me, 0, 'waitlist');
  update public.public_waitlist set status = 'invited', invite_code = v_code, invited_at = now(), invited_by = v_me where id = p_id;
  return v_code;
end $$;

create or replace function public.waitlist_set_status(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_status not in ('waiting', 'dismissed') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  update public.public_waitlist set status = p_status where id = p_id and invite_code is null;
  return found;
end $$;

revoke all on function public.waitlist_join(text, text, text, text, text), public.waitlist_count(), public.waitlist_admin(text),
  public.waitlist_invite(uuid), public.waitlist_set_status(uuid, text) from public, anon, authenticated;
grant execute on function public.waitlist_join(text, text, text, text, text), public.waitlist_count() to anon, authenticated;
grant execute on function public.waitlist_admin(text), public.waitlist_invite(uuid), public.waitlist_set_status(uuid, text) to authenticated;
