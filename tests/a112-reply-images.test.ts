import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { replyImageExcerpt } from '@/lib/feed-rules'

const sql = readFileSync('supabase/migrations/0138_reply_images.sql', 'utf8')
const revoke = readFileSync('supabase/migrations/0139_notify_post_reply_revoke.sql', 'utf8')
const composer = readFileSync('src/components/feed/composer.tsx', 'utf8')
const menu = readFileSync('src/components/timeline/post-menu.tsx', 'utf8')
const postRoute = readFileSync('src/app/api/feed/route.ts', 'utf8')
const patchRoute = readFileSync('src/app/api/feed/[id]/route.ts', 'utf8')
const previews = readFileSync('src/components/timeline/comment-previews.tsx', 'utf8')
const create = readFileSync('src/lib/data/posts.ts', 'utf8')

describe('A112 reply image excerpt', () => {
  it('keeps the caption and adds a photo mark when an image is attached', () => {
    expect(replyImageExcerpt('짧은 캡션', true)).toBe('짧은 캡션 · 📷')
    expect(replyImageExcerpt('  ', true)).toBe('📷')
    expect(replyImageExcerpt('짧은 캡션', false)).toBe('짧은 캡션')
    expect(replyImageExcerpt('x'.repeat(200), true).endsWith(' · 📷')).toBe(true)
    expect(replyImageExcerpt('x'.repeat(200), true).length).toBeLessThanOrEqual(140)
  })
})

describe('A112 migration', () => {
  it('lets replies keep a valid image_path, edit it, and mark the bell excerpt', () => {
    expect(sql).toMatch(/raise exception 'post_image_invalid'/)
    expect(sql).not.toMatch(/new\.parent_id is not null or v_uid is null/)
    expect(sql).toMatch(/image_path = case when p_set_image then p_image_path else p\.image_path end/)
    expect(sql).not.toMatch(/when p\.parent_id is not null then p\.image_path/)
    expect(sql).toMatch(/v_excerpt := '📷'/)
    expect(sql).toMatch(/grant execute on function public\.posts__edit\(uuid, text, text, jsonb, boolean, text\) to authenticated/)
    expect(sql).toMatch(/revoke all on function public\.posts__edit\(uuid, text, text, jsonb, boolean, text\) from public, anon/)
    expect(revoke).toMatch(/revoke all on function public\.notify__post_reply\(\) from public, anon, authenticated/)
  })
})

describe('A112 UI and API', () => {
  it('the compact reply composer reuses the A110 upload pipeline and can send imagePath', () => {
    expect(composer).toMatch(/isReply \? \(/)
    expect(composer).toMatch(/imagePreview/)
    expect(composer).toMatch(/\.\.\.\(image \? \{ imagePath: image\.path \} : \{\}\)/)
    expect(composer).toMatch(/uploadPickedImage/)
    expect(composer).toMatch(/image\/heic,image\/heif/)
  })

  it('editing a reply can change its image, and POST no longer drops reply paths', () => {
    expect(menu).toMatch(/canEditImage = canEdit && kind === 'feed'/)
    expect(menu).not.toMatch(/canEditImage = canEdit && kind === 'feed' && !post\.parentId/)
    expect(postRoute).not.toMatch(/raw\.imagePath && \(raw\.parentId/)
    expect(postRoute).toMatch(/imagePath: raw\.imagePath \?\? null/)
    expect(patchRoute).not.toMatch(/setImage && \(edit\.data\.isReply/)
    expect(create).toMatch(/imageUrl: input\.imagePath \? postImageSrc\(post\.id\) : null/)
    expect(create).not.toMatch(/input\.imagePath && !input\.parentId \? \{ image_path/)
  })

  it('feed comment previews show a photo mark when the reply has an image', () => {
    expect(previews).toMatch(/c\.hasImage/)
    expect(previews).toMatch(/<T>사진<\/T>/)
  })
})
