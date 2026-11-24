import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { signedPostImage } from '@/lib/data/post-images'

/** A62: a post's image, for whoever may read the post — a 10-minute signed URL behind a private redirect. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return new NextResponse(null, { status: 401 })
  const { id } = await params
  if (!id || id.length > 64) return new NextResponse(null, { status: 404 })
  const hit = await signedPostImage(id).catch(() => null)
  if (!hit) return new NextResponse(null, { status: 404 })
  if ('mock' in hit) return new NextResponse(new Uint8Array(hit.mock.bytes), { headers: { 'content-type': hit.mock.type, 'cache-control': 'private, max-age=300' } })
  return NextResponse.redirect(hit.url, { status: 302, headers: { 'cache-control': 'private, max-age=300' } })
}
