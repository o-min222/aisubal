import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Members insert posts with column-level INSERT grants. Sending a column without one fails the WHOLE insert
// with "permission denied for table posts": 0065 added as_group_id with SELECT only, and every post and
// reply failed until 0081 (P0, 2026-11-23). This list is prod's grant set (has_column_privilege, after 0081).
// Add a column here only in the same change as the migration that grants INSERT on it.
const INSERT_GRANTED = new Set(
  'agent_interaction,as_group_id,author_id,authorship,content,group_id,link_description,link_favicon,link_image,link_previews,link_site_name,link_title,link_type,nickname_profile_id,parent_id,posted_as,source_note,title,url'.split(',')
)

describe('createPost only sends post columns members may insert', () => {
  it('every key of the posts insert has an INSERT grant', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'lib', 'data', 'posts.ts'), 'utf8')
    const m = src.match(/\.from\('posts'\)\s*\.insert\(\{([\s\S]*?)\n\s*\}\)/)
    expect(m, 'posts insert not found in createPost').toBeTruthy()
    const keys = [...m![1].matchAll(/^\s*(\w+):/gm)].map((k) => k[1])
    expect(keys.length).toBeGreaterThan(10)
    expect(keys.filter((k) => !INSERT_GRANTED.has(k))).toEqual([])
  })
})
