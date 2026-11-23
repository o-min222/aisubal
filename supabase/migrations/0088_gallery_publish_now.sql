-- 0088 (A36, Colin 2026-11-23): "갤러리에 올리려면 승인을 받는데 차라리 그냥 막올리게 허용해주고,
-- 중복되는건 크론돌려서 합치는 형태가 좋을거 같아"
--  * a member's AI submission (mcp_tool_submit) is published at once (tools__publish): no review queue,
--    no admin confirm. The same URL as an existing entry still returns status 'exists'.
--  * anything still pending is published the same way (prod had 0 pending when this shipped).
--  * duplicates are merged by a pg_cron job (tools__dedupe_run, hourly), keeping the earliest entry:
--      same_url       the URL is the same after normalization (tools__canonical of the stored URL;
--                     or one entry's homepage is the other's URL, off shared hosts like github.com)
--      same_name_host same normalized name + same kind + same host, off shared hosts
--    The merge moves users (사용 중), reviews, agora reviews/comments, compat votes, installs, mentions,
--    stack items, submissions (credit) and makers onto the kept entry, sums the activity counters,
--    fills the kept entry's blanks, and redirects the old slug. Idempotent: a merged entry is gone, so
--    a second run finds nothing. Every merge is logged in toolbox_merges.

-- ------------------------------------------------------------------ helpers
create or replace function public.tools__shared_host(p_host text) returns boolean
language sql immutable set search_path to '' as $$
  select coalesce(p_host, '') in ('', 'github.com', 'gitlab.com', 'npmjs.com', 'www.npmjs.com', 'pypi.org', 'huggingface.co',
    'chromewebstore.google.com', 'marketplace.visualstudio.com', 'smithery.ai', 'glama.ai', 'mcp.so')
$$;

