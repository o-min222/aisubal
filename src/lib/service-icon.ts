import { safeFetchText } from '@/lib/safe-fetch'
import { githubOwnerAvatar, iconCandidates, siteForIcons, type IconSource } from '@/lib/service-icon-rules'

/** GET through the SSRF-safe fetch; the final (post-redirect) URL if it really is an image. */
export async function probeImage(url: string): Promise<string | null> {
  const r = await safeFetchText(url, 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8')
  return r.ok && r.status === 200 && /^image\//.test(r.contentType) && r.finalUrl.length <= 500 ? r.finalUrl : null
}

/**
 * The service's own logo, resolved server-side and stored on the entry: the GitHub owner avatar for
 * repos, else the site's declared apple-touch-icon/icon, else /apple-touch-icon.png, /favicon.ico.
 * Null when nothing checks out; the UI then keeps the letter mark.
 */
export async function resolveServiceIcon(src: IconSource): Promise<string | null> {
  const gh = githubOwnerAvatar(src)
  if (gh) {
    const hit = await probeImage(gh)
    if (hit) return hit
  }
  const site = siteForIcons(src)
  if (!site) return null
  const page = await safeFetchText(site)
  const candidates = iconCandidates(page.ok ? page.text : '', page.ok ? page.finalUrl : site).slice(0, 5)
  for (const c of candidates) {
    const hit = await probeImage(c)
    if (hit) return hit
  }
  return null
}

/** A page's own icon (declared apple-touch-icon/icon first, then the conventional paths), checked to be an image. */
export async function resolvePageIcon(html: string, pageUrl: string, max = 4): Promise<string | null> {
  let candidates: string[]
  try {
    candidates = iconCandidates(html, pageUrl).slice(0, max)
  } catch {
    return null
  }
  for (const c of candidates) {
    const hit = await probeImage(c)
    if (hit) return hit
  }
  return null
}
