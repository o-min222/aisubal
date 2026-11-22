import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember, getNicknameUnlockState } from '@/lib/auth'
import { canPostAs } from '@/lib/profile'
import { createPost } from '@/lib/data/posts'
import { listFeedTimeline } from '@/lib/data/feed'
import { validateFeedInput } from '@/lib/feed-rules'
import { fetchLinkPreview, detectLinkType } from '@/lib/link-preview'
import type { LinkPreview } from '@/lib/supabase/types'

const schema = z.object({
  body: z.string().max(2000),
  parentId: z.string().max(64).nullish(),
  url: z.string().max(2000).nullish(),
  agentInteraction: z.enum(['humans_only', 'agents_allowed']).optional(),
  postedAs: z.enum(['real', 'nickname']).optional(),
})

const URL_RE = /https?:\/\/[^\s<>"']+/i

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const before = request.nextUrl.searchParams.get('before') || undefined
  try {
    const posts = await listFeedTimeline(member.id, { before, limit: 30 })
    return NextResponse.json({ posts })
  } catch (e) {
    console.error('[feed] list failed', e)
    return NextResponse.json({ error: '피드를 불러오지 못했습니다.' }, { status: 500 })
  }
}

/** Members only (session). Agents can never create posts here — see /api/mcp feed_* tools. */
export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  let raw: z.infer<typeof schema>
  try {
    raw = schema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않아요.' }, { status: 400 })
  }
  const url = raw.url || (raw.parentId ? null : raw.body.match(URL_RE)?.[0]) || null
  const v = validateFeedInput({ ...raw, url })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const unlock = await getNicknameUnlockState()
  const asCheck = canPostAs(member, v.value.postedAs, unlock.unlocked)
  if (!asCheck.ok) return NextResponse.json({ error: asCheck.reason }, { status: 403 })

  let linkPreview: LinkPreview | undefined
  if (v.value.url) {
    try {
      linkPreview = await fetchLinkPreview(v.value.url)
    } catch {
      linkPreview = {
        url: v.value.url,
        title: null,
        description: null,
        image: null,
        site_name: null,
        favicon: null,
        link_type: detectLinkType(v.value.url),
      }
    }
  }

  try {
    const { details } = await createPost(member, {
      content: v.value.body,
      parentId: v.value.parentId,
      agentInteraction: v.value.agentInteraction,
      postedAs: v.value.postedAs,
      url: v.value.url || undefined,
      linkPreview,
    })
    return NextResponse.json({ id: details.id }, { status: 201 })
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
    if (msg.includes('feed_parent_not_found')) {
      return NextResponse.json({ error: '원글을 찾을 수 없어요.' }, { status: 404 })
    }
    if (msg.includes('feed_body_too_long')) {
      return NextResponse.json({ error: '500자 이하로 써 주세요.' }, { status: 400 })
    }
    console.error('[feed] create failed', e)
    return NextResponse.json({ error: '게시하지 못했어요.' }, { status: 500 })
  }
}
