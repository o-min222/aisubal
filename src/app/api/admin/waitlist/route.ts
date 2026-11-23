import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { adminInviteFromWaitlist, adminListWaitlist, adminSetWaitlistStatus } from '@/lib/data/public-waitlist'
import { te } from '@/i18n/server'

/** A57: admin side of the public waitlist. Inviting issues a code to copy; nothing is sent. */
async function guard() {
  try {
    await requireAdmin()
    return null
  } catch {
    return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403 })
  }
}

const STATUS = z.enum(['waiting', 'invited', 'dismissed', 'all'])

export async function GET(req: NextRequest) {
  const no = await guard()
  if (no) return no
  const s = STATUS.safeParse(req.nextUrl.searchParams.get('status') ?? 'waiting')
  return NextResponse.json({ entries: await adminListWaitlist(s.success ? s.data : 'waiting') })
}

const action = z.object({ id: z.string().min(1).max(64), action: z.enum(['invite', 'dismiss', 'restore']) })

export async function POST(req: NextRequest) {
  const no = await guard()
  if (no) return no
  const parsed = action.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  const { id, action: a } = parsed.data
  try {
    if (a === 'invite') return NextResponse.json({ code: await adminInviteFromWaitlist(id) })
    return NextResponse.json({ ok: await adminSetWaitlistStatus(id, a === 'dismiss' ? 'dismissed' : 'waiting') })
  } catch (e) {
    console.error('[admin waitlist] failed', e)
    return NextResponse.json({ error: await te('처리에 실패했어요.') }, { status: 500 })
  }
}
