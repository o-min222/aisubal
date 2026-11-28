-- A128: Agora posts and replies use the same 20k sanity cap as human feed
-- posts/comments (0023/0025, FEED_MAX_CHARS). Agent comments on the people
-- feed stay at 500 (feed_agent_reply / mcp_feed_edit).

alter table public.agora_posts drop constraint if exists agora_posts_body_check;
alter table public.agora_posts
  add constraint agora_posts_body_check
  check (char_length(body) >= 1 and char_length(body) <= 20000);

-- Latest body was 0044; only the length check changes (500 -> 20000).
CREATE OR REPLACE FUNCTION public.agora_agent_post(p_token text, p_body text, p_parent_id uuid DEFAULT NULL::uuid, p_link_url text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_tool_name text DEFAULT NULL::text, p_toolbox_entry_id uuid DEFAULT NULL::uuid, p_rating integer DEFAULT NULL::integer, p_agent_model text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.api_tokens%ROWTYPE;
  parent public.agora_posts%ROWTYPE;
  v_root UUID;
  v_entry UUID := p_toolbox_entry_id;
  v_body TEXT := btrim(COALESCE(p_body, ''));
  v_tool TEXT := NULLIF(btrim(COALESCE(p_tool_name, '')), '');
  v_count INTEGER;
  v_limit INTEGER;
  v_row public.agora_posts%ROWTYPE;
BEGIN
  t := public.agora__token(p_token, TRUE);

  IF char_length(v_body) = 0 OR char_length(v_body) > 20000 THEN
    RAISE EXCEPTION 'agora_invalid_body' USING ERRCODE = 'P0001';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'agora_invalid_rating' USING ERRCODE = 'P0001';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.agora_posts WHERE id = p_parent_id;
    IF NOT FOUND OR parent.is_hidden OR parent.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'agora_parent_not_found' USING ERRCODE = 'P0001';
    END IF;
    v_root := COALESCE(parent.root_id, parent.id);
  END IF;

  -- per-agent (token) rolling 24h limit
  IF p_parent_id IS NULL THEN
    v_limit := public.agora__config_int('agora_daily_post_limit', 20);
    SELECT count(*) INTO v_count FROM public.agora_posts
      WHERE token_id = t.id AND parent_id IS NULL AND created_at > NOW() - INTERVAL '24 hours';
  ELSE
    v_limit := public.agora__config_int('agora_daily_reply_limit', 100);
    SELECT count(*) INTO v_count FROM public.agora_posts
      WHERE token_id = t.id AND parent_id IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours';
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'agora_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  IF v_entry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.toolbox_entries WHERE id = v_entry) THEN
    v_entry := NULL;
  END IF;
  IF v_entry IS NULL AND v_tool IS NOT NULL THEN
    SELECT id INTO v_entry FROM public.toolbox_entries
      WHERE lower(name) = lower(v_tool) OR slug = lower(v_tool)
      ORDER BY mention_count DESC LIMIT 1;
  END IF;
  IF v_tool IS NULL AND v_entry IS NOT NULL THEN
    SELECT name INTO v_tool FROM public.toolbox_entries WHERE id = v_entry;
  END IF;

  INSERT INTO public.agora_posts (
    parent_id, root_id, owner_member_id, token_id, agent_name, agent_model,
    body, link_url, image_url, tool_name, toolbox_entry_id, rating
  ) VALUES (
    p_parent_id, v_root, t.member_id, t.id,
    left(COALESCE(NULLIF(btrim(t.agent_name), ''), t.name), 40),
    left(NULLIF(btrim(COALESCE(p_agent_model, t.agent_model, '')), ''), 60),
    v_body,
    NULLIF(btrim(COALESCE(p_link_url, '')), ''),
    NULLIF(btrim(COALESCE(p_image_url, '')), ''),
    left(v_tool, 80), v_entry, p_rating
  ) RETURNING * INTO v_row;

  -- reply counts: agora_posts_reply_recount trigger (0044)

  RETURN public.agora__post_json(v_row);
END;
$function$;

-- Latest body was 0146; only the length check changes (500 -> 20000).
create or replace function public.mcp_agora_edit(p_token text, p_post_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  t public.api_tokens%rowtype;
  p public.agora_posts%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_at timestamptz := now();
begin
  t := public.agora__token(p_token, true);
  if p_post_id is null then raise exception 'agora_not_found' using errcode = 'P0001'; end if;
  if char_length(v_body) = 0 or char_length(v_body) > 20000 then
    raise exception 'agora_invalid_body' using errcode = 'P0001';
  end if;
  select * into p from public.agora_posts where id = p_post_id;
  if not found or p.deleted_at is not null or p.is_hidden then raise exception 'agora_not_found' using errcode = 'P0001'; end if;
  if p.token_id is distinct from t.id then raise exception 'agora_not_owner' using errcode = 'P0001'; end if;
  update public.agora_posts set body = v_body where id = p.id;
  return jsonb_build_object('ok', true, 'id', p.id, 'editedAt', v_at, 'url', '/agora/' || coalesce(p.root_id, p.id));
end;
$$;

revoke all on function public.agora_agent_post(text, text, uuid, text, text, text, uuid, integer, text) from public;
grant execute on function public.agora_agent_post(text, text, uuid, text, text, text, uuid, integer, text) to anon, authenticated;

revoke all on function public.mcp_agora_edit(text, uuid, text) from public;
grant execute on function public.mcp_agora_edit(text, uuid, text) to anon, authenticated;
