import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { reorderMemberTools } from '@/lib/data/tools'
import { te } from '@/i18n/server'

/** A90: save the owner's '내가 쓰는 것' order. Body: { ids: entryId[] } in the new order. */
export async function PUT(req: Request) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)) : null
  if (!ids || ids.length > 200) return NextResponse.json({ error: await te('형식이 올바르지 않아요.') }, { status: 400 })
  try {
    await reorderMemberTools(member.id, ids)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: await te('순서를 저장하지 못했어요.') }, { status: 400 })
  }
}
