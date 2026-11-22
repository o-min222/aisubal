import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listSocial, type SocialListKind } from '@/lib/data/social'
import { socialErrorMessage } from '@/lib/social-rules'
import { te } from '@/i18n/server'

const KINDS: SocialListKind[] = ['followers', 'following', 'friends', 'requests', 'sent']

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const kind = sp.get('kind') as SocialListKind
  const memberId = sp.get('member') || member.id
  if (!KINDS.includes(kind)) return NextResponse.json({ error: await te('kind가 올바르지 않아요.') }, { status: 400 })
  try {
    const people = await listSocial(member.id, memberId, kind, Number(sp.get('offset')) || 0, 50)
    return NextResponse.json({ people })
  } catch (e) {
    return NextResponse.json({ error: await te(socialErrorMessage(e)) }, { status: 400 })
  }
}
