import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember, getNicknameUnlockState } from '@/lib/auth'
import { canPostAs } from '@/lib/profile'
import { createPost } from '@/lib/data/posts'
import { listFeedTimeline } from '@/lib/data/feed'
import { getGroupById } from '@/lib/data/groups'
import { canReadTimeline } from '@/lib/group-rules'
import { parseFeedScope } from '@/lib/social-rules'
import { validateFeedInput } from '@/lib/feed-rules'
import { extractUrls, MAX_LINK_PREVIEWS } from '@/lib/link-preview'
import { fetchLinkPreviews } from '@/lib/link-preview-server'
import { checkFetchUrl } from '@/lib/safe-fetch'
import type { LinkPreview } from '@/lib/supabase/types'
import { te } from '@/i18n/server'
import { AUTHORSHIPS } from '@/lib/authorship'

const schema = z.object({
  body: z.string().max(2000),
  parentId: z.string().max(64).nullish(),
  url: z.string().max(2000).nullish(),
  /** links the composer is showing previews for (after the author removed some); max 4 */
  urls: z.array(z.string().max(2000)).max(MAX_LINK_PREVIEWS).optional(),
  agentInteraction: z.enum(['humans_only', 'agents_allowed']).optional(),
  authorship: z.enum(AUTHORSHIPS).optional(),
  postedAs: z.enum(['real', 'nickname']).optional(),
  groupId: z.string().max(64).nullish(),
})

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const before = sp.get('before') || undefined
  const scope = parseFeedScope(sp.get('scope'))
  const groupId = sp.get('group') || null
  try {
    if (groupId) {
      const g = await getGroupById(member.id, groupId)
      if (!g || !canReadTimeline(g, g.myStatus)) return NextResponse.json({ posts: [] })
    }
    const posts = await listFeedTimeline(member.id, { before, limit: 30, scope, groupId })
    return NextResponse.json({ posts })
  } catch (e) {
    console.error('[feed] list failed', e)
    return NextResponse.json({ error: await te('피드를 불러오지 못했습니다.') }, { status: 500 })
  }
}

/** Members only (session). Agents can never create posts here — see /api/mcp feed_* tools. */
export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  let raw: z.infer<typeof schema>
  try {
    raw = schema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  }
  // Top-level posts: preview the links the composer kept (or every link in the body,
  // for older clients). Replies never get preview cards.
  const previewUrls = raw.parentId
    ? []
    : (raw.urls ?? (raw.url ? [raw.url] : extractUrls(raw.body)))
        .filter((u, i, a) => a.indexOf(u) === i && checkFetchUrl(u).ok)
        .slice(0, MAX_LINK_PREVIEWS)
  const url = previewUrls[0] ?? null
  const v = validateFeedInput({ ...raw, url })
  if (!v.ok) return NextResponse.json({ error: await te(v.error) }, { status: 400 })

  if (raw.groupId && !raw.parentId) {
    const g = await getGroupById(member.id, raw.groupId)
    if (!g || g.myStatus !== 'active') {
      return NextResponse.json({ error: await te('그룹 멤버만 글을 쓸 수 있어요.') }, { status: 403 })
    }
  }

  if (raw.groupId && v.value.postedAs === 'nickname') {
    return NextResponse.json({ error: await te('그룹에서는 기본 프로필로만 글을 쓸 수 있어요 (부캐 불가).') }, { status: 400 })
  }

  const unlock = await getNicknameUnlockState()
  const asCheck = canPostAs(member, v.value.postedAs, unlock.unlocked)
  if (!asCheck.ok) return NextResponse.json({ error: await te(asCheck.reason) }, { status: 403 })

  const linkPreviews: LinkPreview[] = previewUrls.length ? await fetchLinkPreviews(previewUrls) : []
  const linkPreview: LinkPreview | undefined = linkPreviews[0]

  try {
    const { details } = await createPost(member, {
      content: v.value.body,
      parentId: v.value.parentId,
      agentInteraction: raw.groupId ? 'humans_only' : v.value.agentInteraction,
      postedAs: v.value.postedAs,
      authorship: raw.parentId ? 'human' : raw.authorship ?? 'human',
      groupId: raw.parentId ? null : raw.groupId || null,
      url: v.value.url || undefined,
      linkPreview,
      linkPreviews: linkPreviews.length ? linkPreviews : undefined,
    })
    return NextResponse.json({ id: details.id }, { status: 201 })
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
    if (msg.includes('posts_group_real_name')) {
      return NextResponse.json({ error: await te('그룹에서는 기본 프로필로만 글을 쓸 수 있어요 (부캐 불가).') }, { status: 400 })
    }
    if (msg.includes('feed_parent_not_found')) {
      return NextResponse.json({ error: await te('원글을 찾을 수 없어요.') }, { status: 404 })
    }
    if (msg.includes('feed_body_too_long')) {
      return NextResponse.json({ error: await te('글이 너무 길어요. 나눠서 올려 주세요.') }, { status: 400 })
    }
    console.error('[feed] create failed', e)
    return NextResponse.json({ error: await te('게시하지 못했어요.') }, { status: 500 })
  }
}
