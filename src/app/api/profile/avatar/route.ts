import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { uploadAvatar } from '@/lib/data/profile'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

/** Upload an avatar image (png/jpg/webp/gif, ≤ 2MB) into the member's own storage folder. */
export async function POST(request: NextRequest) {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: await te('이미지를 골라주세요.') }, { status: 400 })
  try {
    return NextResponse.json({ url: await uploadAvatar(state.member.auth_id, file) })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    return NextResponse.json(
      { error: await te(m === 'avatar_type' ? msg('PNG·JPG·WEBP·GIF만 올릴 수 있어요.') : m === 'avatar_size' ? msg('2MB 이하 이미지만 올릴 수 있어요.') : msg('업로드하지 못했어요.')) },
      { status: 400 }
    )
  }
}
