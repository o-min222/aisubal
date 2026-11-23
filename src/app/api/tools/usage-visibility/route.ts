import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { setUsageVisibility } from '@/lib/data/tools'
import { LINK_VISIBILITY, type LinkVisibility } from '@/lib/profile-rules'
import { te } from '@/i18n/server'

/** Who sees my '나도 써요' marks: members / friends / private. */
export async function POST(req: Request) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { vis?: string } | null
  const vis = LINK_VISIBILITY.find((v) => v.id === body?.vis)?.id as LinkVisibility | undefined
  if (!vis) return NextResponse.json({ error: await te('공개 범위를 다시 골라 주세요.') }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, vis: await setUsageVisibility(vis) })
  } catch {
    return NextResponse.json({ error: await te('처리하지 못했어요.') }, { status: 400 })
  }
}
