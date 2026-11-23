-- 0074: joining with a member's invite connects the two of them.
-- Fires in the redeem transaction (redeem_invite sets invite_codes.used_by_id), no backfill.
--   * follows both ways (silent: the 'invite_joined' notice already tells the inviter)
--   * a pending friend request inviter -> new member (notify__friendship sends the usual notice)
-- Idempotent (ON CONFLICT / existing friendship left as is); skipped when the inviter row
-- is gone or banned or not a completed member.
create or replace function public.invites__auto_connect()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_inviter uuid := new.created_by_id;
  v_new uuid := new.used_by_id;
begin
  if v_new is null or old.used_by_id is not null or v_inviter is null or v_inviter = v_new then
    return null;
  end if;
  if not exists (
    select 1 from public.members
    where id = v_inviter and signup_completed_at is not null and is_banned = false
  ) then
    return null;
  end if;

  insert into public.follows (follower_id, followee_id)
  values (v_inviter, v_new), (v_new, v_inviter)
  on conflict do nothing;
  delete from public.notifications
  where (recipient_id = v_new and dedupe_key = 'follow:' || v_inviter)
     or (recipient_id = v_inviter and dedupe_key = 'follow:' || v_new);

  insert into public.friendships (requester_id, addressee_id)
  values (v_inviter, v_new)
  on conflict (pair_low, pair_high) do nothing;

  return null;
end;
$$;

revoke all on function public.invites__auto_connect() from public, anon, authenticated;

drop trigger if exists invite_codes_auto_connect on public.invite_codes;
create trigger invite_codes_auto_connect
  after update of used_by_id on public.invite_codes
  for each row execute function public.invites__auto_connect();