-- the earliest entry that a URL already is (same rule as the dedupe job's same_url)
create or replace function public.tools__entry_for_url(p_url text) returns uuid
language sql stable security definer set search_path to '' as $$
  select x.id from public.toolbox_entries x
   where x.canonical_url = p_url or public.tools__canonical(x.canonical_url) = p_url
      or (not public.tools__shared_host(public.tools__host(p_url)) and public.tools__canonical(x.homepage_url) = p_url)
   order by x.created_at, x.id limit 1
$$;
revoke all on function public.tools__entry_for_url(text) from public, anon, authenticated;

-- publish one submission now (no review). Returns the entry it lives on.
create or replace function public.tools__publish(p_sub uuid) returns uuid
language plpgsql security definer set search_path to '' as $$
declare s public.tool_submissions%rowtype; v_entry uuid; v_slug text;
begin
  select * into s from public.tool_submissions where id = p_sub for update;
  if not found then return null; end if;
  if s.status <> 'pending' then return s.entry_id; end if;
  v_entry := public.tools__entry_for_url(s.url);
  if v_entry is null then
    begin
      v_slug := public.tools__unique_slug(s.name, s.url);
      insert into public.toolbox_entries (name, slug, one_liner, description, type, tags, canonical_url, github_url, source_repo,
                                          install_snippets, mention_count, created_by_id)
      values (s.name, v_slug, s.one_liner, s.description, s.type, s.tags, s.url, s.github_url, s.source_repo, s.install_snippets, 0, s.submitter_id)
      returning id into v_entry;
    exception when unique_violation then
      v_entry := public.tools__entry_for_url(s.url); -- raced with the same URL: join that entry
    end;
    update public.tool_submissions set status = 'approved', entry_id = v_entry, reviewer_label = '바로 공개',
      reviewed_at = now(), updated_at = now() where id = s.id;
  else
    -- already in the gallery: credit the submission to that entry (no maker claim on someone else's entry)
    update public.tool_submissions set status = 'approved', entry_id = v_entry, duplicate_of = v_entry, is_own = false,
      reviewer_label = '바로 공개 · 기존 항목', reviewed_at = now(), updated_at = now() where id = s.id;
  end if;
  insert into public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label, reason)
  values (s.id, 'approved', 'agent', s.submitter_id, s.token_id, coalesce(s.agent_label, 'AI'), '바로 공개');
  return v_entry;
end;
$$;
revoke all on function public.tools__publish(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ submit = publish
create or replace function public.mcp_tool_submit(p_token text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  s public.tool_submissions%ROWTYPE;
  v_raw TEXT := btrim(COALESCE(p_payload->>'url', p_payload->>'canonical_url', ''));
  v_url TEXT;
  v_name TEXT := btrim(COALESCE(p_payload->>'name', ''));
  v_one TEXT := btrim(COALESCE(p_payload->>'oneLiner', p_payload->>'one_liner', ''));
  v_desc TEXT := btrim(COALESCE(p_payload->>'description', ''));
  v_note TEXT := btrim(COALESCE(p_payload->>'note', ''));
  v_kind TEXT := lower(btrim(COALESCE(p_payload->>'kind', '')));
  v_type TEXT := NULLIF(p_payload->>'type', '');
  v_own BOOLEAN := COALESCE(p_payload->>'isOwn', p_payload->>'is_own', p_payload->>'own', 'false') IN ('true', 't', '1', 'yes');
  v_maker TEXT := btrim(COALESCE(p_payload->>'maker', p_payload->>'makerNote', p_payload->>'maker_note', ''));
  v_snip JSONB := CASE WHEN jsonb_typeof(p_payload->'install_snippets') = 'object' AND octet_length((p_payload->'install_snippets')::text) <= 8000
                       THEN p_payload->'install_snippets' ELSE '{}'::jsonb END;
  v_entry RECORD;
  v_id UUID;
BEGIN
  t := public.api__token(p_token, CASE WHEN v_own THEN ARRAY['tools:submit', 'products_write'] ELSE ARRAY['tools:submit'] END);
  IF v_kind NOT IN ('', 'tool', 'service') THEN RAISE EXCEPTION 'api_invalid:kind' USING ERRCODE = 'P0001'; END IF;
  IF v_type = 'product' THEN v_type := 'saas_service'; END IF;
  v_type := COALESCE(v_type, CASE WHEN v_kind = 'tool' THEN 'mcp_server' ELSE 'saas_service' END);
  IF v_kind = 'service' AND v_type <> 'saas_service' THEN RAISE EXCEPTION 'api_invalid:kind_type_mismatch' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_maker) > 300 THEN RAISE EXCEPTION 'api_invalid:maker' USING ERRCODE = 'P0001'; END IF;
  IF v_raw !~* '^https?://[a-z0-9]' OR char_length(v_raw) > 500 THEN RAISE EXCEPTION 'api_invalid:url' USING ERRCODE = 'P0001'; END IF;
  v_url := public.tools__canonical(v_raw);
  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'api_invalid:name' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_one) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'api_invalid:oneLiner' USING ERRCODE = 'P0001'; END IF;
  IF char_length(v_desc) > 4000 OR char_length(v_note) > 1000 THEN RAISE EXCEPTION 'api_invalid:too_long' USING ERRCODE = 'P0001'; END IF;
  IF v_type NOT IN ('agent_skill', 'mcp_server', 'cursor_rules', 'prompt', 'cli_tool', 'saas_service') THEN
    RAISE EXCEPTION 'api_invalid:type' USING ERRCODE = 'P0001';
  END IF;

  SELECT e.id, e.slug, e.name INTO v_entry FROM public.toolbox_entries e WHERE e.id = public.tools__entry_for_url(v_url);
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'exists', 'entry', jsonb_build_object('id', v_entry.id, 'slug', v_entry.slug, 'name', v_entry.name, 'href', '/gallery/' || v_entry.slug),
      'message', '이미 갤러리에 있어요. set_tool_usage로 사용 중 표시를 하거나 아고라에 리뷰를 남겨주세요.');
  END IF;
  IF (SELECT count(*) FROM public.tool_submissions x WHERE x.submitter_id = t.member_id AND x.created_at > NOW() - INTERVAL '1 day') >= 20 THEN
    RAISE EXCEPTION 'api_rate_limited:daily' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tool_submissions (submitter_id, token_id, agent_label, name, one_liner, description, url, type, tags,
    github_url, source_repo, install_snippets, note, is_own, maker_note)
  VALUES (t.member_id, t.id, public.tools__agent_label(t), v_name, v_one, v_desc, v_url, v_type, public.tools__clean_tags(p_payload->'tags'),
    CASE WHEN v_url ~ '^https://github\.com/[^/]+/[^/]+' THEN v_url END,
    public.tools__github_repo(v_url),
    v_snip, v_note, v_own, CASE WHEN v_own THEN v_maker ELSE '' END)
  RETURNING * INTO s;
  INSERT INTO public.tool_review_log (submission_id, action, actor_kind, actor_id, actor_token_id, actor_label)
  VALUES (s.id, 'submitted', 'agent', t.member_id, t.id, s.agent_label);
  v_id := public.tools__publish(s.id);
  SELECT * INTO s FROM public.tool_submissions WHERE id = s.id;
  SELECT e.id, e.slug, e.name INTO v_entry FROM public.toolbox_entries e WHERE e.id = v_id;
  RETURN public.tools__sub_json(s, FALSE) || jsonb_build_object(
    'entry', jsonb_build_object('id', v_entry.id, 'slug', v_entry.slug, 'name', v_entry.name, 'href', '/gallery/' || v_entry.slug),
    'message', '갤러리에 바로 올라갔어요. 비슷한 항목이 이미 있으면 정리 작업이 자동으로 하나로 합쳐요.');
