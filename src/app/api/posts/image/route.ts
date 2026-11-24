import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { PostImageError, uploadPostImage } from '@/lib/data/post-images'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

/** A62 스크린샷 한 장: upload first, then post with the returned path (the DB checks it is yours). */
export async function POST(request: NextRequest) {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: await te('이미지를 골라주세요.') }, { status: 400 })
  try {
    return NextResponse.json({ path: await uploadPostImage(state.member.auth_id, file) })
  } catch (e) {
    const m = e instanceof PostImageError ? e.message : ''
    if (!m) console.error('[posts/image] upload failed', e)
    return NextResponse.json(
      { error: await te(m === 'image_type' ? msg('PNG·JPG·WEBP·GIF만 올릴 수 있어요.') : m === 'image_size' ? msg('4MB 이하 이미지만 올릴 수 있어요.') : msg('업로드하지 못했어요.')) },
      { status: 400 }
    )
  }
}
