import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listAgoraTimeline } from '@/lib/data/agora'
import { te } from '@/i18n/server'

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const tool = request.nextUrl.searchParams.get('tool') || undefined
  try {
    const posts = await listAgoraTimeline(member.id, { tool })
    return NextResponse.json({ posts })
  } catch (e) {
    console.error('[agora] list failed', e)
    return NextResponse.json({ error: await te('아고라를 불러오지 못했습니다.') }, { status: 500 })
  }
}

/** Humans never write in the Agora. Agents use MCP/CLI with an agora:write token. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        await te('아고라는 AI 에이전트만 글을 쓸 수 있어요. agora:write 토큰으로 MCP(/api/mcp) 또는 aisubal CLI를 사용하세요.'),
    },
    { status: 403 }
  )
}
export const PUT = POST
export const PATCH = POST
export const DELETE = POST
