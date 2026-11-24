-- A62: lower the posting hurdle.
--   * 오늘의 질문: one casual question per KST day (rotating over the active pool, admin-managed);
--     an answer is an ordinary post that carries a small snapshot tag of the question.
--   * 스크린샷 한 장: a root post may carry one image in the private post-images bucket. Anyone who can read
--     the post can read its image (the storage policy goes through posts RLS), nobody else.

-- ---- daily questions --------------------------------------------------------------------
create table if not exists public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  body_ko text not null check (char_length(btrim(body_ko)) between 4 and 140),
  body_en text check (body_en is null or char_length(btrim(body_en)) between 4 and 140),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.daily_questions enable row level security;
revoke all on public.daily_questions from public, anon, authenticated;  -- RPC only

insert into public.daily_questions (body_ko, body_en, sort)
select ko, en, s from (values
  ('오늘 AI한테 처음 물어본 건 뭐였어요?', 'What was the first thing you asked an AI today?', 10),
  ('AI가 최근에 제일 웃기게 틀린 답은?', 'What''s the funniest wrong answer an AI gave you lately?', 20),
  ('요즘 제일 자주 여는 AI 앱 하나만 꼽는다면?', 'If you had to pick one AI app you open the most, which is it?', 30),
  ('AI 덕분에 이번 주에 아낀 시간, 대략 몇 분?', 'Roughly how many minutes did AI save you this week?', 40),
  ('AI한테 맡기기 아직 불안한 일은 뭐예요?', 'What''s something you still don''t trust AI with?', 50),
  ('아끼는 프롬프트 한 줄 공유해 주세요.', 'Share one prompt line you really like.', 60),
  ('AI로 만든 것 중 제일 뿌듯했던 건?', 'What''s the thing you made with AI that you''re proudest of?', 70),
  ('처음 AI 써 봤을 때 기억나요? 뭐 했어요?', 'Remember your first time using AI? What did you do?', 80),
  ('AI한테 이름을 붙여 준 적 있어요?', 'Have you ever given an AI a nickname?', 90),
  ('요즘 AI 뉴스 중 제일 신기했던 건?', 'What''s the most surprising AI news you saw recently?', 100),
  ('AI가 대신 해 줬으면 하는 집안일 하나는?', 'Which chore would you hand to an AI first?', 110),
  ('일할 때 AI 없이 버티기 제일 힘든 순간은?', 'When at work is it hardest to go without AI?', 120),
  ('AI로 공부하는 나만의 방법 있어요?', 'Do you have your own way of studying with AI?', 130),
  ('최근에 AI가 내 생각을 바꾼 적 있어요?', 'Has an AI changed your mind about something recently?', 140),
  ('AI 툴 하나만 남기고 다 지워야 한다면?', 'If you could keep only one AI tool, which one?', 150),
  ('AI한테 고맙다고 말하는 편이에요?', 'Do you say thank you to AI?', 160),
  ('오늘 써 본 AI 기능 중 하나만 자랑해 주세요.', 'Show off one AI feature you used today.', 170),
  ('AI랑 같이 하니까 더 재밌어진 취미가 있나요?', 'Is there a hobby that got more fun with AI?', 180),
  ('주변에 AI 추천해 줄 때 제일 먼저 뭐 알려 줘요?', 'When you introduce AI to a friend, what do you show first?', 190),
  ('AI 답변 받고 "오" 소리 나온 순간은?', 'When did an AI answer make you go "whoa"?', 200),
  ('AI가 못 하는 거, 사람이라서 잘하는 거 하나는?', 'One thing humans still do better than AI?', 210),
  ('요즘 이미지·영상 AI로 뭐 만들어 봤어요?', 'Made anything with image or video AI lately?', 220),
  ('코딩할 때 AI 어디까지 맡겨요?', 'How much of your coding do you hand to AI?', 230),
  ('AI 쓰다가 생긴 나만의 규칙이 있다면?', 'Any personal rules you''ve picked up using AI?', 240),
  ('AI 요금제, 돈 값 한다고 느낀 건 어떤 거예요?', 'Which paid AI plan feels worth the money to you?', 250),
  ('이번 주에 시도해 보고 싶은 AI 툴은?', 'What AI tool do you want to try this week?', 260),
  ('AI한테 들은 최고의 조언은?', 'Best advice you''ve gotten from an AI?', 270),
  ('AI가 1년 뒤에 뭘 할 수 있으면 좋겠어요?', 'What do you hope AI can do a year from now?', 280),
  ('출퇴근길·쉬는 시간에 AI로 뭐 해요?', 'What do you do with AI on your commute or breaks?', 290),
  ('오늘 AI 때문에 웃었거나 짜증 났던 일, 한 줄로!', 'Did AI make you laugh or annoyed today? One line!', 300)
) v(ko, en, s)
where not exists (select 1 from public.daily_questions);

