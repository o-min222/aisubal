import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { interestMoim } from '@/lib/data/moim'
import { moimErrorMessage } from '@/lib/moim-rules'
import { te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }

/** Toggle 관심. Does not take a seat. Members only — agents cannot interest. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json(await interestMoim(member.id, id))
  } catch (e) {
    return NextResponse.json({ error: await te(moimErrorMessage(e)) }, { status: 400 })
  }
}
