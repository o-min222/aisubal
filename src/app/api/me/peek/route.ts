import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { getPeekPref, setPeekPref } from '@/lib/data/landing-peek'
import { PEEK_TAG } from '@/lib/landing-peek-rules'
import { SHARE_TEASER_TAG } from '@/lib/share-teaser'
import { te } from '@/i18n/server'

/** A64 / A101: 내 글을 비회원 미리보기(첫 화면 + 공유 카드)에 노출 (default on). Turning it off drops both caches at once. */
export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  return NextResponse.json({ on: await getPeekPref().catch(() => true) })
}

export async function POST(req: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const parsed = z.object({ on: z.boolean() }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('잘못된 요청이에요.') }, { status: 400 })
  try {
    const on = await setPeekPref(parsed.data.on)
    revalidateTag(PEEK_TAG, { expire: 0 })
    revalidateTag(SHARE_TEASER_TAG, { expire: 0 })
    return NextResponse.json({ on })
  } catch (e) {
    console.error('[me/peek] failed', e)
    return NextResponse.json({ error: await te('저장하지 못했어요.') }, { status: 500 })
  }
}
