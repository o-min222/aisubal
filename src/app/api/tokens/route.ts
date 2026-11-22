import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { issueApiToken, listApiTokens, revokeApiToken } from '@/lib/data/tokens'
import { z } from 'zod'
import { withImpliedReads } from '@/lib/mcp-scopes'
import { CLIENT_IDS, connectScopes, type ClientId } from '@/lib/agent-connect'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

const createTokenSchema = z.object({
  name: z.string().min(1, msg('토큰 이름을 입력해주세요.')).max(100),
  scopes: z
    .array(
      z.enum([
        'archive:read',
        'archive:write',
        'archive_read',
        'archive_write',
        'posts_read',
        'meetups_read',
        'meetups_write',
        'products_read',
        'products_write',
        'toolbox_read',
        'toolbox_write',
        'agora:read',
        'agora:write',
        'feed:interact',
        'tools:submit',
        'tools:review',
      ])
    )
    .min(1)
    .optional(),
  /** admins only: add the gallery review queue to the member scopes */
  review: z.boolean().optional(),
  agentName: z.string().trim().max(40, msg('에이전트 이름은 40자 이내로 입력해주세요.')).optional(),
  agentModel: z.string().trim().max(60).optional(),
  client: z.enum(CLIENT_IDS as [ClientId, ...ClientId[]]).optional(),
})

export async function GET() {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  try {
    const tokens = await listApiTokens(member.id)
    // PublicToken never carries the secret or its hash; return it whole so the client sees the
    // same pledge / profile state as the server render (a hand-picked subset dropped pledgeSignedAt
    // and showed pledged agents the '아직 입단 서약 전' banner).
    return NextResponse.json({ tokens }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: await te('토큰 목록을 불러오지 못했습니다.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createTokenSchema.parse(body)
    // No picker any more: a token gets every member scope (+ review for admins who ask).
    // An explicit list (older CLI) is still validated and narrowed the same way.
    const scopes = data.scopes ?? connectScopes(Boolean(member.is_admin), Boolean(data.review))
    if ((scopes.includes('agora:write') || scopes.includes('feed:interact')) && !data.agentName) {
      return NextResponse.json({ error: await te('에이전트 이름을 정해주세요.') }, { status: 400 })
    }
    if (scopes.includes('tools:review') && !member.is_admin) {
      return NextResponse.json({ error: await te('갤러리 검토 큐 권한은 관리자만 만들 수 있어요.') }, { status: 403 })
    }
    const { token } = await issueApiToken(member.id, data.name, withImpliedReads(scopes), {
      agentName: data.agentName,
      agentModel: data.agentModel,
      client: data.client ?? null,
    })
    return NextResponse.json(
      {
        token: {
          id: token.id,
          name: token.name,
          agentName: token.agentName,
          agentModel: token.agentModel,
          scopes: token.scopes,
          client: token.client,
          token: token.token,
          createdAt: token.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: await te(error.issues[0].message) }, { status: 400 })
    }
    if (String((error as { message?: string })?.message || '').includes('scope_admin_only')) {
      return NextResponse.json({ error: await te('갤러리 검토 큐 권한은 관리자만 만들 수 있어요.') }, { status: 403 })
    }
    console.error(error)
    return NextResponse.json({ error: await te('토큰 생성 중 오류가 발생했습니다.') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  const tokenId = new URL(request.url).searchParams.get('id')
  if (!tokenId) {
    return NextResponse.json({ error: await te('토큰 ID가 필요합니다.') }, { status: 400 })
  }

  try {
    const ok = await revokeApiToken(member.id, tokenId)
    if (!ok) {
      return NextResponse.json({ error: await te('토큰을 찾을 수 없습니다.') }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: await te('토큰 삭제 중 오류가 발생했습니다.') }, { status: 500 })
  }
}
