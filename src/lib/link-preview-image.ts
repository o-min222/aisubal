/**
 * Server-side OG image fetch for /api/link-preview-image (A104).
 * The client passes the *page* URL, never an arbitrary image URL. We unfurl
 * (reusing the preview cache), then download only that preview's og:image
 * through safeFetchBytes. If the stored CDN URL is dead, we refresh the unfurl
 * once and try the new image. HEIC is re-encoded to JPEG so WebKit and
 * Chromium see the same bytes.
 */
import sharp from 'sharp'
import { safeFetchBytes } from '@/lib/safe-fetch'
import { fetchLinkPreview } from '@/lib/link-preview-server'
import { isServablePreviewMime, sniffPreviewImage, type ServablePreviewMime } from '@/lib/preview-image'

export const PREVIEW_IMAGE_MAX = 1_500_000

export type PreviewImageBytes = { body: Buffer; contentType: ServablePreviewMime }

async function toServable(body: Buffer): Promise<PreviewImageBytes | null> {
  const kind = sniffPreviewImage(body)
  if (!kind) return null
  if (kind === 'image/heic') {
    try {
      const out = await sharp(body).rotate().jpeg({ quality: 82 }).toBuffer()
      if (out.length === 0 || out.length > PREVIEW_IMAGE_MAX) return null
      return { body: out, contentType: 'image/jpeg' }
    } catch {
      return null
    }
  }
  if (!isServablePreviewMime(kind)) return null
  return { body, contentType: kind }
}

async function tryImage(imageUrl: string): Promise<PreviewImageBytes | null> {
  const r = await safeFetchBytes(imageUrl, PREVIEW_IMAGE_MAX)
  if (!r.ok) return null
  return toServable(r.body)
}

/**
 * Resolve a preview image for a page. `storedImage` is the URL already on the
 * post (may be expired); it is tried first, then the cached unfurl, then a
 * fresh unfurl when those fetches fail.
 */
export async function fetchPreviewImageBytes(pageUrl: string, storedImage?: string | null): Promise<PreviewImageBytes | null> {
  const tried = new Set<string>()
  const tryOnce = async (image: string | null | undefined) => {
    if (!image || tried.has(image)) return null
    tried.add(image)
    return tryImage(image)
  }

  const first = await tryOnce(storedImage ?? null)
  if (first) return first

  const cached = await fetchLinkPreview(pageUrl)
  const fromCache = await tryOnce(cached.image)
  if (fromCache) return fromCache

  const fresh = await fetchLinkPreview(pageUrl, { bypassCache: true })
  return tryOnce(fresh.image)
}
