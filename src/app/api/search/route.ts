import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { search } from '@/lib/data/search'
import { te } from '@/i18n/server'

/** Quick results for the top-bar search (⌘K). Members only; runs under the member's RLS. */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const results = await search(member.id, request.nextUrl.searchParams.get('q'), 4)
  return NextResponse.json(results, { headers: { 'Cache-Control': 'private, no-store' } })
}
