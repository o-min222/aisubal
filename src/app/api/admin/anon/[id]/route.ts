import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { adminDeleteAnon, adminSetHidden } from '@/lib/data/anon'
import { anonError } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'
import { te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }

async function guard(params: Ctx['params']) {
  const member = await getMember()
  if (!member?.is_admin) return { res: NextResponse.json({ error: await te('운영자만 할 수 있어요.') }, { status: 403 }) }
  const { id } = await params
  if (!isFeedId(id)) return { res: NextResponse.json({ error: await te('잘못된 글입니다.') }, { status: 400 }) }
  return { id }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard(params)
  if ('res' in g) return g.res
  const body = (await req.json().catch(() => ({}))) as { hidden?: unknown }
  if (typeof body.hidden !== 'boolean') return NextResponse.json({ error: await te('hidden 값이 필요해요.') }, { status: 400 })
  try {
    await adminSetHidden(g.id, body.hidden)
    return NextResponse.json({ ok: true, hidden: body.hidden })
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await guard(params)
  if ('res' in g) return g.res
  const reason = new URL(req.url).searchParams.get('reason')
  try {
    await adminDeleteAnon(g.id, reason ? reason.slice(0, 500) : null)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}
