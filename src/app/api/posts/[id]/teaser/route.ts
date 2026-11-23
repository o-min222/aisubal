import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { disableTeaser, enableTeaser, getTeaserState, TeaserError } from '@/lib/data/teasers'
import { te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }

/** A56: the author's teaser switch for one post. GET state · POST turn on (consent) · DELETE turn off. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const st = await getTeaserState(id, member.id).catch(() => null)
  if (!st) return NextResponse.json({ error: await te('찾을 수 없어요.') }, { status: 404 })
  return NextResponse.json(st)
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json({ slug: await enableTeaser(id, member.id) }, { status: 201 })
  } catch (e) {
    const m = e instanceof TeaserError ? e.message : ''
    if (m.includes('teaser_ineligible')) return NextResponse.json({ error: await te('전체 회원 공개 글만 미리보기로 공유할 수 있어요.') }, { status: 400 })
    if (m.includes('forbidden')) return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403 })
    console.error('[teaser] enable failed', e)
    return NextResponse.json({ error: await te('처리에 실패했어요.') }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await getMember())) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json({ ok: await disableTeaser(id) })
  } catch (e) {
    console.error('[teaser] disable failed', e)
    return NextResponse.json({ error: await te('처리에 실패했어요.') }, { status: 500 })
  }
}
