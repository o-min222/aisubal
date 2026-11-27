import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0136_article_can_draft_storage_grant.sql', 'utf8')

describe('0136 article storage grant', () => {
  it('grants article__can_draft to authenticated and rewrites the insert policy without an InitPlan subquery', () => {
    expect(sql).toMatch(/grant execute on function public\.article__can_draft\(\) to authenticated/)
    expect(sql).toMatch(/drop policy if exists article_images_insert_own on storage\.objects/)
    expect(sql).toMatch(/and public\.article__can_draft\(\)/)
    expect(sql).not.toMatch(/select public\.article__can_draft\(\)/)
    expect(sql).toMatch(/bucket_id = 'article-images'/)
  })
})
