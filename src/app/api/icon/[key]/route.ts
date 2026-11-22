import { serviceDomain } from '@/lib/service-logos'

/**
 * Logo proxy for chip icons. Only keys from the fixed allowlist (no user URLs → no SSRF);
 * long CDN cache so each logo is fetched upstream rarely and viewers never hit a third party.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const domain = serviceDomain(key)
  if (!domain) return new Response('not found', { status: 404 })
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, { signal: AbortSignal.timeout(4000) })
    const type = r.headers.get('content-type') ?? ''
    if (!r.ok || !type.startsWith('image/')) throw new Error('bad')
    const body = await r.arrayBuffer()
    if (body.byteLength > 64_000) throw new Error('too big')
    return new Response(body, {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800, s-maxage=2592000, immutable', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch {
    // tell the client to fall back to the letter mark
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } })
  }
}