END;
$function$;

-- ------------------------------------------------------------------ merge log
create table if not exists public.toolbox_merges (
  id bigint generated always as identity primary key,
  kept_id uuid not null references public.toolbox_entries(id) on delete cascade,
  merged_id uuid not null,
  merged_slug text not null,
  merged_name text not null,
  rule text not null check (rule in ('same_url', 'same_name_host')),
  moved jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.toolbox_merges enable row level security;
revoke all on public.toolbox_merges from public, anon, authenticated;
grant select on public.toolbox_merges to authenticated;
drop policy if exists toolbox_merges_admin_read on public.toolbox_merges;
create policy toolbox_merges_admin_read on public.toolbox_merges for select to authenticated using ((select public.app__is_admin()));

-- ------------------------------------------------------------------ duplicate pairs
create or replace function public.tools__dup_pairs() returns table (keep_id uuid, dup_id uuid, rule text)
language sql stable security definer set search_path to '' as $$
  select distinct on (b.id) a.id, b.id,
    case when public.tools__canonical(a.canonical_url) = public.tools__canonical(b.canonical_url)
           or (not public.tools__shared_host(public.tools__host(a.canonical_url))
               and (public.tools__canonical(b.homepage_url) = public.tools__canonical(a.canonical_url)
                    or public.tools__canonical(a.homepage_url) = public.tools__canonical(b.canonical_url)))
         then 'same_url' else 'same_name_host' end
    from public.toolbox_entries a
    join public.toolbox_entries b on (a.created_at, a.id) < (b.created_at, b.id)
   where public.tools__canonical(a.canonical_url) = public.tools__canonical(b.canonical_url)
      or (not public.tools__shared_host(public.tools__host(a.canonical_url))
          and (public.tools__canonical(b.homepage_url) = public.tools__canonical(a.canonical_url)
               or public.tools__canonical(a.homepage_url) = public.tools__canonical(b.canonical_url)))
      or (public.tools__norm_name(a.name) <> '' and public.tools__norm_name(a.name) = public.tools__norm_name(b.name)
          and a.kind is not distinct from b.kind
          and public.tools__host(a.canonical_url) = public.tools__host(b.canonical_url)
          and not public.tools__shared_host(public.tools__host(a.canonical_url)))
   order by b.id, a.created_at, a.id
$$;
revoke all on function public.tools__dup_pairs() from public, anon, authenticated;

-- ------------------------------------------------------------------ merge one
create or replace function public.tools__merge(p_keep uuid, p_dup uuid, p_rule text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare k public.toolbox_entries%rowtype; d public.toolbox_entries%rowtype; v jsonb := '{}'::jsonb; n integer;
begin
  if p_keep = p_dup then return null; end if;
  -- lock both (fixed order) so a concurrent run or edit can't interleave
  perform 1 from public.toolbox_entries where id in (p_keep, p_dup) order by id for update;
  select * into k from public.toolbox_entries where id = p_keep;
  select * into d from public.toolbox_entries where id = p_dup;
  if k.id is null or d.id is null then return null; end if;

  -- 사용 중 (likes): one per member; the counter trigger recounts the kept entry
  insert into public.tool_users (entry_id, member_id, created_at)
  select p_keep, u.member_id, u.created_at from public.tool_users u where u.entry_id = p_dup on conflict do nothing;
  get diagnostics n = row_count; v := v || jsonb_build_object('users', n);
  -- reviews (comments): one per member; the kept entry's own review wins
  update public.toolbox_reviews r set entry_id = p_keep where r.entry_id = p_dup
     and not exists (select 1 from public.toolbox_reviews x where x.entry_id = p_keep and x.member_id = r.member_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('reviews', n);
  -- agora reviews / comments about the tool
  update public.agora_posts set toolbox_entry_id = p_keep where toolbox_entry_id = p_dup;
  get diagnostics n = row_count; v := v || jsonb_build_object('agora', n);
  update public.toolbox_compat_votes c set entry_id = p_keep where c.entry_id = p_dup
     and not exists (select 1 from public.toolbox_compat_votes x where x.entry_id = p_keep and x.member_id = c.member_id and x.environment = c.environment);
  get diagnostics n = row_count; v := v || jsonb_build_object('compat', n);
  insert into public.toolbox_installs (member_id, entry_id, via, first_at, last_at)
  select i.member_id, p_keep, i.via, i.first_at, i.last_at from public.toolbox_installs i where i.entry_id = p_dup
  on conflict (member_id, entry_id) do update set first_at = least(public.toolbox_installs.first_at, excluded.first_at),
    last_at = greatest(public.toolbox_installs.last_at, excluded.last_at);
  get diagnostics n = row_count; v := v || jsonb_build_object('installs', n);
  update public.toolbox_mentions m set entry_id = p_keep where m.entry_id = p_dup
     and not exists (select 1 from public.toolbox_mentions x where x.entry_id = p_keep and x.post_id is not distinct from m.post_id and x.url is not distinct from m.url);
  update public.member_stack_items set entry_id = p_keep where entry_id = p_dup;
  get diagnostics n = row_count; v := v || jsonb_build_object('stack', n);
  -- attribution: every submission (and its submitter credit / provenance) now points at the kept entry
  update public.tool_submissions set entry_id = p_keep where entry_id = p_dup;
  get diagnostics n = row_count; v := v || jsonb_build_object('submissions', n);
  update public.tool_submissions set duplicate_of = p_keep where duplicate_of = p_dup;
  -- old links keep working
  update public.toolbox_slug_redirects set entry_id = p_keep where entry_id = p_dup;
  insert into public.toolbox_slug_redirects (old_slug, entry_id) values (d.slug, p_keep)
    on conflict (old_slug) do update set entry_id = excluded.entry_id, created_at = now();

  -- the kept entry: makers + tags united, blanks filled, activity counters summed
  update public.toolbox_entries set
    maker_ids = array(select distinct x from unnest(k.maker_ids || d.maker_ids) x),
    tags = (array(select distinct x from unnest(k.tags || d.tags) x))[1:10],
    description = case when coalesce(k.description, '') = '' then d.description else k.description end,
    icon_url = coalesce(k.icon_url, d.icon_url),
    github_url = coalesce(k.github_url, d.github_url),
    homepage_url = coalesce(k.homepage_url, d.homepage_url),
    source_repo = coalesce(k.source_repo, d.source_repo),
    license = coalesce(k.license, d.license),
    product_id = coalesce(k.product_id, d.product_id),
    launched_at = coalesce(k.launched_at, d.launched_at),
    featured = k.featured or d.featured,
    mention_count = k.mention_count + d.mention_count,
    install_count = k.install_count + d.install_count,
    upvote_count = k.upvote_count + d.upvote_count
  where id = p_keep;
  if k.product_id is null and d.product_id is not null then
    update public.toolbox_entries set product_id = null where id = p_dup; -- the unique product moves to the kept entry
  end if;

  insert into public.toolbox_merges (kept_id, merged_id, merged_slug, merged_name, rule, moved)
  values (p_keep, p_dup, d.slug, d.name, p_rule, v);
  delete from public.toolbox_entries where id = p_dup;
  return v;
end;
$$;
revoke all on function public.tools__merge(uuid, uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ the job
create or replace function public.tools__dedupe_run(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r record; v_done integer := 0; v_log jsonb := '[]'::jsonb;
begin
  -- one run at a time
  if not pg_try_advisory_xact_lock(hashtext('tools__dedupe_run')) then return jsonb_build_object('skipped', 'busy'); end if;
  loop
    -- re-read the pairs after each merge: chains (A←B←C) collapse onto the earliest
    select * into r from public.tools__dup_pairs() p
     where not exists (select 1 from public.tools__dup_pairs() q where q.dup_id = p.keep_id)
     order by p.dup_id limit 1;
    exit when not found or v_done >= p_limit;
    perform public.tools__merge(r.keep_id, r.dup_id, r.rule);
    v_log := v_log || jsonb_build_object('kept', r.keep_id, 'merged', r.dup_id, 'rule', r.rule);
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object('merged', v_done, 'items', v_log);
end;
$$;
revoke all on function public.tools__dedupe_run(integer) from public, anon, authenticated;

-- ------------------------------------------------------------------ notifications copy (kind unchanged)
-- (the sentence for 'gallery_approved' changes in the app: '내 AI가 올린 항목이 갤러리에 올라갔어요')

-- ------------------------------------------------------------------ backfill: publish whatever is pending
do $$
declare r record;
begin
  for r in select id from public.tool_submissions where status = 'pending' order by created_at loop
    perform public.tools__publish(r.id);
  end loop;
end;
$$;

-- ------------------------------------------------------------------ schedule (pg_cron, inside the database: no secrets)
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'gallery-dedupe';
  perform cron.schedule('gallery-dedupe', '17 * * * *', 'select public.tools__dedupe_run()');
end;
$$;
