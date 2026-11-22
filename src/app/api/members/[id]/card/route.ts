import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getMemberCard } from '@/lib/data/member-card'
import { isFeedId } from '@/lib/feed-ids'

/** Member-only: the unified profile card of a real-name member. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getMember()
  if (!viewer) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const raw = (await params).id
  const id = raw === 'me' ? viewer.id : raw
  if (id !== viewer.id && !isFeedId(id)) return NextResponse.json({ error: '찾을 수 없어요.' }, { status: 404 })
  const card = await getMemberCard(viewer, id).catch(() => null)
  if (!card) return NextResponse.json({ error: '찾을 수 없어요.' }, { status: 404 })
  return NextResponse.json(card, { headers: { 'cache-control': 'private, no-store' } })
}
