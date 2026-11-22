import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { issueApiToken, listApiTokens, revokeApiToken } from '@/lib/data/tokens'
import { z } from 'zod'

const createTokenSchema = z.object({
  name: z.string().min(1, '토큰 이름을 입력해주세요.').max(100),
  scopes: z
    .array(
      z.enum([
        'archive_read',
        'archive_write',
        'posts_read',
        'posts_write',
        'meetups_read',
        'meetups_write',
        'products_read',
        'products_write',
        'toolbox_read',
        'toolbox_write',
      ])
    )
    .min(1),
})

export async function GET() {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const tokens = await listApiTokens(member.id)
    return NextResponse.json({
      tokens: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        scopes: t.scopes,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
      })),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '토큰 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createTokenSchema.parse(body)
    const { token } = await issueApiToken(member.id, data.name, data.scopes)
    return NextResponse.json(
      {
        token: {
          id: token.id,
          name: token.name,
          scopes: token.scopes,
          token: token.token,
          createdAt: token.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: '토큰 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const tokenId = new URL(request.url).searchParams.get('id')
  if (!tokenId) {
    return NextResponse.json({ error: '토큰 ID가 필요합니다.' }, { status: 400 })
  }

  try {
    const ok = await revokeApiToken(member.id, tokenId)
    if (!ok) {
      return NextResponse.json({ error: '토큰을 찾을 수 없습니다.' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '토큰 삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
