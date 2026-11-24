import { NextRequest } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'

/**
 * A69: a photo an agent set for itself (MCP profile_set_avatar → agent_avatar_images, 0122).
 * The URL carries the image's sha (…/avatar?v=<sha12>), so a response never changes: cache it for a
 * year. A wrong or stale v, a revoked agent or no photo is a 404. Bytes were re-encoded to WebP by
 * the server before they were stored; nosniff + an empty CSP keep the browser from reading them as
 * anything else.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' } })

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const v = request.nextUrl.searchParams.get('v') ?? ''
  if (!UUID_RE.test(id) || !/^[0-9a-f]{12}$/.test(v)) return notFound()
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return notFound()
  const { data, error } = await createAnonClient().rpc('agent_avatar_image', { p_id: id, p_v: v })
  const row = data as { mime?: string; b64?: string } | null
  if (error || !row?.b64 || row.mime !== 'image/webp') return notFound()
  const body = Buffer.from(row.b64, 'base64')
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': 'image/webp',
      'content-length': String(body.length),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-site',
    },
  })
}
