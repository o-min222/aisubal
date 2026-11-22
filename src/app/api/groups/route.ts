import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { createGroup, listDiscoverGroups, listMyGroups } from '@/lib/data/groups'
import { GROUP_SLUG_RE, groupErrorMessage } from '@/lib/group-rules'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

const schema = z.object({
  name: z.string().trim().min(2).max(40),
  slug: z.string().trim().toLowerCase().regex(GROUP_SLUG_RE),
  description: z.string().trim().max(500).default(''),
  emoji: z.string().trim().max(8).nullish(),
  joinPolicy: z.enum(['open', 'approval']),
  isHidden: z.boolean().default(false),
})

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const sp = request.nextUrl.searchParams
  if (sp.get('mine')) return NextResponse.json({ groups: await listMyGroups(member.id, true) })
  return NextResponse.json({ groups: await listDiscoverGroups(member.id, sp.get('q')) })
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    return NextResponse.json(
      { error: await te(field === 'slug' ? msg('주소는 영문 소문자·숫자·하이픈 2~40자예요.') : field === 'name' ? msg('그룹 이름은 2~40자예요.') : msg('입력값을 확인해주세요.')) },
      { status: 400 }
    )
  }
  try {
    const g = await createGroup(member.id, { ...parsed.data, emoji: parsed.data.emoji || null })
    return NextResponse.json({ group: g }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: await te(groupErrorMessage(e)) }, { status: 400 })
  }
}
