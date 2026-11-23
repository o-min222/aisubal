import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { icsFeedStatus, revokeIcsFeed, rotateIcsFeed } from '@/lib/data/moim-calendar'
import { te } from '@/i18n/server'

/** A53: my private 모임 calendar link — status, new link (shown once), turn off. */
async function guard() {
  const member = await getMember()
  return member ? null : NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
}

export async function GET() {
  const bad = await guard()
  if (bad) return bad
  return NextResponse.json(await icsFeedStatus())
}

export async function POST() {
  const bad = await guard()
  if (bad) return bad
  try {
    const { token, status } = await rotateIcsFeed()
    return NextResponse.json({ path: `/api/calendar/${token}.ics`, status }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: await te('잠시 후 다시 시도해 주세요.') }, { status: 400 })
  }
}

export async function DELETE() {
  const bad = await guard()
  if (bad) return bad
  return NextResponse.json(await revokeIcsFeed())
}
