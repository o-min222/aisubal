-- 0100 · A49: one-tap 좋아요 on gallery entries (list rows + panel header).
-- Same shape as tool_users ('나도 써요'): own-row table under RLS, a SECURITY DEFINER counter trigger,
-- and the guard keeps members from writing the counter on entries they created.
create table if not exists public.toolbox_likes (
  entry_id uuid not null references public.toolbox_entries(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, member_id)
);
create index if not exists toolbox_likes_member_idx on public.toolbox_likes (member_id, created_at desc);
alter table public.toolbox_likes enable row level security;

drop policy if exists toolbox_likes_select on public.toolbox_likes;
drop policy if exists toolbox_likes_insert on public.toolbox_likes;
drop policy if exists toolbox_likes_delete on public.toolbox_likes;
-- only my own likes are rows I can see; everyone sees the total on toolbox_entries.like_count
create policy toolbox_likes_select on public.toolbox_likes for select to authenticated
  using ((select public.is_completed_member()) and member_id = (select public.current_member_id()));
create policy toolbox_likes_insert on public.toolbox_likes for insert to authenticated
  with check ((select public.is_completed_member()) and member_id = (select public.current_member_id()));
create policy toolbox_likes_delete on public.toolbox_likes for delete to authenticated
  using (member_id = (select public.current_member_id()));

revoke all on public.toolbox_likes from public, anon, authenticated;
grant select, insert, delete on public.toolbox_likes to authenticated;

alter table public.toolbox_entries add column if not exists like_count integer not null default 0;

create or replace function public.toolbox_likes_counter()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v uuid := coalesce(new.entry_id, old.entry_id);
begin
  update public.toolbox_entries set like_count = (select count(*) from public.toolbox_likes where entry_id = v) where id = v;
  return null;
end;
$function$;
revoke all on function public.toolbox_likes_counter() from public, anon, authenticated;
drop trigger if exists toolbox_likes_counter on public.toolbox_likes;
create trigger toolbox_likes_counter after insert or delete on public.toolbox_likes
  for each row execute function public.toolbox_likes_counter();

create or replace function public.toolbox_entries_guard()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.product_id := null; new.launched_at := null; new.user_count := 0; new.upvote_count := 0;
      new.ai_rating_avg := 0; new.ai_rating_count := 0; new.maker_ids := '{}'; new.like_count := 0;
      if new.type = 'product' then new.type := 'saas_service'; end if;
    else
      new.product_id := old.product_id; new.launched_at := old.launched_at; new.user_count := old.user_count;
      new.upvote_count := old.upvote_count; new.ai_rating_avg := old.ai_rating_avg; new.ai_rating_count := old.ai_rating_count;
      new.maker_ids := old.maker_ids; new.like_count := old.like_count;
      if new.type = 'product' and old.type <> 'product' then new.type := old.type; end if;
    end if;
  end if;
  return new;
end;
$function$;
