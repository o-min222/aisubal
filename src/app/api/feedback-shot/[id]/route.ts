import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { adminGetFeedback, getMyFeedback, mockFeedbackShot, signedFeedbackShot } from '@/lib/data/feedback'

/** A105/A119: a feedback screenshot — admins, or the author of that item. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return new NextResponse(null, { status: 404 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 })
  const admin = state.member.is_admin
  const mine = admin ? null : await getMyFeedback(state.member.id, id).catch(() => null)
  if (!admin && !mine) return new NextResponse(null, { status: 404 })
  const m = mockFeedbackShot(id)
  if (m) return new NextResponse(new Uint8Array(m), { headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=300' } })
  const path = admin ? (await adminGetFeedback(id).catch(() => null))?.screenshotPath : mine?.screenshotPath
  const url = path ? await signedFeedbackShot(path, 600) : null
  if (!url) return new NextResponse(null, { status: 404 })
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'private, max-age=300' } })
}
