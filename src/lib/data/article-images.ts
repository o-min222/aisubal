import { ARTICLE_IMAGE_KINDS, ARTICLE_IMAGE_MAX_BYTES, ARTICLE_IMAGE_TYPES, ARTICLE_LIBRARY_CAP, type ArticleImageKind } from '@/lib/article-rules'
import { mockArticleImageUses } from './articles'
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
  mockLib() // seeds the local sample pictures the mock articles point at
  return mem().get(path) ?? null
}

type ImageHit = { url: string } | { mock: { type: string; bytes: Buffer } } | { blob: { type: string; bytes: Buffer } }

/** Bytes of an agent-uploaded image (stored in article_image_blobs); the RPC re-checks visibility. */
async function blobImage(path: string, anon: boolean): Promise<ImageHit | null> {
  const client = anon ? createAnonClient() : await sb()
  const { data, error } = await client.rpc('article_image_blob', { p_path: path })
  if (error || !data) return null
  const d = data as { mime?: string; b64?: string }
  if (!d.mime || !d.b64) return null
  return { blob: { type: d.mime, bytes: Buffer.from(d.b64, 'base64') } }
}

/**
 * A short-lived URL (or the bytes, for an agent upload) for a cover, thumbnail or inline image.
 * Members use their session (storage RLS). Signed-out viewers are allowed only after article_image_ok()
 * (cover / thumbnail / teaser images); the service role then signs, never leaking other objects.
 */
export async function signedArticleImage(path: string, opts: { anon?: boolean } = {}): Promise<ImageHit | null> {
  if (!path || path.includes('..') || path.length > 200) return null
  if (isMock()) {
    const hit = mockArticleImage(path)
    return hit ? { mock: hit } : null
  }
  if (opts.anon) {
    const { data: ok, error } = await createAnonClient().rpc('article_image_ok', { p_path: path })
    if (error || !ok) return null
    const blob = await blobImage(path, true)
    if (blob) return blob
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
  if (signErr || !s?.signedUrl) return blobImage(path, false)
  return { url: s.signedUrl }
}

/** The OG renderer needs something an <img> can load without a session: the signed URL, or a data: URL for a blob. */
export async function articleImageForOg(path: string): Promise<string | null> {
  const hit = await signedArticleImage(path, { anon: true }).catch(() => null)
  if (!hit) return null
  if ('url' in hit) return hit.url
  const b = 'blob' in hit ? hit.blob : hit.mock
  return `data:${b.type};base64,${b.bytes.toString('base64')}`
}

// --------------------------------------------------------------------------- A136 reusable library

export type ArticleLibraryImage = {
  id: string
  path: string
  kind: ArticleImageKind
  name: string | null
  createdAt: string
  byAgent: boolean
  usedBy: number
}
export type ArticleLibrary = { images: ArticleLibraryImage[]; total: number; cap: number }
export type ArticleLibraryRemoval = { id: string; removed: boolean; path: string; orphan: boolean; blob: boolean; stillUsedBy: number }

const gl = globalThis as unknown as { __aisubalArticleLib?: ArticleLibraryImage[] }
const mockLib = () => (gl.__aisubalArticleLib ??= seedMockLibrary())

/** Local review only: a few SVG pictures in different shapes so the picker and crops have something to show. */
function seedMockLibrary(): ArticleLibraryImage[] {
  const shapes: Array<{ name: string; w: number; h: number; a: string; b: string }> = [
    { name: '가로 풍경', w: 1600, h: 900, a: '#2b6cb0', b: '#d69e2e' },
    { name: '세로 포스터', w: 900, h: 1400, a: '#805ad5', b: '#ed64a6' },
    { name: '정사각 로고', w: 1000, h: 1000, a: '#2f855a', b: '#1a202c' },
    { name: '와이드 배너', w: 2000, h: 700, a: '#c53030', b: '#2d3748' },
  ]
  const now = Date.now()
  return shapes.map((s, i) => {
    const path = `dev-auth-id/mock-lib-${i + 1}.svg`
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.a}"/><stop offset="1" stop-color="${s.b}"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/><circle cx="${s.w * 0.28}" cy="${s.h * 0.34}" r="${Math.min(s.w, s.h) * 0.14}" fill="#fff" fill-opacity=".85"/>` +
      `<rect x="${s.w * 0.1}" y="${s.h * 0.72}" width="${s.w * 0.8}" height="${s.h * 0.06}" rx="${s.h * 0.03}" fill="#fff" fill-opacity=".7"/>` +
      `<text x="${s.w * 0.5}" y="${s.h * 0.62}" font-size="${Math.min(s.w, s.h) * 0.12}" text-anchor="middle" fill="#fff" font-family="sans-serif">${i + 1}</text></svg>`
    mem().set(path, { type: 'image/svg+xml', bytes: Buffer.from(svg) })
    return { id: `00000000-0000-4000-8000-00000000000${i + 1}`, path, kind: 'cover' as const, name: s.name, createdAt: new Date(now - i * 3_600_000).toISOString(), byAgent: false, usedBy: 0 }
  })
}

