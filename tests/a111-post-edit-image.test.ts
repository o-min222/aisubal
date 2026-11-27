import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { initialPostEditImage, postEditImageChanged, postEditImagePayload } from '@/components/timeline/post-edit-image'

const sql = readFileSync('supabase/migrations/0137_post_edit_image.sql', 'utf8')
const menu = readFileSync('src/components/timeline/post-menu.tsx', 'utf8')
const route = readFileSync('src/app/api/feed/[id]/route.ts', 'utf8')
const editor = readFileSync('src/components/articles/article-editor.tsx', 'utf8')
const guard0112 = readFileSync('supabase/migrations/0112_quick_post.sql', 'utf8')

describe('A111 post image edit helpers', () => {
  it('treats a keep as unchanged and a remove or replacement as a change', () => {
    const url = '/api/post-image/p1'
    expect(postEditImageChanged(url, initialPostEditImage(url))).toBe(false)
    expect(postEditImageChanged(null, initialPostEditImage(null))).toBe(false)
    expect(postEditImageChanged(url, { kind: 'none' })).toBe(true)
    expect(postEditImageChanged(url, { kind: 'new', path: 'me/a.webp', preview: 'blob:x' })).toBe(true)
    expect(postEditImageChanged(null, { kind: 'new', path: 'me/a.webp', preview: 'blob:x' })).toBe(true)
    expect(postEditImagePayload({ kind: 'keep', preview: url })).toBeNull()
    expect(postEditImagePayload({ kind: 'none' })).toEqual({ setImage: true, imagePath: null })
    expect(postEditImagePayload({ kind: 'new', path: 'me/a.webp', preview: 'blob:x' })).toEqual({ setImage: true, imagePath: 'me/a.webp' })
  })
})

describe('A111 migration', () => {
  it('lets posts__edit set or clear image_path, validates a new path, and cleans orphaned objects', () => {
    expect(sql).toMatch(/p_set_image boolean default false/)
    expect(sql).toMatch(/p_image_path text default null/)
    expect(sql).toMatch(/when p_set_image then p_image_path/)
    expect(sql).toMatch(/when p\.parent_id is not null then p\.image_path/)
    expect(sql).toMatch(/grant execute on function public\.posts__edit\(uuid, text, text, jsonb, boolean, text\) to authenticated/)
    expect(sql).toMatch(/revoke all on function public\.posts__edit\(uuid, text, text, jsonb, boolean, text\) from public, anon/)
    expect(sql).toMatch(/drop function if exists public\.posts__edit\(uuid, text, text, jsonb\)/)
    expect(sql).toMatch(/create trigger posts_image_cleanup after update or delete on public\.posts/)
    expect(sql).toMatch(/delete from storage\.objects o/)
    expect(sql).toMatch(/bucket_id = 'post-images'/)
    expect(sql).toMatch(/image_path = null/)
    expect(sql).toMatch(/author_id = v_me and p\.author_kind = 'member'/)
    expect(sql).not.toMatch(/new\.image_path := old\.image_path/)
    expect(guard0112).toMatch(/new\.image_path := old\.image_path/)
  })
})

describe('A111 UI and API', () => {
  it('the feed edit sheet reuses the A110 upload pipeline and only offers one image on root posts', () => {
    expect(menu).toMatch(/canEditImage = canEdit && kind === 'feed' && !post\.parentId/)
    expect(menu).toMatch(/PostEditImage/)
    expect(menu).toMatch(/uploadPickedImage|post-edit-image/)
    expect(menu).toMatch(/postEditImagePayload/)
    expect(menu).toMatch(/postEditImageChanged/)
    expect(readFileSync('src/components/timeline/post-edit-image.tsx', 'utf8')).toMatch(/uploadPickedImage/)
    expect(readFileSync('src/components/timeline/post-edit-image.tsx', 'utf8')).toMatch(/image\/heic,image\/heif/)
    expect(readFileSync('src/components/timeline/post-edit-image.tsx', 'utf8')).toMatch(/이미지 바꾸기/)
  })

  it('PATCH /api/feed/:id accepts setImage, checks the path, and refuses it on replies', () => {
    expect(route).toMatch(/setImage: z\.boolean\(\)\.optional\(\)/)
    expect(route).toMatch(/isPostImagePath\(edit\.data\.imagePath, member\.auth_id\)/)
    expect(route).toMatch(/setImage && \(edit\.data\.isReply/)
    expect(route).toMatch(/post_image_invalid/)
  })

  it('article editing already lets the author change the cover and insert inline images', () => {
    expect(editor).toMatch(/onImage\('cover'\)/)
    expect(editor).toMatch(/update\('coverPath', null\)/)
    expect(editor).toMatch(/onImage\('inline'\)/)
    expect(editor).toMatch(/prepareUploadImage/)
  })
})
