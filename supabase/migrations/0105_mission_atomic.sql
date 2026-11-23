-- A54 fix: the mission answer is posted and the mission marked done in one transaction.
-- onboarding_mission_submit replaces "app inserts the post, then calls onboarding_mission_complete",
-- which could leave a stray post when the second call failed. Idempotent: a member who is
-- already done gets their existing mission post back and no new post is written.

alter table public.members add column if not exists first_mission_post uuid references public.posts(id) on delete set null;

-- A55 alerts, shared and internal (not callable by clients)
create or replace function public.onboarding__alert_first_post(p_me uuid, p_inviter uuid, p_post uuid, p_excerpt text) returns integer
language plpgsql security definer set search_path to '' as $$
declare v_max integer; v_count integer; v_n integer := 0; a record;
begin
  if p_inviter is not null then
    perform public.notify__push(p_inviter, 'first_post', 'newcomers', 'member', p_me, null, null, 'post', p_post, p_post,
      '/posts/' || p_post, p_excerpt, 'firstpost:' || p_me);
    v_n := v_n + 1;
  end if;
  select coalesce((select nullif(value, '')::integer from public.site_config where key = 'newcomer_alert_max'), 100) into v_max;
  select count(*) into v_count from public.members where signup_completed_at is not null and not is_banned;
  if v_max > 0 and v_count <= v_max then
    for a in select id from public.members where is_admin and not is_banned and id <> p_me and id is distinct from p_inviter loop
      perform public.notify__push(a.id, 'first_post', 'newcomers', 'member', p_me, null, null, 'post', p_post, p_post,
        '/posts/' || p_post, p_excerpt, 'firstpost:' || p_me);
      v_n := v_n + 1;
    end loop;
  end if;
  return v_n;
end $$;
revoke all on function public.onboarding__alert_first_post(uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.onboarding_mission_submit(p_answer text, p_locale text default 'ko') returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_me uuid := public.current_member_id(); m public.members%rowtype;
  v_ans text := regexp_replace(coalesce(p_answer, ''), '^\s+|\s+$', '', 'g');
  v_prompt jsonb; v_q text; v_body text; v_post uuid; v_n integer;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not_member' using errcode = 'P0001'; end if;
  -- row lock: two concurrent submits serialize here, the second sees first_mission_at set
  select * into m from public.members where id = v_me for update;
  if m.first_mission_at is not null then
    return jsonb_build_object('ok', true, 'first', false, 'post', m.first_mission_post, 'notified', 0);
  end if;
  if char_length(v_ans) < 10 or char_length(v_ans) > 1500 then raise exception 'mission_bad_answer' using errcode = 'P0001'; end if;

  v_prompt := public.onboarding_prompt_mine();
  v_q := case when p_locale = 'en' and nullif(v_prompt->>'en', '') is not null then v_prompt->>'en' else v_prompt->>'ko' end;
  v_body := case when nullif(btrim(v_q), '') is null then v_ans else 'Q. ' || btrim(v_q) || E'\n\n' || v_ans end;

  insert into public.posts (title, content, author_id, author_kind, posted_as, visibility, agent_interaction)
    values ('', v_body, v_me, 'member', 'real', 'members', 'humans_only') returning id into v_post;
  update public.members set first_mission_at = now(), first_mission_post = v_post where id = v_me;
  v_n := public.onboarding__alert_first_post(v_me, m.invited_by_id, v_post, v_body);
  return jsonb_build_object('ok', true, 'first', true, 'post', v_post, 'notified', v_n);
end $$;
revoke all on function public.onboarding_mission_submit(text, text) from public, anon;
grant execute on function public.onboarding_mission_submit(text, text) to authenticated;

-- the two-step path is gone
drop function if exists public.onboarding_mission_complete(uuid);
