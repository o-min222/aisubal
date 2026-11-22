import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { likeAnon } from '@/lib/data/anon'
import { anonError } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'

type Ctx = { params: Promise<{ id: string }> }

async function handle(params: Ctx['params'], like: boolean) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: '잘못된 글입니다.' }, { status: 400 })
  try {
    const likeCount = await likeAnon(id, member.id, like)
    return NextResponse.json({ liked: like, likeCount })
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}

export async function POST(_req: Request, { params }: Ctx) {
  return handle(params, true)
}
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(params, false)
}
