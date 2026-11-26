/**
 * Helpers for in-app link-preview images (A104).
 * The stored og:image URL is often a signed, short-lived CDN link (Instagram /
 * fbcdn). The browser must never be pointed at that URL directly: it 엑박s in
 * WebKit when the signature expires or the host blocks the Referer. Cards and
 * the sheet load `/api/link-preview-image?url=` instead (the *page* URL), and
 * hide the image container if the proxy has nothing to serve.
 */

export const PREVIEW_IMAGE_PATH = '/api/link-preview-image'

export type ServablePreviewMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/avif'
export type SniffedPreviewMime = ServablePreviewMime | 'image/heic'

export function previewImageSrc(pageUrl: string): string | null {
  if (!pageUrl || pageUrl.length > 2000) return null
  if (pageUrl.startsWith(`${PREVIEW_IMAGE_PATH}?`) || pageUrl === PREVIEW_IMAGE_PATH) return pageUrl
  try {
    const u = new URL(pageUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${PREVIEW_IMAGE_PATH}?url=${encodeURIComponent(pageUrl)}`
  } catch {
    return null
  }
}

/** Visible alt for an OG image — never an empty string. */

/** Hosts whose OG image URLs are signed, short-lived, or hotlink-blocked. */
export function isFragilePreviewImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false
  try {
    const host = new URL(imageUrl).hostname.replace(/^www\./, '').toLowerCase()
    if (host.startsWith('scontent') && (host.includes('cdninstagram') || host.includes('fbcdn') || host.includes('fbsbx'))) return true
    return (/(?:^|\.)((?:cdn)?instagram\.com|fbcdn\.net|facebook\.com|fbsbx\.com)$/i).test(host)
  } catch {
    return false
  }
}

/**
 * Where the <img> should load from. Fragile (Instagram / fbcdn) URLs go through
 * the page-URL proxy; everything else is the stored https URL plus hide-on-error.
 */
export function previewDisplaySrc(pageUrl: string, imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  if (isFragilePreviewImage(imageUrl)) return previewImageSrc(pageUrl)
  try {
    const u = new URL(imageUrl)
    return u.protocol === 'https:' ? imageUrl : null
  } catch {
    return null
  }
}

export function previewImageAlt(title: string | null | undefined, site: string | null | undefined, url: string): string {
  const t = (title || '').replace(/\s+/g, ' ').trim()
  if (t) return t
  const siteName = (site || '').replace(/\s+/g, ' ').trim()
  if (siteName) return siteName
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'link'
  } catch {
    return 'link'
  }
}

export function isServablePreviewMime(m: string): m is ServablePreviewMime {
  return m === 'image/png' || m === 'image/jpeg' || m === 'image/webp' || m === 'image/gif' || m === 'image/avif'
}

/** Magic-byte sniff (headers and file names are not trusted). */
export function sniffPreviewImage(b: Uint8Array): SniffedPreviewMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase()
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (brand === 'heic' || brand === 'heix' || brand === 'heif' || brand === 'hevc' || brand === 'mif1' || brand === 'msf1') return 'image/heic'
  }
  return null
}
