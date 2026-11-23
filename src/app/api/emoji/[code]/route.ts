import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { deleteCustomEmoji } from '@/lib/data/reactions'
import { normalizeShortcode } from '@/lib/emoji-rules'
import { te } from '@/i18n/server'

/** the uploader or an admin deletes a custom emoji (and, by trigger, its reactions) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const code = normalizeShortcode((await params).code)
  if (!code) return NextResponse.json({ error: await te('없는 이모지예요.') }, { status: 400 })
  try {
    const ok = await deleteCustomEmoji(code, member.id, Boolean(member.is_admin))
    if (!ok) return NextResponse.json({ error: await te('삭제할 수 없어요.') }, { status: 403 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[emoji] delete failed', e)
    return NextResponse.json({ error: await te('삭제하지 못했어요.') }, { status: 500 })
  }
}
