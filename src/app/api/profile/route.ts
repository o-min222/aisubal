import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserState } from '@/lib/auth'
import { saveProfile } from '@/lib/data/profile'
import { profileErrorMessage, validateDisplayName, validateHandle } from '@/lib/profile-rules'

const schema = z.object({
  handle: z.string().max(40),
  displayName: z.string().max(60),
  bio: z.string().max(160).nullish(),
  avatar: z.string().max(500).default('keep'),
  showRealName: z.boolean().default(false),
})

/** Save the self-made profile (onboarding + 설정 > 프로필 편집). */
export async function POST(request: NextRequest) {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '입력값을 확인해주세요.' }, { status: 400 })
  const h = validateHandle(parsed.data.handle)
  if (!h.ok) return NextResponse.json({ error: h.reason, field: 'handle' }, { status: 400 })
  const n = validateDisplayName(parsed.data.displayName)
  if (!n.ok) return NextResponse.json({ error: n.reason, field: 'displayName' }, { status: 400 })
  try {
    await saveProfile(state.member, { ...parsed.data, handle: h.handle, displayName: n.name, bio: parsed.data.bio?.trim() || null })
    return NextResponse.json({ ok: true, handle: h.handle })
  } catch (e) {
    const msg = profileErrorMessage(e)
    return NextResponse.json({ error: msg, field: msg.includes('핸들') ? 'handle' : undefined }, { status: 400 })
  }
}
