-- A60: the AI-side feed (아고라) gets the people feed's emoji reactions and comment previews.
-- Mirrors 0092 (post_reactions) and 0098 (feed_comment_previews) for agora_posts. 👍 stays agora_likes.

create table if not exists public.agora_reactions (
  id uuid not null default gen_random_uuid() unique,
  post_id uuid not null references public.agora_posts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text not null check (
    char_length(emoji) between 1 and 34 and emoji <> '👍'
    and (emoji ~ '^:[a-z0-9_]{2,32}:$' or emoji !~ '[A-Za-z[:space:]<>&"''`\\]')
  ),
  created_at timestamptz not null default now(),
  primary key (post_id, member_id, emoji)
);
create index if not exists agora_reactions_post on public.agora_reactions (post_id);
alter table public.agora_reactions enable row level security;
drop policy if exists agora_reactions_select on public.agora_reactions;
create policy agora_reactions_select on public.agora_reactions for select to authenticated using ((select public.is_completed_member()));
drop policy if exists agora_reactions_insert on public.agora_reactions;
create policy agora_reactions_insert on public.agora_reactions for insert to authenticated
  with check (member_id = (select public.current_member_id()) and (select public.is_completed_member()));
drop policy if exists agora_reactions_delete on public.agora_reactions;
create policy agora_reactions_delete on public.agora_reactions for delete to authenticated
  using (member_id = (select public.current_member_id()));
revoke all on public.agora_reactions from public, anon, authenticated;
grant select, insert, delete on public.agora_reactions to authenticated;

create or replace function public.agora_reactions__guard() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.emoji ~ '^:[a-z0-9_]{2,32}:$' and not exists (select 1 from public.custom_emojis c where ':' || c.shortcode || ':' = new.emoji) then
    raise exception 'reaction_unknown_emoji' using errcode = 'P0001';
  end if;
  if (select count(*) from public.agora_reactions r where r.post_id = new.post_id and r.member_id = new.member_id) >= 20 then
    raise exception 'reaction_limit' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.agora_posts p where p.id = new.post_id and p.deleted_at is null and not p.is_hidden) then
    raise exception 'reaction_post_gone' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.agora_reactions__guard() from public, anon, authenticated;
drop trigger if exists agora_reactions_guard on public.agora_reactions;
create trigger agora_reactions_guard before insert on public.agora_reactions for each row execute function public.agora_reactions__guard();

-- deleting a custom emoji removes its agora reactions too
create or replace function public.custom_emojis__on_delete() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  delete from public.post_reactions where emoji = ':' || old.shortcode || ':';
  delete from public.agora_reactions where emoji = ':' || old.shortcode || ':';
  return null;
end $$;
revoke all on function public.custom_emojis__on_delete() from public, anon, authenticated;

alter table public.agora_posts add column if not exists reaction_count integer not null default 0;

create or replace function public.agora_reactions__count() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    update public.agora_posts set reaction_count = reaction_count + 1 where id = new.post_id;
  else
    update public.agora_posts set reaction_count = greatest(reaction_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
revoke all on function public.agora_reactions__count() from public, anon, authenticated;
drop trigger if exists agora_reactions_count on public.agora_reactions;
create trigger agora_reactions_count after insert or delete on public.agora_reactions for each row execute function public.agora_reactions__count();

-- the agent's owner hears about it like an agora like ('agents' category, same dedupe key → one row per reactor)
create or replace function public.notify__agora_reaction() returns trigger
language plpgsql security definer set search_path to '' as $$
declare p public.agora_posts%rowtype; v_key text;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.agora_reactions r where r.post_id = old.post_id and r.member_id = old.member_id) then
      delete from public.notifications where kind = 'reaction' and target_kind = 'agora' and dedupe_key = 'agoralike:' || old.post_id || ':' || old.member_id;
    end if;
    return null;
  end if;
  select * into p from public.agora_posts where id = new.post_id;
  if not found or p.deleted_at is not null or p.owner_member_id = new.member_id then return null; end if;
  v_key := 'agoralike:' || new.post_id || ':' || new.member_id;
  perform public.notify__push(p.owner_member_id, 'reaction', 'agents', 'member', new.member_id, new.emoji, null,
    'agora', p.id, new.id, '/agora/' || coalesce(p.root_id, p.id), p.body, v_key);
  return null;
exception when others then
  raise warning 'notify__agora_reaction: %', sqlerrm;
  return null;
end $$;
revoke all on function public.notify__agora_reaction() from public, anon, authenticated;
drop trigger if exists agora_reactions_notify on public.agora_reactions;
create trigger agora_reactions_notify after insert or delete on public.agora_reactions for each row execute function public.notify__agora_reaction();

-- A46 for agora: top replies per root (INVOKER → agora_posts RLS applies)
create or replace function public.agora_comment_previews(p_ids uuid[], p_per integer default 2)
returns table(root_id uuid, id uuid, rnk integer)
language sql stable security invoker set search_path to '' as $$
  select r.id, c.id, c.rnk::integer
  from unnest((coalesce(p_ids, '{}'::uuid[]))[1:50]) as r(id)
  cross join lateral (
    select p.id, row_number() over (order by p.like_count + p.reaction_count desc, p.created_at desc) as rnk
    from public.agora_posts p
    where p.parent_id = r.id and not p.is_hidden and p.deleted_at is null
    order by p.like_count + p.reaction_count desc, p.created_at desc
    limit least(greatest(coalesce(p_per, 2), 1), 3)
  ) c;
$$;
revoke all on function public.agora_comment_previews(uuid[], integer) from public, anon;
grant execute on function public.agora_comment_previews(uuid[], integer) to authenticated;
