import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { deleteAnon, getAnonThread } from '@/lib/data/anon'
import { anonError } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: '잘못된 글입니다.' }, { status: 400 })
  try {
    const thread = await getAnonThread(id, member.id)
    if (!thread) return NextResponse.json({ error: '글을 찾을 수 없어요.' }, { status: 404 })
    return NextResponse.json(thread)
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}

/** Author deletes their own post (ownership is checked inside the RPC). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: '잘못된 글입니다.' }, { status: 400 })
  try {
    return NextResponse.json(await deleteAnon(id, member.id))
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}
