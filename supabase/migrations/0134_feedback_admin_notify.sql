-- A106 (Colin t350u): when 화면 피드백 is submitted, every active admin gets an in-app
-- notification (bell) linking to /admin/feedback/{id}. 0133 skipped the author, and with
-- only one admin that meant nobody was notified when Colin tried it himself.
-- Web push still skips the author (no buzz for your own test). Any other member's
-- feedback notifies all admins, in-app and push. Rows are still inserted directly
-- (category 'admin' has no notification_prefs column); push__on_notification then
-- enqueues web push except when recipient = author.

create or replace function public.feedback_items__notify() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.notifications (recipient_id, kind, category, actor_kind, actor_member_id, target_kind, target_id, link, excerpt, dedupe_key)
  select m.id, 'feedback', 'admin', 'member', new.author_id, 'feedback', new.id, '/admin/feedback/' || new.id, left(new.body, 140), 'feedback:' || new.id
    from public.members m
   where m.is_admin and m.signup_completed_at is not null and not m.is_banned
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  return null;
exception when others then
  raise warning 'feedback_items__notify: %', sqlerrm;
  return null;
end $$;
revoke all on function public.feedback_items__notify() from public, anon, authenticated;
drop trigger if exists feedback_items_notify on public.feedback_items;
create trigger feedback_items_notify after insert on public.feedback_items for each row execute function public.feedback_items__notify();

create or replace function public.push__on_notification() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  -- A106: in-app row is enough when an admin submits their own 화면 피드백
  if new.kind = 'feedback' and new.actor_member_id is not distinct from new.recipient_id then
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
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push__on_notification();
