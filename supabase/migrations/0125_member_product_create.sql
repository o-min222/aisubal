-- 0125 (A87, Colin t321u/t322u): '내 서비스 올리기' — a member posts something they built from the web.
-- 0031 dropped products_insert (new services went through the review queue), so the old web form
-- (/api/products → table insert) was refused by RLS. Members get the same path agents use with
-- gallery_launch (mcp_product_create): one products row, maker = me; products_sync_tool (0006/0031)
-- creates / links the gallery entry (launch category, upvotes = likes).
--   * signed-in, completed, unbanned members only (is_completed_member)
--   * same validation as mcp_product_create: name 1–80, tagline 1–140, description 1–5000,
--     http(s) URLs only (≤ 500), tags lower-cased, ≤ 30 chars, ≤ 10
--   * at most 3 launches per member per 24 h (launch_daily_limit)
-- No table grant changes: the table insert stays closed; this RPC is the only member write path.

create or replace function public.member_product_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_member_id();
  v_name text := btrim(coalesce(p_payload->>'name', ''));
  v_tagline text := btrim(coalesce(p_payload->>'tagline', ''));
  v_desc text := btrim(coalesce(p_payload->>'description', ''));
  p public.products%rowtype;
  e record;
begin
  if v_me is null or not public.is_completed_member() then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 80 or char_length(v_tagline) not between 1 and 140
     or char_length(v_desc) not between 1 and 5000 then
    raise exception 'api_invalid:name/tagline/description' using errcode = 'P0001';
  end if;
  if (select count(*) from public.products x where x.maker_ids[1] = v_me and x.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'launch_daily_limit' using errcode = 'P0001';
  end if;

  insert into public.products (name, tagline, description, logo_url, screenshots, website_url, app_store_url, github_url,
                               tags, maker_ids, featured, launched_at)
  values (v_name, v_tagline, v_desc,
          case when p_payload->>'logo_url' ~* '^https?://' then left(p_payload->>'logo_url', 500) end,
          array(select left(x, 500) from jsonb_array_elements_text(coalesce(p_payload->'screenshots', '[]'::jsonb)) x
                where x ~* '^https?://' limit 6),
          case when p_payload->>'website_url' ~* '^https?://' then left(p_payload->>'website_url', 500) end,
          case when p_payload->>'app_store_url' ~* '^https?://' then left(p_payload->>'app_store_url', 500) end,
          case when p_payload->>'github_url' ~* '^https?://' then left(p_payload->>'github_url', 500) end,
          array(select distinct left(lower(btrim(x)), 30) from jsonb_array_elements_text(coalesce(p_payload->'tags', '[]'::jsonb)) x
                where btrim(x) <> '' limit 10),
          array[v_me], false, now())
  returning * into p;

  select t.id, t.slug into e from public.toolbox_entries t where t.product_id = p.id limit 1;
  return jsonb_build_object('id', p.id, 'entryId', e.id, 'slug', e.slug);
end;
$$;

revoke all on function public.member_product_create(jsonb) from public, anon;
grant execute on function public.member_product_create(jsonb) to authenticated;
