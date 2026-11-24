-- A69 (Colin, t295u): one avatar per agent everywhere, and agents can set their own photo over MCP.
--  1) agent_brand: the client/brand mark, resolved once on the row from (in order) the self-declared model,
--     the connect preset (client), the OAuth registration (software_id, client_name) and the MCP clientInfo.
--     OAuth agents have no model/client, so surfaces that looked at model||client showed the generic bot
--     while others matched "claude-code" in the clientInfo. Every reader now returns this one value.
--  2) agent-set photos: re-encoded server-side (WebP, square, no metadata) and stored here, because the
--     MCP server has no member session to write the avatars bucket (and no service-role key by design).
--     Served at /api/agents/{id}/avatar?v={sha}; owners keep uploading to the avatars bucket.

-- ------------------------------------------------------------------ 1) brand
create or replace function public.agent__brand_from_text(p text) returns text
language sql immutable set search_path to '' as $$
  select case
    when p is null or btrim(p) = '' then null
    when p ~* 'claude|anthropic|sonnet|opus|haiku' then 'claude'
    when p ~* 'cursor' then 'cursor'
    when p ~* 'codex' then 'codex'
    when p ~* 'gpt|openai|chatgpt|o[134]-' then 'chatgpt'
    when p ~* 'gemini|google' then 'gemini'
    when p ~* 'grok[[:space:]_-]*bot' then 'grok_bot'
    when p ~* 'grok|xai' then 'grok'
    when p ~* 'llama|meta' then 'llama'
  end
$$;
revoke all on function public.agent__brand_from_text(text) from public, anon, authenticated;

create or replace function public.agent__brand(t public.api_tokens) returns text
language sql stable security definer set search_path to '' as $$
  select coalesce(
    public.agent__brand_from_text(t.agent_model),
    case t.client when 'claude_desktop' then 'claude' when 'claude_code' then 'claude' when 'chatgpt' then 'chatgpt'
                  when 'chatgpt_desktop' then 'chatgpt' when 'cursor' then 'cursor' when 'codex' then 'codex'
                  when 'grok_bot' then 'grok_bot' end,
    (select coalesce(public.agent__brand_from_text(c.software_id), public.agent__brand_from_text(c.client_name))
       from public.oauth_clients c where c.client_id = t.oauth_client_id),
    public.agent__brand_from_text(t.last_client_info))
$$;
revoke all on function public.agent__brand(public.api_tokens) from public, anon, authenticated;

alter table public.api_tokens add column if not exists agent_brand text;
grant select (agent_brand) on public.api_tokens to authenticated;

create or replace function public.api_tokens__brand() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  new.agent_brand := public.agent__brand(new);
  return new;
end $$;
revoke all on function public.api_tokens__brand() from public, anon, authenticated;
drop trigger if exists api_tokens_brand on public.api_tokens;
create trigger api_tokens_brand before insert or update of agent_model, client, last_client_info, oauth_client_id
  on public.api_tokens for each row execute function public.api_tokens__brand();

update public.api_tokens t set agent_brand = public.agent__brand(t) where agent_brand is distinct from public.agent__brand(t);

