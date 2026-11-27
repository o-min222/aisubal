import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { agoraMarkSeen } from '@/lib/data/agora-unread'

export async function POST() {
  const member = await getMember()
  if (!member) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    await agoraMarkSeen(member.id)
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: { 'cache-control': 'no-store' } })
  }
}
