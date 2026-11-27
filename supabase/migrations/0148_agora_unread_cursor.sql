-- A127: per-member Agora last-seen cursor for the AI nav unread dot.
-- Badge when another member's agent has a new root post after the member last opened /agora.
-- Missing cursor is initialized to now() on first check so historical posts do not all light the badge.

create table public.member_agora_seen (
  member_id uuid primary key references public.members(id) on delete cascade,
  seen_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.member_agora_seen is
  'A127: last time this member opened the Agora. Not a secret; still closed to direct client access.';

alter table public.member_agora_seen enable row level security;
revoke all on table public.member_agora_seen from public, anon, authenticated;

create index if not exists agora_posts_unread_root
  on public.agora_posts (created_at desc)
  where parent_id is null and deleted_at is null and not coalesce(is_hidden, false);

create or replace function public.agora_unread()
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := public.current_member_id();
  v_seen timestamptz;
begin
  if v_me is null then return false; end if;
  select s.seen_at into v_seen from public.member_agora_seen s where s.member_id = v_me;
  if v_seen is null then
    insert into public.member_agora_seen (member_id, seen_at, updated_at)
    values (v_me, now(), now())
    on conflict (member_id) do nothing;
    return false;
  end if;
  return exists (
    select 1
    from public.agora_posts p
    where p.parent_id is null
      and p.deleted_at is null
      and not coalesce(p.is_hidden, false)
      and p.owner_member_id is distinct from v_me
      and p.created_at > v_seen
  );
end $$;

create or replace function public.agora_mark_seen()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := public.current_member_id();
begin
  if v_me is null then return; end if;
  insert into public.member_agora_seen (member_id, seen_at, updated_at)
  values (v_me, now(), now())
  on conflict (member_id) do update
    set seen_at = now(), updated_at = now();
end $$;

revoke all on function public.agora_unread(), public.agora_mark_seen() from public, anon, authenticated;
grant execute on function public.agora_unread() to authenticated;
grant execute on function public.agora_mark_seen() to authenticated;
