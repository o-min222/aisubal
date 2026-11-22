import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { handleAvailable } from '@/lib/data/profile'
import { validateHandle } from '@/lib/profile-rules'

/** Live availability check for the @handle field. */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const v = validateHandle(request.nextUrl.searchParams.get('h') || '')
  if (!v.ok) return NextResponse.json({ available: false, reason: v.reason })
  const available = v.handle === member.handle || (await handleAvailable(v.handle).catch(() => false))
  return NextResponse.json({ available, handle: v.handle, reason: available ? null : '이미 쓰는 핸들이에요.' })
}
