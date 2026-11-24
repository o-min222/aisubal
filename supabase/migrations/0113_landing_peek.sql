-- A64: signed-out visitors see a blurred peek of a few popular 전체 회원 posts on the landing page.
--   * only real-name, members-visible, root, non-group, non-agent posts by completed, unbanned members who
--     haven't opted out (members.public_peek); never hidden/deleted, never with an image,
--     never anything that looks like personal info (phone, email, 주민번호, card, address)
--   * the RPC returns only a short line (title or first line, links and @mentions stripped, ≤ 60 chars),
--     reaction + comment counts and the age in days — no id, no author, no body
--   * admin kill switch: site_config landing_peek = 'false'

alter table public.members add column if not exists public_peek boolean not null default true;

-- looks like personal info (same kinds as src/lib/pii.ts; stricter: any 13–16 digit run counts as a card)
create or replace function public.peek__has_pii(p_text text) returns boolean
language sql immutable set search_path to '' as $$
  select coalesce(p_text, '') ~ '(^|[^0-9])[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])\s?[-–]\s?[1-8][0-9]{6}([^0-9]|$)'
      or coalesce(p_text, '') ~ '(^|[^0-9])([0-9]{4}[ -]?){3}[0-9]{1,4}([^0-9]|$)'
      or coalesce(p_text, '') ~ '(^|[^0-9.])(\+82[ -]?1[016789]|01[016789]|0(2|[3-6][1-5]|70))[ .-]?[0-9]{3,4}[ .-]?[0-9]{4}([^0-9]|$)'
      or coalesce(p_text, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      or coalesce(p_text, '') ~ '[가-힣]{1,10}(구|군|시)\s[가-힣0-9]{1,20}(로|길)\s?[0-9]{1,4}'
      or coalesce(p_text, '') ~ '[가-힣]{1,10}동\s[0-9]{1,5}(-[0-9]{1,5})?\s?번지'
      or coalesce(p_text, '') ~ '[0-9]{1,4}동\s?[0-9]{1,5}호'
$$;
revoke all on function public.peek__has_pii(text) from public, anon, authenticated;

-- the one line a visitor sees
create or replace function public.peek__line(p public.posts) returns text
language plpgsql immutable set search_path to '' as $$
declare v text; l text;
begin
  v := coalesce(nullif(btrim(p.title), ''), '');
  if v = '' then
    foreach l in array regexp_split_to_array(coalesce(p.content, ''), '\r?\n') loop
      l := regexp_replace(l, '(https?://|www\.)\S+', '', 'gi');
      l := regexp_replace(l, '@[A-Za-z0-9_.가-힣-]+', '', 'g');
      l := btrim(regexp_replace(l, '\s+', ' ', 'g'));
      if char_length(l) >= 4 then v := l; exit; end if;
    end loop;
  else
    v := btrim(regexp_replace(regexp_replace(v, '(https?://|www\.)\S+', '', 'gi'), '@[A-Za-z0-9_.가-힣-]+', '', 'g'));
  end if;
  if char_length(v) < 4 then return null; end if;
  if char_length(v) > 60 then v := left(v, 59) || '…'; end if;
  return v;
end $$;
revoke all on function public.peek__line(public.posts) from public, anon, authenticated;

create or replace function public.landing_peek() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v jsonb;
begin
  if coalesce((select value from public.site_config where key = 'landing_peek'), 'true') = 'false' then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('line', x.line, 'reactions', x.reactions, 'comments', x.comments, 'days', x.days)
                            order by x.score desc, x.created_at desc), '[]'::jsonb) into v
  from (
    select public.peek__line(p) as line,
           coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) as reactions,
           coalesce(p.reply_count, 0) as comments,
           coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + 2 * coalesce(p.reply_count, 0) as score,
           greatest(0, (now()::date - p.created_at::date)) as days,
           p.created_at
    from public.posts p
    join public.members m on m.id = p.author_id
    where p.parent_id is null and p.deleted_at is null and not coalesce(p.is_hidden, false)
      and p.visibility = 'members' and p.group_id is null and p.as_group_id is null
      and p.posted_as = 'real' and p.author_kind = 'member' and p.agent_token_id is null
      and p.image_path is null
      and p.created_at > now() - interval '30 days'
      and m.signup_completed_at is not null and not m.is_banned and m.public_peek
      and coalesce(p.like_count, 0) + coalesce(p.reaction_count, 0) + coalesce(p.reply_count, 0) >= 1
      and not public.peek__has_pii(coalesce(p.title, '') || E'\n' || coalesce(p.content, ''))
      and public.peek__line(p) is not null
    order by 4 desc, p.created_at desc
    limit 5
  ) x;
  return v;
end $$;
revoke all on function public.landing_peek() from public, anon;
grant execute on function public.landing_peek() to anon, authenticated;

-- the member's own switch (설정 → 계정 → 개인정보 보호)
create or replace function public.peek_pref_get() returns boolean
language sql stable security definer set search_path to '' as $$
  select m.public_peek from public.members m where m.id = public.current_member_id()
$$;
create or replace function public.peek_pref_set(p_on boolean) returns boolean
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null or p_on is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  update public.members set public_peek = p_on where id = v_me;
  return p_on;
end $$;
revoke all on function public.peek_pref_get(), public.peek_pref_set(boolean) from public, anon;
grant execute on function public.peek_pref_get(), public.peek_pref_set(boolean) to authenticated;
