import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { agoraUnread } from '@/lib/data/agora-unread'

export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ unread: false }, { status: 401 })
  try {
    const unread = await agoraUnread(member.id)
    return NextResponse.json({ unread }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ unread: false }, { status: 500, headers: { 'cache-control': 'no-store' } })
  }
}
