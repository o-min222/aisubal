import { NextRequest, NextResponse } from 'next/server'
import { getMember, isDevMode } from '@/lib/auth'
import { z } from 'zod'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

const createFolderSchema = z.object({
  name: z.string().min(1, msg('폴더 이름을 입력해주세요.')).max(100),
})

export async function GET() {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  // In dev mode, return mock folders
  if (isDevMode()) {
    return NextResponse.json({
      folders: [
        { id: 'folder-1', name: '프롬프트', itemCount: 2 },
        { id: 'folder-2', name: 'MCP 설정', itemCount: 1 },
      ],
    })
  }

  // TODO: Implement Supabase query for production
  return NextResponse.json({ folders: [] })
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createFolderSchema.parse(body)

    // In dev mode, return success
    if (isDevMode()) {
      return NextResponse.json({
        folder: {
          id: `folder-${Date.now()}`,
          name: data.name,
          itemCount: 0,
          createdAt: new Date().toISOString(),
        },
      }, { status: 201 })
    }

    // TODO: Implement Supabase insert for production
    return NextResponse.json({ error: await te('Not implemented') }, { status: 501 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: await te(error.issues[0].message) },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: await te('폴더 생성 중 오류가 발생했습니다.') },
      { status: 500 }
    )
  }
}
