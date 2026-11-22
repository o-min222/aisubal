import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { unreadNotifications } from '@/lib/data/notifications'

/** Bell badge (polled). 0 when signed out so the bell never errors. */
export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ unread: 0 }, { status: 401 })
  try {
    return NextResponse.json({ unread: await unreadNotifications() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[notifications] unread failed', e)
    return NextResponse.json({ unread: 0 })
  }
}
