import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getNicknameUnlockState, getMember } from '@/lib/auth'
import { saveNicknameProfile } from '@/lib/data/profile'
import { validateNickname } from '@/lib/profile'
import { profileErrorMessage } from '@/lib/profile-rules'

const schema = z.object({ nickname: z.string().max(40), bio: z.string().max(160).default('') })

/** Optional secondary 별명 persona (opens when the community passes the threshold). */
export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const unlock = await getNicknameUnlockState()
  if (!unlock.unlocked) return NextResponse.json({ error: '아직 별명 프로필이 열리지 않았어요.' }, { status: 403 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '입력값을 확인해주세요.' }, { status: 400 })
  const v = validateNickname(parsed.data.nickname)
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 })
  try {
    await saveNicknameProfile(v.nickname, parsed.data.bio)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: profileErrorMessage(e) }, { status: 400 })
  }
}
