import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { adminGetFeedback, mockFeedbackShot, signedFeedbackShot } from '@/lib/data/feedback'

/** A105: a feedback screenshot, admins only — a 10-minute signed URL behind a private redirect. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) return new NextResponse(null, { status: 404 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 })
  const m = mockFeedbackShot(id)
  if (m) return new NextResponse(new Uint8Array(m), { headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=300' } })
  const item = await adminGetFeedback(id).catch(() => null)
  const url = item?.screenshotPath ? await signedFeedbackShot(item.screenshotPath, 600) : null
  if (!url) return new NextResponse(null, { status: 404 })
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'private, max-age=300' } })
}
