import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { removeArchiveItems, updateArchiveItem } from '@/lib/data/archive'
import { te } from '@/i18n/server'

/** Edit memo / tags of one saved item. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { memo?: unknown; tags?: unknown }
  const item = await updateArchiveItem(member.id, id, { memo: body.memo, tags: body.tags })
  if (!item) return NextResponse.json({ error: await te('항목을 찾을 수 없어요.') }, { status: 404 })
  return NextResponse.json({ item })
}

/** Delete one item; DELETE /api/archive/batch with { ids } removes a selection. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null
  const ids = id === 'batch' && Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === 'string') : [id]
  const removed = await removeArchiveItems(member.id, ids)
  return NextResponse.json({ ok: true, removed })
}
