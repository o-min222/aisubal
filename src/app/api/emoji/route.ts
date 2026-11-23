import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { addCustomEmoji, listCustomEmoji, ReactionError } from '@/lib/data/reactions'
import { normalizeShortcode, reactionErrorKey } from '@/lib/emoji-rules'
import { te } from '@/i18n/server'

/** A39: member-made custom emoji (picker list + upload) */
export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  try {
    return NextResponse.json({ emojis: await listCustomEmoji(member.id), isAdmin: Boolean(member.is_admin) })
  } catch (e) {
    console.error('[emoji] list failed', e)
    return NextResponse.json({ error: await te('불러오지 못했습니다.') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const code = normalizeShortcode(String(form?.get('shortcode') ?? ''))
  if (!code) return NextResponse.json({ error: await te('이름은 영문 소문자, 숫자, _로 2~32자예요.') }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: await te('이미지를 골라 주세요.') }, { status: 400 })
  try {
    return NextResponse.json({ emoji: await addCustomEmoji(member.auth_id, member.id, code, file) })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (m === 'emoji_type') return NextResponse.json({ error: await te('PNG, JPG, WEBP, GIF만 올릴 수 있어요.') }, { status: 400 })
    if (m === 'emoji_size') return NextResponse.json({ error: await te('256KB 이하 이미지만 올릴 수 있어요.') }, { status: 400 })
    if (!(e instanceof ReactionError)) console.error('[emoji] add failed', e)
    return NextResponse.json({ error: await te(reactionErrorKey(m)) }, { status: 400 })
  }
}
