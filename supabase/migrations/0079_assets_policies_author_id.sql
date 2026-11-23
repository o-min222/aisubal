-- 0053 stopped members reading posts.author_id (it would reveal who is behind a 부캐 post), but the
-- assets policies still compared p.author_id inside their subqueries. Postgres checks column privileges
-- for those subqueries as the caller, so every member read of assets failed with
-- "permission denied for table posts" and pages embedding assets returned 500.
-- Ownership is now answered by a definer helper that returns only a boolean, never the author.

create or replace function public.post_is_mine(pid uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.posts p where p.id = pid and p.author_id = public.current_member_id())
$$;
revoke all on function public.post_is_mine(uuid) from public;
grant execute on function public.post_is_mine(uuid) to authenticated;

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets for select to authenticated using (
  public.is_completed_member() and exists (
    select 1 from public.posts p
    where p.id = assets.post_id
      and (p.is_hidden = false
        or public.post_is_mine(p.id)
        or exists (select 1 from public.members where members.auth_id = (select auth.uid()) and members.is_admin))
  )
);

drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets for insert to authenticated with check (public.post_is_mine(assets.post_id));

drop policy if exists assets_update on public.assets;
create policy assets_update on public.assets for update to authenticated using (public.post_is_mine(assets.post_id));

drop policy if exists assets_delete on public.assets;
create policy assets_delete on public.assets for delete to authenticated using (public.post_is_mine(assets.post_id));