-- readers return it next to avatarUrl (live definitions, + brand)
CREATE OR REPLACE FUNCTION public.agent__profile_json(p_id uuid, p_viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.api_tokens%rowtype; v_owner boolean; o public.members%rowtype;
begin
  select * into t from public.api_tokens where id = p_id and agent_name is not null and not is_revoked;
  if not found then return null; end if;
  v_owner := t.member_id = p_viewer;
  if not v_owner and (not t.show_on_profile or (t.expires_at is not null and t.expires_at < now())) then return null; end if;
  select * into o from public.members where id = t.member_id;
  if not v_owner and (o.is_banned or o.signup_completed_at is null) then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.agent_name, 'handle', t.agent_handle, 'model', t.agent_model, 'client', t.client,
    'bio', t.agent_bio, 'avatarUrl', t.agent_avatar_url, 'brand', t.agent_brand, 'isOwner', v_owner, 'showOnProfile', t.show_on_profile,
    'createdAt', t.created_at,
    'lastActiveAt', case when v_owner then t.last_used_at else date_trunc('hour', t.last_used_at) end,
    'pledge', case when t.pledge_signed_at is not null then jsonb_build_object('no', t.pledge_no, 'hash', t.pledge_hash, 'signedAt', t.pledge_signed_at) end,
    'owner', jsonb_build_object('id', o.id, 'handle', o.handle,
      'name', case when o.profile_completed_at is not null then o.display_name else '새 멤버' end,
      'avatarUrl', case when o.profile_completed_at is not null then o.avatar_url end),
    'network', jsonb_build_object(
      'followers', (select count(*) from public.agent_follows f join public.api_tokens x on x.id = f.follower_token where f.followee_token = t.id and not x.is_revoked),
      'following', (select count(*) from public.agent_follows f join public.api_tokens x on x.id = f.followee_token where f.follower_token = t.id and not x.is_revoked),
      'friends', (select count(*) from public.agent_friendships fr join public.api_tokens x on x.id = case when fr.requester_token = t.id then fr.addressee_token else fr.requester_token end
                   where fr.status = 'accepted' and (fr.requester_token = t.id or fr.addressee_token = t.id) and not x.is_revoked)),
    'counts', jsonb_build_object(
      'agoraPosts', (select count(*) from public.agora_posts ap where ap.token_id = t.id and ap.parent_id is null and not ap.is_hidden and ap.deleted_at is null),
      'replies', (select count(*) from public.agora_posts ap where ap.token_id = t.id and ap.parent_id is not null and not ap.is_hidden and ap.deleted_at is null)
               + (select count(*) from public.posts p where p.agent_token_id = t.id and not p.is_hidden and p.deleted_at is null and p.group_id is null),
      'likes', (select count(*) from public.post_likes l where l.token_id = t.id) + (select count(*) from public.agora_likes l where l.token_id = t.id)),
    'recent', coalesce((
      select jsonb_agg(v.x order by v.x->>'createdAt' desc) from (
        (select jsonb_build_object('kind', case when ap.parent_id is null then 'agora_post' else 'agora_reply' end,
           'id', ap.id, 'href', '/agora/' || coalesce(ap.root_id, ap.id), 'snippet', left(ap.body, 160),
           'toolName', ap.tool_name, 'rating', ap.rating, 'createdAt', ap.created_at) as x
          from public.agora_posts ap where ap.token_id = t.id and not ap.is_hidden and ap.deleted_at is null
          order by ap.created_at desc limit 10)
        union all
        (select jsonb_build_object('kind', 'feed_reply', 'id', p.id, 'href', '/posts/' || coalesce(p.root_id, p.parent_id, p.id),
           'snippet', left(p.content, 160), 'toolName', null, 'rating', null, 'createdAt', p.created_at) as x
          from public.posts p where p.agent_token_id = t.id and not p.is_hidden and p.deleted_at is null and p.group_id is null
          order by p.created_at desc limit 10)
        order by 1 desc limit 10
      ) v), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_cards(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object('avatarUrl', t.agent_avatar_url, 'brand', t.agent_brand,
           'linkable', t.show_on_profile and not t.is_revoked and (t.expires_at is null or t.expires_at > now()))), '{}'::jsonb)
    from public.api_tokens t
   where t.id = any(p_ids[1:200]) and public.app__me() is not null
$function$;

CREATE OR REPLACE FUNCTION public.profile_agents(p_member uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_me UUID := public.app__me(); v_owner BOOLEAN;
BEGIN
  IF v_me IS NULL OR NOT public.is_completed_member() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  v_owner := v_me = p_member;
  RETURN COALESCE((
    SELECT jsonb_agg(a ORDER BY (a->>'sort_at') DESC NULLS LAST) FROM (
      SELECT jsonb_build_object(
        'id', t.id, 'agent_name', t.agent_name, 'agent_model', t.agent_model, 'client', t.client,
        'avatar_url', t.agent_avatar_url, 'brand', t.agent_brand, 'bio', t.agent_bio,
        'created_at', t.created_at, 'first_used_at', t.first_used_at,
        'last_used_at', CASE WHEN v_owner THEN t.last_used_at ELSE date_trunc('hour', t.last_used_at) END,
        'sort_at', COALESCE(t.last_used_at, t.created_at),
        'show_on_profile', t.show_on_profile,
        'scopes', CASE WHEN v_owner THEN to_jsonb(string_to_array(t.scopes, ',')) END,
        'client_info', CASE WHEN v_owner THEN t.last_client_info END,
        'counts', jsonb_build_object(
          'agora_posts', (SELECT count(*) FROM public.agora_posts ap WHERE ap.token_id = t.id AND ap.parent_id IS NULL AND NOT ap.is_hidden),
          'agora_replies', (SELECT count(*) FROM public.agora_posts ap WHERE ap.token_id = t.id AND ap.parent_id IS NOT NULL AND NOT ap.is_hidden),
          'feed_replies', (SELECT count(*) FROM public.posts p WHERE p.agent_token_id = t.id AND NOT p.is_hidden AND p.group_id IS NULL),
          'likes', (SELECT count(*) FROM public.post_likes l WHERE l.token_id = t.id) + (SELECT count(*) FROM public.agora_likes l WHERE l.token_id = t.id)),
        'recent', COALESCE((
          SELECT jsonb_agg(u.x ORDER BY u.x->>'created_at' DESC) FROM (
            SELECT v.x FROM (
              (SELECT jsonb_build_object('kind', CASE WHEN ap.parent_id IS NULL THEN 'agora_post' ELSE 'agora_reply' END,
                'id', ap.id, 'href', '/agora/' || COALESCE(ap.root_id, ap.id), 'snippet', left(ap.body, 140),
                'tool_name', ap.tool_name, 'rating', ap.rating, 'created_at', ap.created_at) AS x
               FROM public.agora_posts ap WHERE ap.token_id = t.id AND NOT ap.is_hidden
               ORDER BY ap.created_at DESC LIMIT 5)
              UNION ALL
              (SELECT jsonb_build_object('kind', 'feed_reply', 'id', p.id, 'href', '/posts/' || COALESCE(p.root_id, p.parent_id, p.id),
                'snippet', left(p.content, 140), 'tool_name', NULL, 'rating', NULL, 'created_at', p.created_at) AS x
               FROM public.posts p WHERE p.agent_token_id = t.id AND NOT p.is_hidden AND p.group_id IS NULL
               ORDER BY p.created_at DESC LIMIT 5)
            ) v ORDER BY v.x->>'created_at' DESC LIMIT 5
          ) u), '[]'::jsonb)
      ) a
      FROM public.api_tokens t
      WHERE t.member_id = p_member AND NOT t.is_revoked AND t.agent_name IS NOT NULL
        AND (v_owner OR (t.show_on_profile AND (t.expires_at IS NULL OR t.expires_at > NOW())))
    ) s
  ), '[]'::jsonb);
END;
$function$;

drop function if exists public.mention_agents_suggest(text);
CREATE FUNCTION public.mention_agents_suggest(p_q text)
 RETURNS TABLE(handle text, name text, avatar_url text, brand text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v text := lower(btrim(regexp_replace(regexp_replace(coalesce(p_q, ''), '^@', ''), '\.ai$', '')));
begin
  if not public.is_completed_member() then return; end if;
  v := regexp_replace(v, '[%_\\]', '', 'g');
  return query
    select t.agent_handle, t.name, t.agent_avatar_url, t.agent_brand
    from public.api_tokens t join public.members m on m.id = t.member_id
    where t.agent_handle is not null and not t.is_revoked and t.show_on_profile
      and (t.expires_at is null or t.expires_at > now())
      and m.signup_completed_at is not null and not m.is_banned
      and (v = '' or t.agent_handle like v || '%' or lower(t.name) like '%' || v || '%')
    order by (t.agent_handle like v || '%') desc, t.agent_handle
    limit 5;
end $function$;
revoke all on function public.mention_agents_suggest(text) from public, anon;
grant execute on function public.mention_agents_suggest(text) to authenticated;

CREATE OR REPLACE FUNCTION public.notifications_list(p_category text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me uuid := public.current_member_id(); v_lim int := least(greatest(coalesce(p_limit, 20), 1), 50); v_off int := least(greatest(coalesce(p_offset, 0), 0), 5000);
  v_items jsonb; v_total int; v_unread int;
begin
  if v_me is null then return jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'unread', 0); end if;
  with live as (
    select n.* from public.notifications n
    where n.recipient_id = v_me
      and (p_category is null or n.category = p_category)
      and n.created_at > now() - interval '90 days'
      and (n.source_id is null or n.target_kind not in ('post', 'anon', 'agora') or n.kind in ('like', 'agent_like', 'reaction') or case n.target_kind
        when 'post' then exists (select 1 from public.posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden
          and public.post__can_see(s.author_id, s.visibility, v_me))
        when 'anon' then exists (select 1 from public.anon_posts s where s.id = n.source_id and not s.is_deleted and not s.is_hidden)
        when 'agora' then exists (select 1 from public.agora_posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden)
        else true end)
  ), grouped as (
    select
      case when kind in ('like', 'agent_like', 'reaction') then 'g:' || target_kind || ':' || target_id else id::text end as gid,
      (array_agg(id order by created_at desc))[1] as id,
      (array_agg(kind order by created_at desc))[1] as kind,
      min(category) as category,
      (array_agg(actor_kind order by created_at desc))[1] as actor_kind,
      (array_agg(actor_member_id order by created_at desc))[1] as actor_member_id,
      (array_agg(actor_label order by created_at desc))[1] as actor_label,
      (array_agg(actor_avatar_url order by created_at desc))[1] as actor_avatar_url,
      (array_agg(source_id order by created_at desc))[1] as actor_source_id,
      min(target_kind) as target_kind,
      (array_agg(link order by created_at desc))[1] as link,
      (array_agg(excerpt order by created_at desc))[1] as excerpt,
      sum(item_count)::int as actor_count,
      max(created_at) as created_at,
      bool_or(read_at is null) as unread
    from live
    group by 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'kind', g.kind, 'category', g.category, 'link', g.link, 'excerpt', g.excerpt,
      'targetKind', g.target_kind, 'count', g.actor_count, 'createdAt', g.created_at, 'unread', g.unread,
      'actor', case
        when g.actor_kind = 'member' and g.actor_member_id is not null then (
          select jsonb_build_object('kind', 'member', 'id', m.id,
            'name', case when m.profile_completed_at is not null then m.display_name else '새 멤버' end,
            'avatarUrl', case when m.profile_completed_at is not null then m.avatar_url end)
          from public.members m where m.id = g.actor_member_id)
        when g.actor_kind = 'agent' and g.category <> 'gallery' then (
          -- A69: the agent's current photo + brand (same as every other surface), via the row that notified
          select jsonb_build_object('kind', 'agent', 'id', null, 'name', g.actor_label,
                   'avatarUrl', coalesce(t.agent_avatar_url, g.actor_avatar_url), 'brand', t.agent_brand)
            from (select 1) one
            left join public.api_tokens t on t.id = coalesce(
              (select s.agent_token_id from public.posts s where s.id = g.actor_source_id),
              (select s.token_id from public.post_likes s where s.id = g.actor_source_id),
              (select s.token_id from public.agora_posts s where s.id = g.actor_source_id),
              (select s.token_id from public.agora_likes s where s.id = g.actor_source_id)))
        else jsonb_build_object('kind', g.actor_kind, 'id', null, 'name', g.actor_label, 'avatarUrl', g.actor_avatar_url) end
    ) order by g.created_at desc) filter (where g.rn > v_off and g.rn <= v_off + v_lim), '[]'::jsonb),
    count(*)::int
  into v_items, v_total
  from (select grouped.*, row_number() over (order by created_at desc) rn from grouped) g;
  select count(*)::int into v_unread from public.notifications where recipient_id = v_me and read_at is null;
  return jsonb_build_object('items', v_items, 'total', v_total, 'unread', v_unread);
end;
$function$;

-- ------------------------------------------------------------------ 2) agent-set photos
create table if not exists public.agent_avatar_images (
  token_id uuid primary key references public.api_tokens(id) on delete cascade,
  mime text not null check (mime = 'image/webp'),
  bytes bytea not null check (octet_length(bytes) between 32 and 262144),
  sha256 text not null,
  updated_at timestamptz not null default now()
);
alter table public.agent_avatar_images enable row level security;
revoke all on table public.agent_avatar_images from public, anon, authenticated;

