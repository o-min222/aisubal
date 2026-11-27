-- A119: when an admin rejects (or approves/deploys) 화면 피드백, the author gets an in-app
-- bell linking to /me/feedback/{id}. Reject includes the reason and may web-push (if they
-- have a subscription). Approved / deployed are bell-only. The approval webhook is unchanged
-- (still only fired by the approve/resend API, never from this trigger).
-- Authors read their own rows through feedback_mine_* RPCs; the table stays revoke-all.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'comment','reply','like','follow','friend_request','friend_accept','invite_joined','agent_reply','agent_like',
  'gallery_recommended','gallery_approved','gallery_confirmed','gallery_rejected','follow_post','agent_mention',
  'mention','badge','moim_invite','invite_refill','reaction','moim_confirmed','moim_changed','moim_cancelled',
  'moim_tomorrow','moim_today','first_post','digest','digest_hot','digest_pick','digest_nudge','question','repost','feedback',
  'article_published','feedback_reply','feedback_approved','feedback_deployed']));

create or replace function public.feedback__mine_row(f public.feedback_items) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', f.id, 'status', f.status, 'body', f.body, 'route', f.route,
    'hasShot', f.screenshot_path is not null, 'adminNote', f.admin_note,
    'reviewedAt', f.reviewed_at, 'progressNote', f.progress_note, 'progressAt', f.progress_at,
    'createdAt', f.created_at, 'updatedAt', f.updated_at,
    'screenshotPath', f.screenshot_path
  );
$$;
revoke all on function public.feedback__mine_row(public.feedback_items) from public, anon, authenticated;

create or replace function public.feedback_mine_list(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not authorized'; end if;
  return coalesce((select jsonb_agg(public.feedback__mine_row(f) order by f.created_at desc)
    from (select * from public.feedback_items x where x.author_id = v_me
          order by x.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) f), '[]'::jsonb);
end $$;
revoke all on function public.feedback_mine_list(integer) from public, anon, authenticated;
grant execute on function public.feedback_mine_list(integer) to authenticated;

create or replace function public.feedback_mine_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
        f public.feedback_items%rowtype;
begin
  if v_me is null then raise exception 'not authorized'; end if;
  select * into f from public.feedback_items where id = p_id and author_id = v_me;
  if not found then return null; end if;
  return public.feedback__mine_row(f);
end $$;
revoke all on function public.feedback_mine_get(uuid) from public, anon, authenticated;
grant execute on function public.feedback_mine_get(uuid) to authenticated;

create or replace function public.feedback_items__author_notify() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_kind text; v_excerpt text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('rejected', 'approved', 'deployed') then return null; end if;
  if new.author_id is null then return null; end if;
  v_kind := case new.status
    when 'rejected' then 'feedback_reply'
    when 'approved' then 'feedback_approved'
    else 'feedback_deployed' end;
  v_excerpt := case
    when new.status = 'rejected' then nullif(left(btrim(coalesce(new.admin_note, '')), 140), '')
    when new.status = 'deployed' then nullif(left(btrim(coalesce(new.progress_note, '')), 140), '')
    else null end;
  insert into public.notifications (recipient_id, kind, category, actor_kind, target_kind, target_id, link, excerpt, dedupe_key)
  values (new.author_id, v_kind, 'admin', 'someone', 'feedback', new.id, '/me/feedback/' || new.id, v_excerpt,
          'feedback-author:' || new.id || ':' || new.status)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
exception when others then
  raise warning 'feedback_items__author_notify: %', sqlerrm;
  return null;
end $$;
revoke all on function public.feedback_items__author_notify() from public, anon, authenticated;
drop trigger if exists feedback_items_author_notify on public.feedback_items;
create trigger feedback_items_author_notify after update on public.feedback_items
  for each row execute function public.feedback_items__author_notify();

-- Keep A106 (skip push when an admin submits their own feedback). Approved/deployed author
-- notes are bell-only; reject (feedback_reply) may still enqueue a web push.
create or replace function public.push__on_notification() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.kind = 'feedback' and new.actor_member_id is not distinct from new.recipient_id then
    return null;
  end if;
  if new.kind in ('feedback_approved', 'feedback_deployed') then
    return null;
  end if;
  if exists (select 1 from public.push_subscriptions where member_id = new.recipient_id) then
    insert into public.push_outbox(member_id, notification_id) values (new.recipient_id, new.id);
    perform public.push__nudge();
  end if;
  return null;
exception when others then return null;
end;
$$;
revoke all on function public.push__on_notification() from public, anon, authenticated;
