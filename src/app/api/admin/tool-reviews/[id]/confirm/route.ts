import { NextResponse, type NextRequest } from 'next/server'
import { getMember } from '@/lib/auth'
import { confirmRecommendation } from '@/lib/data/tool-submissions'
import { te } from '@/i18n/server'

/** P-4: a human admin publishes an AI-recommended gallery submission. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member?.is_admin) return NextResponse.json({ error: await te('관리자만 할 수 있어요.') }, { status: 403 })
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    const r = await confirmRecommendation(id)
    return NextResponse.json({ ok: true, slug: r.slug })
  } catch (e) {
    const m = String((e as Error).message || '')
    const error = m.includes('duplicate_url')
      ? await te('같은 주소가 이미 갤러리에 있어요.')
      : m.includes('already_') || m.includes('not_recommended')
        ? await te('이미 처리됐거나 AI 추천 상태가 아니에요.')
        : await te('승인하지 못했어요.')
    return NextResponse.json({ error }, { status: 409 })
  }
}
