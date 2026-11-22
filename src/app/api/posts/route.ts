import { NextRequest, NextResponse } from 'next/server'
import { getMember, getNicknameUnlockState } from '@/lib/auth'
import { canPostAs } from '@/lib/profile'
import { createPost, listPublicPosts } from '@/lib/data/posts'
import { z } from 'zod'

const assetSchema = z.object({
  type: z.enum(['SKILL_MD', 'MCP_CONFIG', 'CURSOR_RULES', 'PROMPT', 'NOTE']),
  name: z.string().min(1),
  content: z.string(),
  filename: z.string().optional(),
})

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(500, '코멘트는 500자 이하로 써 주세요.'),
  sourceNote: z.string().optional(),
  url: z.string().url().optional(),
  linkPreview: z
    .object({
      url: z.string(),
      title: z.string().nullable(),
      description: z.string().nullable(),
      image: z.string().nullable(),
      site_name: z.string().nullable(),
      favicon: z.string().nullable(),
      link_type: z.enum(['article', 'youtube', 'x', 'github', 'other']),
    })
    .optional(),
  postedAs: z.enum(['real', 'nickname']).default('real'),
  assets: z.array(assetSchema).optional(),
})

export async function GET() {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const posts = await listPublicPosts()
    return NextResponse.json({ posts })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '게시물 조회 실패' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createPostSchema.parse(body)
    const unlock = await getNicknameUnlockState()
    const asCheck = canPostAs(member, data.postedAs, unlock.unlocked)
    if (!asCheck.ok) {
      return NextResponse.json({ error: asCheck.reason }, { status: 403 })
    }

    const { post } = await createPost(member, {
      title: data.title,
      content: data.content,
      sourceNote: data.sourceNote,
      url: data.url,
      linkPreview: data.linkPreview,
      postedAs: data.postedAs,
      assets: data.assets,
    })
    return NextResponse.json({ post }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: '게시물 작성 중 오류' }, { status: 500 })
  }
}
