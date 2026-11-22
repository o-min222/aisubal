-- 0068 (C): "관심 없음" on recommendations. A member hides a recommended tool / person /
-- agora review / feed post; recommendation queries skip those refs. Private to the member.

create table if not exists public.rec_dismissals (
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('tool', 'member', 'agora', 'post')),
  ref text not null check (length(ref) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (member_id, kind, ref)
);
alter table public.rec_dismissals enable row level security;
revoke all on public.rec_dismissals from anon, authenticated;
grant select on public.rec_dismissals to authenticated;
drop policy if exists rec_dismissals_own on public.rec_dismissals;
create policy rec_dismissals_own on public.rec_dismissals for select to authenticated
  using (member_id in (select m.id from public.members m where m.auth_id = auth.uid()));

create or replace function public.rec_dismiss(p_kind text, p_ref text) returns void
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.app__me(); v_n int;  -- app__me raises unless a completed member
begin
  select count(*) into v_n from public.rec_dismissals where member_id = v_me;
  if v_n >= 2000 then  -- keep the newest 1999
    delete from public.rec_dismissals d where d.member_id = v_me and d.ctid in (
      select ctid from public.rec_dismissals where member_id = v_me order by created_at asc limit v_n - 1999);
  end if;
  insert into public.rec_dismissals (member_id, kind, ref) values (v_me, p_kind, btrim(p_ref))
  on conflict (member_id, kind, ref) do update set created_at = now();
end $$;

create or replace function public.rec_undismiss(p_kind text, p_ref text) returns void
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := public.app__me();
begin
  delete from public.rec_dismissals where member_id = v_me and kind = p_kind and ref = btrim(p_ref);
end $$;

revoke all on function public.rec_dismiss(text, text) from public, anon;
revoke all on function public.rec_undismiss(text, text) from public, anon;
grant execute on function public.rec_dismiss(text, text) to authenticated;
grant execute on function public.rec_undismiss(text, text) to authenticated;
