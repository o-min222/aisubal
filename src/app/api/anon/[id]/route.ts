import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { deleteAnon, editAnon, getAnonThread } from '@/lib/data/anon'
import { ANON_MAX_CHARS, anonError } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'
import { te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: await te('잘못된 글입니다.') }, { status: 400 })
  try {
    const thread = await getAnonThread(id, member.id)
    if (!thread) return NextResponse.json({ error: await te('글을 찾을 수 없어요.') }, { status: 404 })
    return NextResponse.json(thread)
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}

/** Author edits their own post or comment (ownership is checked inside the RPC). */
export async function PATCH(req: Request, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: await te('잘못된 글입니다.') }, { status: 400 })
  const raw = (await req.json().catch(() => ({}))) as { body?: unknown }
  const body = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (!body) return NextResponse.json({ error: await te('내용을 입력해주세요.') }, { status: 400 })
  if ([...body].length > ANON_MAX_CHARS) return NextResponse.json({ error: await te('글이 너무 길어요. 나눠서 올려 주세요.') }, { status: 400 })
  try {
    return NextResponse.json(await editAnon(id, member.id, body))
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}

/** Author deletes their own post (ownership is checked inside the RPC). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: await te('잘못된 글입니다.') }, { status: 400 })
  try {
    return NextResponse.json(await deleteAnon(id, member.id))
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}
