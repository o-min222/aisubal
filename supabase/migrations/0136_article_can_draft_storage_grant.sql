-- A110: article_images_insert_own called article__can_draft() as an uncorrelated
-- subquery, which Postgres plans as an InitPlan and runs on every
-- storage.objects INSERT for authenticated (post-images, avatars, feedback-shots,
-- emoji, article-images). 0135 revoked EXECUTE from authenticated, so those
-- uploads failed with "permission denied for function article__can_draft".
-- Grant the helper (SECURITY DEFINER, membership check inside) and rewrite the
-- policy to call it in the AND chain so other buckets can short-circuit.

grant execute on function public.article__can_draft() to authenticated;

drop policy if exists article_images_insert_own on storage.objects;
create policy article_images_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'article-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.article__can_draft()
  );
