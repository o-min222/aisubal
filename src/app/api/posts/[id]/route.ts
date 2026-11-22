import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { deletePost, getPost } from '@/lib/data/posts'
import { toPublicPostView, assertNoIdentityLeak } from '@/lib/profile'
import { te } from '@/i18n/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  const { id } = await params

  try {
    const post = await getPost(id)
    if (!post) {
      return NextResponse.json({ error: await te('게시물을 찾을 수 없습니다.') }, { status: 404 })
    }
    // 부캐 posts too: the hydrated author is nickname-only (0052), never the member behind it
    const pub = toPublicPostView(post, { archive_count: post.archive_count })
    assertNoIdentityLeak(pub, post.posted_as === 'nickname' && post.author_id ? [post.author_id] : [])
    return NextResponse.json({
      post: {
        ...pub,
        assets: post.assets.map((a) => ({
          id: a.id,
          type: a.type,
          name: a.name,
          content: a.content,
          filename: a.filename,
        })),
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: await te('게시물 조회 실패') }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  const { id } = await params
  try {
    const ok = await deletePost(id, member.id)
    if (!ok) {
      return NextResponse.json({ error: await te('삭제할 수 없습니다.') }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: await te('삭제 실패') }, { status: 500 })
  }
}
