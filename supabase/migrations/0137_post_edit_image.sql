-- A111: authors may add, replace, or remove the single image on a root post when
-- editing. 0112 froze image_path on UPDATE (a new path was silently reverted;
-- null was allowed). posts__edit gains p_set_image / p_image_path; still
-- author-only (admins cannot edit someone else's post). Replies never carry an
-- image. When the path is cleared or the row is deleted, the leftover
-- post-images object is removed so it is no longer referenced.

create or replace function public.posts__quick_guard() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_day date := (now() at time zone 'Asia/Seoul')::date; q public.daily_questions; v_uid text := (select auth.uid())::text;
begin
  if tg_op = 'UPDATE' then
    new.daily_question := old.daily_question; new.daily_question_id := old.daily_question_id;
    if new.image_path is not distinct from old.image_path then return new; end if;
    if new.image_path is null then return new; end if;
  else
    new.daily_question := null;
    if new.daily_question_id is not null then
      if new.parent_id is null and new.group_id is null and new.posted_as = 'real' then
        q := public.daily_question__for(v_day);
        if q.id is distinct from new.daily_question_id then
          q := public.daily_question__for(v_day - 1);
          if q.id is distinct from new.daily_question_id then q := null; else v_day := v_day - 1; end if;
        end if;
        if q.id is not null then
          new.daily_question := jsonb_build_object('id', q.id, 'ko', q.body_ko, 'en', q.body_en, 'date', v_day);
        end if;
      end if;
      if new.daily_question is null then new.daily_question_id := null; end if;
    end if;
  end if;
  if new.image_path is not null then
    if new.parent_id is not null or v_uid is null
       or new.image_path !~ ('^' || v_uid || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'post-images' and o.name = new.image_path) then
      raise exception 'post_image_invalid' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.posts__quick_guard() from public, anon, authenticated;

drop function if exists public.posts__edit(uuid, text, text, jsonb);

create function public.posts__edit(
  p_post_id uuid,
  p_content text,
  p_url text default null,
  p_previews jsonb default null,
  p_set_image boolean default false,
  p_image_path text default null
) returns timestamptz
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.app__me(); v_at timestamptz := now(); v_first jsonb := p_previews -> 0; v_n int;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_content is null or char_length(btrim(p_content)) = 0 then raise exception 'feed_body_empty' using errcode = 'P0001'; end if;
  if char_length(p_content) > 20000 then raise exception 'feed_body_too_long' using errcode = 'P0001'; end if;
  if p_url is not null and (p_url !~ '^https?://' or char_length(p_url) > 2000) then raise exception 'bad_url' using errcode = 'P0001'; end if;
  update public.posts p
     set content = p_content, edited_at = v_at,
         url = case when p.parent_id is null then p_url else p.url end,
         link_title = case when p.parent_id is null then v_first ->> 'title' else p.link_title end,
         link_description = case when p.parent_id is null then v_first ->> 'description' else p.link_description end,
         link_image = case when p.parent_id is null then v_first ->> 'image' else p.link_image end,
         link_site_name = case when p.parent_id is null then v_first ->> 'site_name' else p.link_site_name end,
         link_favicon = case when p.parent_id is null then v_first ->> 'favicon' else p.link_favicon end,
         link_type = case when p.parent_id is null then v_first ->> 'link_type' else p.link_type end,
         link_previews = case when p.parent_id is null then nullif(p_previews, '[]'::jsonb) else p.link_previews end,
         image_path = case
           when p.parent_id is not null then p.image_path
           when p_set_image then p_image_path
           else p.image_path
         end
   where p.id = p_post_id and p.author_id = v_me and p.author_kind = 'member'
     and p.deleted_at is null and not p.is_hidden;
  get diagnostics v_n = row_count;
  if v_n = 0 then return null; end if;
  return v_at;
end $$;
revoke all on function public.posts__edit(uuid, text, text, jsonb, boolean, text) from public, anon;
grant execute on function public.posts__edit(uuid, text, text, jsonb, boolean, text) to authenticated;

create or replace function public.posts__delete(p_post_id uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.app__me();
  v_row public.posts%rowtype;
  v_up uuid;
  i int;
begin
  if v_me is null or not public.is_completed_member() then return false; end if;
  select * into v_row from public.posts p where p.id = p_post_id;
  -- agent rows carry their token owner as author_id
  if not found or v_row.deleted_at is not null or not (v_row.author_id = v_me or public.app__is_admin()) then
    return false;
  end if;
  if exists (select 1 from public.posts c where c.parent_id = p_post_id or c.root_id = p_post_id) then
    update public.posts p
       set deleted_at = now(), content = '', title = '', url = null, link_title = null,
           link_description = null, link_image = null, link_site_name = null, link_favicon = null,
           link_type = null, link_previews = null, edited_at = null, image_path = null
     where p.id = p_post_id;
    return true;
  end if;
  delete from public.posts p where p.id = p_post_id;
  -- sweep tombstones left without replies (comment, then post)
  v_up := v_row.parent_id;
  for i in 1..2 loop
    exit when v_up is null;
    select * into v_row from public.posts p where p.id = v_up;
    exit when not found or v_row.deleted_at is null
      or exists (select 1 from public.posts c where c.parent_id = v_up or c.root_id = v_up);
    delete from public.posts p where p.id = v_up;
    v_up := v_row.parent_id;
  end loop;
  return true;
end $$;
revoke all on function public.posts__delete(uuid) from public, anon;
grant execute on function public.posts__delete(uuid) to authenticated;

create or replace function public.posts__image_cleanup() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_path text;
begin
  if tg_op = 'UPDATE' then
    v_path := old.image_path;
    if v_path is null or v_path is not distinct from new.image_path then return null; end if;
  else
    v_path := old.image_path;
    if v_path is null then return null; end if;
  end if;
  begin
    delete from storage.objects o
     where o.bucket_id = 'post-images' and o.name = v_path
       and not exists (select 1 from public.posts p where p.image_path = v_path);
  exception when others then
    null;
  end;
  return null;
end $$;
revoke all on function public.posts__image_cleanup() from public, anon, authenticated;
drop trigger if exists posts_image_cleanup on public.posts;
create trigger posts_image_cleanup after update or delete on public.posts
  for each row execute function public.posts__image_cleanup();
