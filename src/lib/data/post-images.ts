import { isMock, sb } from './client'
import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES } from '@/lib/quick-post-rules'

/** A62: one image per root post, in the private post-images bucket under the member's auth uid folder. */
const BUCKET = 'post-images'
const g = globalThis as unknown as { __aisubalImgs?: Map<string, { type: string; bytes: Buffer }> }
const mem = () => (g.__aisubalImgs ??= new Map())

export class PostImageError extends Error {}

export async function uploadPostImage(authId: string, file: File): Promise<string> {
  const ext = POST_IMAGE_TYPES[file.type]
  if (!ext) throw new PostImageError('image_type')
  if (file.size > POST_IMAGE_MAX_BYTES) throw new PostImageError('image_size')
  const path = `${authId}/${crypto.randomUUID()}.${ext}`
  if (isMock()) {
    mem().set(path, { type: file.type, bytes: Buffer.from(await file.arrayBuffer()) })
    return path
  }
  const supabase = await sb()
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
  if (error) throw new Error(error.message)
  return path
}

/** Mock-only: the uploaded bytes (DEV serves them directly). */
export function mockPostImage(path: string) {
  return mem().get(path) ?? null
}

/**
 * A short-lived signed URL for a post's image — only when this viewer can read the post
 * (the post query runs under the viewer's RLS, and so does the storage policy).
 */
export async function signedPostImage(postId: string): Promise<{ url: string } | { mock: { type: string; bytes: Buffer } } | null> {
  const supabase = await sb()
  if (isMock()) {
    const { mockFeedPost } = await import('./feed')
    const p = mockFeedPost(postId) as unknown as { imagePath?: string } | undefined
    const hit = p?.imagePath ? mockPostImage(p.imagePath) : null
    return hit ? { mock: hit } : null
  }
  const { data } = await supabase.from('posts').select('image_path, deleted_at').eq('id', postId).maybeSingle()
  const path = (data as { image_path?: string | null; deleted_at?: string | null } | null)
  if (!path?.image_path || path.deleted_at) return null
  const { data: s, error } = await supabase.storage.from(BUCKET).createSignedUrl(path.image_path, 600)
  if (error || !s?.signedUrl) return null
  return { url: s.signedUrl }
}
