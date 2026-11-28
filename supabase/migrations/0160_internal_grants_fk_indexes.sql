-- A148 (AI-81 audit): shrink the callable surface and fix advisor findings. No behavior change for the app.
--
-- 1) Internal helpers that no client calls lose EXECUTE for anon / authenticated. They are only used inside
--    SECURITY DEFINER functions (which run as the owner) or fire as triggers (PostgreSQL checks EXECUTE on a
--    trigger function only when the trigger is created). Kept on purpose:
--      - helpers referenced by RLS policies or CHECK constraints (evaluated as the caller): app__is_admin,
--        article__can_draft, feedback__allowed, group__can_read, group__role, group__visible, moim__can_manage,
--        moim__can_see_private, post__can_see, tool_usage__visible_to, posts__valid_previews
--      - group__redirect_target (called by the SECURITY INVOKER group_resolve_slug)
--      - mutators the app calls by name and that check the caller themselves: agora__delete, posts__delete,
--        posts__edit, posts__set_hidden, toolbox__record_install, toolbox__record_post_mention, invites__renew_mine
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.proname in (
         'agent__handle_base', 'agent__handle_pick', 'agent__mentioned_handles', 'archive__clean_tags', 'archive__json',
         'badges__tiers', 'links__host_ok', 'member__mentioned_handles', 'profile__handle_ok', 'tools__canonical',
         'tools__github_repo', 'tools__shared_host', 'tools__slug_base', 'tools__unique_slug', 'webhook__url_ok',
         -- trigger functions
         'api_tokens__handle', 'invites__on_used', 'notify__agora_like', 'notify__agora_reply', 'notify__anon_like',
         'notify__anon_reply', 'notify__follow', 'notify__follow_post', 'notify__friendship', 'notify__invite_used',
         'notify__post_like', 'notify__tool_submission', 'posts__as_group', 'posts__nickname_id')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 2) Foreign keys without a covering index (Supabase performance advisor). Small tables: plain CREATE INDEX.
create index if not exists agent_friendships_requester_token_idx on public.agent_friendships (requester_token);
create index if not exists agora_reactions_member_id_idx on public.agora_reactions (member_id);
create index if not exists api_tokens_oauth_client_id_idx on public.api_tokens (oauth_client_id) where oauth_client_id is not null;
create index if not exists article_comments_author_id_idx on public.article_comments (author_id);
create index if not exists article_comments_reply_to_id_idx on public.article_comments (reply_to_id) where reply_to_id is not null;
create index if not exists article_comments_parent_id_idx on public.article_comments (parent_id) where parent_id is not null;
create index if not exists article_images_agent_token_id_idx on public.article_images (agent_token_id) where agent_token_id is not null;
create index if not exists custom_emojis_created_by_idx on public.custom_emojis (created_by);
create index if not exists feedback_items_reviewed_by_idx on public.feedback_items (reviewed_by) where reviewed_by is not null;
create index if not exists group_slug_redirects_group_id_idx on public.group_slug_redirects (group_id);
create index if not exists members_first_mission_post_idx on public.members (first_mission_post) where first_mission_post is not null;
create index if not exists moim_invites_invited_by_idx on public.moim_invites (invited_by);
create index if not exists oauth_codes_member_id_idx on public.oauth_codes (member_id);
create index if not exists oauth_codes_issued_token_id_idx on public.oauth_codes (issued_token_id) where issued_token_id is not null;
create index if not exists oauth_codes_token_id_idx on public.oauth_codes (token_id) where token_id is not null;
create index if not exists oauth_codes_client_id_idx on public.oauth_codes (client_id);
create index if not exists oauth_refresh_tokens_client_id_idx on public.oauth_refresh_tokens (client_id);
create index if not exists post_reactions_member_id_idx on public.post_reactions (member_id);
create index if not exists post_teasers_created_by_idx on public.post_teasers (created_by);
create index if not exists product_comments_nickname_id_idx on public.product_comments (nickname_id) where nickname_id is not null;
create index if not exists product_comments_public_member_id_idx on public.product_comments (public_member_id);
create index if not exists public_waitlist_invited_by_idx on public.public_waitlist (invited_by) where invited_by is not null;
create index if not exists push_outbox_member_id_idx on public.push_outbox (member_id);
create index if not exists push_outbox_subscription_id_idx on public.push_outbox (subscription_id);
create index if not exists push_outbox_notification_id_idx on public.push_outbox (notification_id);
create index if not exists tool_submissions_ai_recommended_token_id_idx on public.tool_submissions (ai_recommended_token_id) where ai_recommended_token_id is not null;
create index if not exists toolbox_entries_install_verified_by_idx on public.toolbox_entries (install_verified_by) where install_verified_by is not null;
create index if not exists toolbox_installs_entry_id_idx on public.toolbox_installs (entry_id);
create index if not exists toolbox_merges_kept_id_idx on public.toolbox_merges (kept_id);
create index if not exists toolbox_slug_redirects_entry_id_idx on public.toolbox_slug_redirects (entry_id);

-- 3) Indexes: an exact duplicate (idx_meetups_starts covers starts_at) and two on the retired products
--    surface (no query filters products.featured or orders product_upvotes by created_at). Everything else the
--    advisor lists as unused is kept: traffic is low, and most back recent features or unique constraints.
drop index if exists public.idx_meetups_starts_at;
drop index if exists public.idx_products_featured;
drop index if exists public.idx_product_upvotes_created;

-- 4) RLS initplan (advisor): evaluate auth.uid() once per query, not per row. Same rule as before.
alter policy rec_dismissals_own on public.rec_dismissals
  using (member_id in (select m.id from public.members m where m.auth_id = (select auth.uid())));

-- 5) products: INSERT was granted but no INSERT policy exists (RLS denied it anyway). Drop the dead grant.
revoke insert on table public.products from authenticated;
