-- A112: root posts and replies may both carry one image. 0112/0137 refused a
-- path when parent_id was set, and posts__edit ignored p_set_image on replies.
-- notify__post_reply adds a photo mark to the excerpt so the bell shows that
-- the reply has an image. Storage policies already read via posts.image_path
-- (RLS) and only the author can insert under their auth uid folder; no new
-- table grants (image_path stays insert/select, writes go through the definer
-- RPCs and the guarded insert).

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
    if v_uid is null
       or new.image_path !~ ('^' || v_uid || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'post-images' and o.name = new.image_path) then
      raise exception 'post_image_invalid' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.posts__quick_guard() from public, anon, authenticated;

create or replace function public.posts__edit(
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
         image_path = case when p_set_image then p_image_path else p.image_path end
   where p.id = p_post_id and p.author_id = v_me and p.author_kind = 'member'
     and p.deleted_at is null and not p.is_hidden;
  get diagnostics v_n = row_count;
  if v_n = 0 then return null; end if;
  return v_at;
end $$;
revoke all on function public.posts__edit(uuid, text, text, jsonb, boolean, text) from public, anon;
grant execute on function public.posts__edit(uuid, text, text, jsonb, boolean, text) to authenticated;

create or replace function public.notify__post_reply() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare
  parent public.posts%rowtype; root public.posts%rowtype;
  v_actor_kind text; v_actor uuid; v_label text; v_avatar text; v_owner uuid;
  v_link text := '/posts/' || coalesce(new.root_id, new.id);
  v_excerpt text := left(btrim(coalesce(new.content, '')), 140);
begin
  if new.parent_id is null or new.is_hidden or new.deleted_at is not null then return null; end if;
  if new.image_path is not null then
    if v_excerpt = '' then v_excerpt := '📷';
    else v_excerpt := left(v_excerpt, 130) || ' · 📷';
    end if;
  end if;
  select * into parent from public.posts where id = new.parent_id;
  if not found then return null; end if;
  select * into root from public.posts where id = coalesce(new.root_id, parent.id);
  if new.author_kind = 'agent' then
    v_actor_kind := 'agent'; v_actor := null; v_label := new.agent_name; v_owner := new.author_id;
  elsif new.posted_as = 'nickname' then
    v_actor_kind := 'member'; v_actor := null;
    select np.nickname, np.avatar_url into v_label, v_avatar from public.nickname_profiles np where np.member_id = new.author_id;
    v_owner := new.author_id;
  else
    v_actor_kind := 'member'; v_actor := new.author_id; v_owner := new.author_id;
  end if;
  -- the comment/reply being answered (members' own rows; skip the writer and the agent's owner)
  if parent.author_kind = 'member' and parent.author_id is distinct from v_owner then
    perform public.notify__push(parent.author_id,
      case when new.author_kind = 'agent' then 'agent_reply' when parent.parent_id is null then 'comment' else 'reply' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', parent.id, new.id, v_link, v_excerpt);
  end if;
  -- the thread's author too, when they aren't the one answered
  if root.id is not null and root.id <> parent.id and root.author_kind = 'member'
     and root.author_id is distinct from v_owner and root.author_id is distinct from parent.author_id then
    perform public.notify__push(root.author_id, case when new.author_kind = 'agent' then 'agent_reply' else 'comment' end,
      'replies', v_actor_kind, v_actor, v_label, v_avatar, 'post', root.id, new.id, v_link, v_excerpt);
  end if;
  return null;
end;
$$;
