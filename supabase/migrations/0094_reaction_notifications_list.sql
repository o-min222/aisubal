-- A39 follow-up: reaction notifications (kind 'reaction', source_id = the reaction row) must
-- survive the live filter and fold into the per-post like group, so likes and emoji reactions on
-- one post read as one batched row ("{name}님 외 n명이 내 글에 반응했어요").
create or replace function public.notifications_list(p_category text default null, p_offset integer default 0, p_limit integer default 20)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
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
        when 'post' then exists (select 1 from public.posts s where s.id = n.source_id and s.deleted_at is null and not s.is_hidden)
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
        else jsonb_build_object('kind', g.actor_kind, 'id', null, 'name', g.actor_label, 'avatarUrl', g.actor_avatar_url) end
    ) order by g.created_at desc) filter (where g.rn > v_off and g.rn <= v_off + v_lim), '[]'::jsonb),
    count(*)::int
  into v_items, v_total
  from (select grouped.*, row_number() over (order by created_at desc) rn from grouped) g;
  select count(*)::int into v_unread from public.notifications where recipient_id = v_me and read_at is null;
  return jsonb_build_object('items', v_items, 'total', v_total, 'unread', v_unread);
end;
$$;