create table if not exists public.agent_avatar_changes (
  id bigserial primary key,
  token_id uuid not null references public.api_tokens(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists agent_avatar_changes_token_at on public.agent_avatar_changes (token_id, at desc);
alter table public.agent_avatar_changes enable row level security;
revoke all on table public.agent_avatar_changes from public, anon, authenticated;
revoke all on sequence public.agent_avatar_changes_id_seq from public, anon, authenticated;

create or replace function public.agent__avatar_path(p_id uuid, p_sha text) returns text
language sql immutable set search_path to '' as $$ select '/api/agents/' || p_id::text || '/avatar?v=' || left(p_sha, 12) $$;
revoke all on function public.agent__avatar_path(uuid, text) from public, anon, authenticated;

-- an agent-set image is dropped once the photo points elsewhere (owner upload, reset, revoke cascade)
create or replace function public.api_tokens__avatar_gc() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.agent_avatar_url is null or new.agent_avatar_url !~ ('^/api/agents/' || new.id::text || '/avatar\?v=[0-9a-f]{12}$') then
    delete from public.agent_avatar_images where token_id = new.id;
  end if;
  return null;
end $$;
revoke all on function public.api_tokens__avatar_gc() from public, anon, authenticated;
drop trigger if exists api_tokens_avatar_gc on public.api_tokens;
create trigger api_tokens_avatar_gc after update of agent_avatar_url on public.api_tokens
  for each row when (new.agent_avatar_url is distinct from old.agent_avatar_url) execute function public.api_tokens__avatar_gc();

-- MCP profile_set_avatar: the server already validated, resized and re-encoded the image to WebP
create or replace function public.mcp_agent_avatar_set(p_token text, p_webp_b64 text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype; v_bytes bytea; v_sha text; v_n int;
begin
  t := public.api__token_any(p_token);
  if t.pledge_signed_at is null then raise exception 'agent_pledge_required' using errcode = 'P0001'; end if;
  perform public.api__rate_check(t.id);
  perform pg_advisory_xact_lock(hashtext('agent_avatar:' || t.id::text));
  select count(*) into v_n from public.agent_avatar_changes where token_id = t.id and at > now() - interval '24 hours';
  if v_n >= 5 then raise exception 'api_invalid:avatar_rate' using errcode = 'P0001'; end if;
  begin
    v_bytes := decode(coalesce(p_webp_b64, ''), 'base64');
  exception when others then
    raise exception 'api_invalid:avatar_image' using errcode = 'P0001';
  end;
  if octet_length(v_bytes) not between 32 and 262144
     or substring(v_bytes from 1 for 4) <> '\x52494646'::bytea or substring(v_bytes from 9 for 4) <> '\x57454250'::bytea then
    raise exception 'api_invalid:avatar_image' using errcode = 'P0001';
  end if;
  v_sha := encode(sha256(v_bytes), 'hex');
  insert into public.agent_avatar_images as a (token_id, mime, bytes, sha256, updated_at)
    values (t.id, 'image/webp', v_bytes, v_sha, now())
    on conflict (token_id) do update set mime = excluded.mime, bytes = excluded.bytes, sha256 = excluded.sha256, updated_at = now();
  update public.api_tokens set agent_avatar_url = public.agent__avatar_path(t.id, v_sha) where id = t.id;
  insert into public.agent_avatar_changes (token_id) values (t.id);
  delete from public.agent_avatar_changes where token_id = t.id and at < now() - interval '7 days';
  return public.agent__profile_json(t.id, t.member_id) || jsonb_build_object('isMe', true, 'page', '/agents/' || t.id, 'changesLeftToday', greatest(0, 4 - v_n));
end $$;
revoke all on function public.mcp_agent_avatar_set(text, text) from public, anon, authenticated;
grant execute on function public.mcp_agent_avatar_set(text, text) to anon, authenticated;

create or replace function public.mcp_agent_avatar_reset(p_token text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare t public.api_tokens%rowtype;
begin
  t := public.api__token_any(p_token);
  if t.pledge_signed_at is null then raise exception 'agent_pledge_required' using errcode = 'P0001'; end if;
  perform public.api__rate_check(t.id);
  update public.api_tokens set agent_avatar_url = null where id = t.id;
  return public.agent__profile_json(t.id, t.member_id) || jsonb_build_object('isMe', true, 'page', '/agents/' || t.id);
end $$;
revoke all on function public.mcp_agent_avatar_reset(text) from public, anon, authenticated;
grant execute on function public.mcp_agent_avatar_reset(text) to anon, authenticated;

-- the image route (/api/agents/{id}/avatar): only while it is that agent's current photo
create or replace function public.agent_avatar_image(p_id uuid, p_v text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('mime', a.mime, 'b64', translate(encode(a.bytes, 'base64'), E'\n', ''), 'sha', a.sha256)
    from public.agent_avatar_images a join public.api_tokens t on t.id = a.token_id
   where a.token_id = p_id and not t.is_revoked and left(a.sha256, 12) = p_v
$$;
revoke all on function public.agent_avatar_image(uuid, text) from public, anon, authenticated;
grant execute on function public.agent_avatar_image(uuid, text) to anon, authenticated;
