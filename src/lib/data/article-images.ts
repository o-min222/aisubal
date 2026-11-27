import { ARTICLE_IMAGE_MAX_BYTES, ARTICLE_IMAGE_TYPES } from '@/lib/article-rules'
import { createAnonClient } from '@/lib/supabase/anon'
import { createServiceClient } from '@/lib/supabase/server'
import { sb, isMock } from './client'

const BUCKET = 'article-images'
const g = globalThis as unknown as { __aisubalArticleImgs?: Map<string, { type: string; bytes: Buffer }> }
const mem = () => (g.__aisubalArticleImgs ??= new Map())

export class ArticleImageError extends Error {}

export async function uploadArticleImage(authId: string, file: File): Promise<string> {
  const ext = ARTICLE_IMAGE_TYPES[file.type]
  if (!ext) throw new ArticleImageError('image_type')
  if (file.size > ARTICLE_IMAGE_MAX_BYTES) throw new ArticleImageError('image_size')
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

export function mockArticleImage(path: string) {
  return mem().get(path) ?? null
}

/**
 * A short-lived URL for a cover or inline image. Members use their session (storage RLS).
 * Signed-out viewers are allowed only after article_image_ok() (cover / teaser images);
 * the service role then signs, never leaking other objects.
 */
export async function signedArticleImage(path: string, opts: { anon?: boolean } = {}): Promise<{ url: string } | { mock: { type: string; bytes: Buffer } } | null> {
  if (!path || path.includes('..') || path.length > 200) return null
  if (isMock()) {
    const hit = mockArticleImage(path)
    return hit ? { mock: hit } : null
  }
  if (opts.anon) {
    const { data: ok, error } = await createAnonClient().rpc('article_image_ok', { p_path: path })
    if (error || !ok) return null
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null
    const admin = createServiceClient()
    const { data: s, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, 600)
    if (signErr || !s?.signedUrl) return null
    return { url: s.signedUrl }
  }
  const supabase = await sb()
  const { data: ok, error } = await supabase.rpc('article_image_ok', { p_path: path })
  if (error || !ok) return null
  const { data: s, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
  if (signErr || !s?.signedUrl) return null
  return { url: s.signedUrl }
}

