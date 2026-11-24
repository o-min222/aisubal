import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { unreadNotifications } from '@/lib/data/notifications'
import { getSocialSummary } from '@/lib/data/social'

/** Bell badge (polled) + A86 pending incoming friend requests (avatar dot, 친구·팔로워 row). 0 when signed out. */
export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ unread: 0, requests: 0 }, { status: 401 })
  try {
    const [unread, requests] = await Promise.all([
      unreadNotifications(),
      getSocialSummary(member.id, member.id).then((s) => s.incomingRequests ?? 0).catch(() => 0),
    ])
    return NextResponse.json({ unread, requests }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[notifications] unread failed', e)
    return NextResponse.json({ unread: 0, requests: 0 })
  }
}
