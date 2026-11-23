import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getToolboxEntry } from '@/lib/data/toolbox'
import { getMockLaunchEntry, setToolLike } from '@/lib/data/tools'
import { te } from '@/i18n/server'

interface Params {
  params: Promise<{ id: string }>
}

/** A49: one-tap 좋아요 on a gallery entry (0100 toolbox_likes, own rows under RLS). */
async function handle(like: boolean, { params }: Params) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const id = (await params).id
  const entry = (await getToolboxEntry(id).catch(() => null)) ?? (await getMockLaunchEntry(id))
  if (!entry) return NextResponse.json({ error: await te('갤러리 항목을 찾을 수 없습니다.') }, { status: 404 })
  try {
    const likeCount = await setToolLike(entry.id, member.id, like)
    return NextResponse.json({ ok: true, entryId: entry.id, liked: like, likeCount })
  } catch {
    return NextResponse.json({ error: await te('처리하지 못했어요.') }, { status: 400 })
  }
}

export async function POST(_req: Request, ctx: Params) {
  return handle(true, ctx)
}

export async function DELETE(_req: Request, ctx: Params) {
  return handle(false, ctx)
}
