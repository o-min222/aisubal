import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getToolboxEntry } from '@/lib/data/toolbox'
import { getPost } from '@/lib/data/posts'
import { te } from '@/i18n/server'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  const { id } = await params
  const entry = await getToolboxEntry(id)
  if (!entry) {
    return NextResponse.json({ error: await te('항목을 찾을 수 없습니다.') }, { status: 404 })
  }
  const mentionPosts = (
    await Promise.all(
      entry.mentions.map(async (m) => {
        const post = await getPost(m.post_id)
        if (!post) return null
        return { id: post.id, title: post.title, created_at: post.created_at, url: m.url }
      })
    )
  ).filter(Boolean)

  return NextResponse.json({
    entry,
    mention_posts: mentionPosts,
    security: {
      source_repo: entry.source_repo,
      github_url: entry.github_url,
      license: entry.license,
      last_commit_at: entry.last_commit_at,
      note: '설치 전 소스 레포·라이선스·최근 커밋을 확인하세요. 커뮤니티 항목은 공식 보증이 아닙니다.',
    },
  })
}