export async function registerArticleImage(path: string, kind: ArticleImageKind, name?: string | null): Promise<ArticleLibraryImage> {
  if (!ARTICLE_IMAGE_KINDS.includes(kind)) throw new ArticleImageError('bad_kind')
  if (isMock()) {
    const lib = mockLib()
    const hit = lib.find((x) => x.path === path)
    if (hit) { hit.createdAt = new Date().toISOString(); return { ...hit } }
    if (!mockArticleImage(path)) throw new ArticleImageError('bad_image')
    if (lib.length >= ARTICLE_LIBRARY_CAP) throw new ArticleImageError('library_full')
    const row: ArticleLibraryImage = { id: crypto.randomUUID(), path, kind, name: name?.slice(0, 80) || null, createdAt: new Date().toISOString(), byAgent: false, usedBy: 0 }
    lib.unshift(row)
    return { ...row }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_image_register', { p_path: path, p_kind: kind, p_name: name ?? null })
  if (error) throw new ArticleImageError((error.message || 'error').replace(/^.*ERROR:\s*/i, '').split('\n')[0]!.trim())
  return data as ArticleLibraryImage
}

export async function listArticleImages(limit = 60): Promise<ArticleLibrary> {
  if (isMock()) {
    const lib = mockLib()
    const images = lib.slice(0, limit).map((x) => ({ ...x, usedBy: mockArticleImageUses(x.path) }))
    return { images, total: lib.length, cap: ARTICLE_LIBRARY_CAP }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_image_list', { p_limit: limit })
  if (error) throw new ArticleImageError((error.message || 'error').replace(/^.*ERROR:\s*/i, '').split('\n')[0]!.trim())
  return data as ArticleLibrary
}

/**
 * Unregister a library image. Published articles that use it keep working: the database only drops the
 * stored bytes (agent upload) when no article or series uses the image any more, and we only delete the
 * storage file in that same case.
 */
export async function removeArticleImage(id: string): Promise<ArticleLibraryRemoval> {
  if (isMock()) {
    const lib = mockLib()
    const hit = lib.find((x) => x.id === id)
    if (!hit) throw new ArticleImageError('not_found')
    gl.__aisubalArticleLib = lib.filter((x) => x.id !== id)
    const uses = mockArticleImageUses(hit.path)
    if (uses === 0) mem().delete(hit.path)
    return { id, removed: true, path: hit.path, orphan: uses === 0, blob: false, stillUsedBy: uses }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_image_remove', { p_id: id })
  if (error) throw new ArticleImageError((error.message || 'error').replace(/^.*ERROR:\s*/i, '').split('\n')[0]!.trim())
  const r = data as ArticleLibraryRemoval
  if (r.orphan && !r.blob) await supabase.storage.from(BUCKET).remove([r.path]).catch(() => null)
  return r
}
