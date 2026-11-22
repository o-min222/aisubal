import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { markNotificationsRead } from '@/lib/data/notifications'
import { parseNotifyCategory } from '@/lib/notifications'
import { te } from '@/i18n/server'

/** { category?: 'replies' | … } — mark that tab (or everything) read. */
export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const raw = (await request.json().catch(() => ({}))) as { category?: string }
  try {
    const marked = await markNotificationsRead(parseNotifyCategory(raw.category ?? null))
    return NextResponse.json({ marked })
  } catch (e) {
    console.error('[notifications] mark read failed', e)
    return NextResponse.json({ error: await te('처리하지 못했어요. 잠시 후 다시 시도해주세요.') }, { status: 500 })
  }
}
