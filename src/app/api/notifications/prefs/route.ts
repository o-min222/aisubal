import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { getNotifyPrefs, setNotifyPref } from '@/lib/data/notifications'
import { NOTIFY_CATEGORIES } from '@/lib/notifications'
import { te } from '@/i18n/server'

const schema = z.object({ key: z.enum(['digest_weekly', ...NOTIFY_CATEGORIES.map((c) => c.id)] as [string, ...string[]]), on: z.boolean() })

export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  return NextResponse.json({ prefs: await getNotifyPrefs() })
}

export async function PATCH(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: await te('잘못된 설정값입니다.') }, { status: 400 })
  try {
    return NextResponse.json({ prefs: await setNotifyPref(parsed.data.key as never, parsed.data.on) })
  } catch (e) {
    console.error('[notifications] prefs failed', e)
    return NextResponse.json({ error: await te('저장하지 못했어요.') }, { status: 500 })
  }
}