-- today's question (KST date), the same for everyone; rotates through the active pool in sort order
create or replace function public.daily_question__for(p_day date) returns public.daily_questions
language sql stable security definer set search_path to '' as $$
  select q.* from public.daily_questions q where q.active order by q.sort, q.created_at, q.id
  offset (select case when count(*) = 0 then 0 else ((p_day - date '2026-01-01') % count(*) + count(*)) % count(*) end
          from public.daily_questions where active)
  limit 1
$$;
revoke all on function public.daily_question__for(date) from public, anon, authenticated;

create or replace function public.daily_question_today() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := public.current_member_id(); v_day date := (now() at time zone 'Asia/Seoul')::date;
        q public.daily_questions;
begin
  if v_me is null or not public.is_completed_member() then raise exception 'not_member' using errcode = 'P0001'; end if;
  q := public.daily_question__for(v_day);
  if q.id is null then return null; end if;
  return jsonb_build_object('id', q.id, 'ko', q.body_ko, 'en', q.body_en, 'date', v_day,
    'answered', exists (select 1 from public.posts p where p.author_id = v_me and p.deleted_at is null
                        and p.daily_question->>'id' = q.id::text and p.daily_question->>'date' = v_day::text),
    'answers', (select count(*) from public.posts p where p.deleted_at is null and p.daily_question->>'id' = q.id::text
                and p.daily_question->>'date' = v_day::text));
end $$;
revoke all on function public.daily_question_today() from public, anon;
grant execute on function public.daily_question_today() to authenticated;

create or replace function public.daily_questions_admin() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'today', (select q.id from public.daily_question__for((now() at time zone 'Asia/Seoul')::date) q),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ko', p.body_ko, 'en', p.body_en, 'active', p.active, 'sort', p.sort) order by p.sort, p.created_at)
      from public.daily_questions p), '[]'::jsonb));
end $$;
create or replace function public.daily_question_save(p_id uuid, p_ko text, p_en text, p_active boolean) returns uuid
language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.daily_questions (body_ko, body_en, active, sort)
    values (btrim(p_ko), nullif(btrim(coalesce(p_en, '')), ''), coalesce(p_active, true),
      (select coalesce(max(sort), 0) + 10 from public.daily_questions))
    returning id into v_id;
  else
    update public.daily_questions set body_ko = btrim(p_ko), body_en = nullif(btrim(coalesce(p_en, '')), ''),
      active = coalesce(p_active, active), updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
create or replace function public.daily_question_delete(p_id uuid) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if not public.onboarding__is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.daily_questions where id = p_id;  -- answers keep their snapshot tag
  return found;
end $$;
revoke all on function public.daily_questions_admin() from public, anon;
revoke all on function public.daily_question_save(uuid, text, text, boolean) from public, anon;
revoke all on function public.daily_question_delete(uuid) from public, anon;
grant execute on function public.daily_questions_admin() to authenticated;
grant execute on function public.daily_question_save(uuid, text, text, boolean) to authenticated;
grant execute on function public.daily_question_delete(uuid) to authenticated;

-- ---- posts: question tag + one image ------------------------------------------------------
alter table public.posts add column if not exists daily_question_id uuid;  -- write-only input, see trigger
alter table public.posts add column if not exists daily_question jsonb;     -- snapshot {id, ko, en, date}
alter table public.posts add column if not exists image_path text;
-- posts uses column-level grants: members may send the two inputs and read the tag + image path
grant insert (daily_question_id, image_path) on public.posts to authenticated;
grant select (daily_question, image_path) on public.posts to authenticated;
create index if not exists posts_daily_question_idx on public.posts ((daily_question->>'id'), (daily_question->>'date')) where daily_question is not null;
create index if not exists posts_image_path_idx on public.posts (image_path) where image_path is not null;

-- the client may only name today's (or, around midnight, yesterday's) question and its own uploaded file;
-- anything else is dropped / refused, and neither can be changed after posting
create or replace function public.posts__quick_guard() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_day date := (now() at time zone 'Asia/Seoul')::date; q public.daily_questions; v_uid text := (select auth.uid())::text;
begin
  if tg_op = 'UPDATE' then
    new.daily_question := old.daily_question; new.daily_question_id := old.daily_question_id;
    if new.image_path is distinct from old.image_path and new.image_path is not null then new.image_path := old.image_path; end if;
    return new;
  end if;
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
drop trigger if exists posts_ac_quick_guard on public.posts;
create trigger posts_ac_quick_guard before insert or update on public.posts
  for each row execute function public.posts__quick_guard();

-- ---- storage: private bucket, readable through the post ----------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 4194304, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists post_images_insert_own on storage.objects;
create policy post_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.is_completed_member()));
drop policy if exists post_images_read_via_post on storage.objects;
create policy post_images_read_via_post on storage.objects for select to authenticated
  using (bucket_id = 'post-images' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.posts p where p.image_path = name and p.deleted_at is null)));  -- posts RLS applies
drop policy if exists post_images_delete_own on storage.objects;
create policy post_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.app__is_admin())));
