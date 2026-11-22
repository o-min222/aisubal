import { MAX_LINKS } from '@/lib/profile-rules'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { cleanLinks, saveLinks } from '@/lib/data/profile'
import { profileErrorMessage } from '@/lib/profile-rules'
import { te } from '@/i18n/server'

const schema = z.object({
  links: z.array(z.object({ kind: z.string().max(20), url: z.string().max(400), visibility: z.string().max(10).optional() })).max(12),
})

/** Replace all SNS links (each with its own visibility). */
export async function PUT(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('링크는 12개까지 저장할 수 있어요.') }, { status: 400 })
  const c = cleanLinks(parsed.data.links)
  if (!c.ok) return NextResponse.json({ error: await te(c.reason, { n: MAX_LINKS }) }, { status: 400 })
  try {
    await saveLinks(member.id, c.links)
    return NextResponse.json({ ok: true, links: c.links })
  } catch (e) {
    return NextResponse.json({ error: await te(profileErrorMessage(e)) }, { status: 400 })
  }
}
