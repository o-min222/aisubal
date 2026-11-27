import { canRestrict } from '@/lib/post-visibility'
import { canAskQuestion } from '@/lib/question-rules'
import { kickWebhookWorker } from '@/lib/agent-webhooks'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { canPostAs } from '@/lib/profile'
import { createPost } from '@/lib/data/posts'
import { listFeedTimeline } from '@/lib/data/feed'
import { getGroupById } from '@/lib/data/groups'
import { canReadTimeline } from '@/lib/group-rules'
import { parseFeedScope } from '@/lib/social-rules'
import { validateFeedInput } from '@/lib/feed-rules'
import { extractUrls, MAX_LINK_PREVIEWS } from '@/lib/link-preview'
import { EXPANDED_LINKS } from '@/lib/link-embed'
import { fetchLinkPreviews } from '@/lib/link-preview-server'
import { checkFetchUrl } from '@/lib/safe-fetch'
import type { LinkPreview } from '@/lib/supabase/types'
import { te } from '@/i18n/server'
import { isPostImagePath } from '@/lib/quick-post-rules'

const schema = z.object({
  body: z.string().max(2000),
  parentId: z.string().max(64).nullish(),
  url: z.string().max(2000).nullish(),
  /** links the composer is showing previews for (after the author removed some); max 4 */
  urls: z.array(z.string().max(2000)).max(MAX_LINK_PREVIEWS).optional(),
  agentInteraction: z.enum(['humans_only', 'agents_allowed']).optional(),
  /** A43: 공유범위 (root, real-name, non-group posts only) */
  visibility: z.enum(['members', 'followers', 'friends', 'private']).optional(),
  /** A97: marked with the 질문해요 button (root, real-name, non-group posts only; otherwise ignored) */
  isQuestion: z.boolean().optional(),
  postedAs: z.enum(['real', 'nickname']).optional(),
  groupId: z.string().max(64).nullish(),
  /** B14: post under this group's identity (group owners/mods, root posts) */
  asGroupId: z.string().max(64).nullish(),
  /** A62: one uploaded image (from /api/posts/image) */
  imagePath: z.string().max(120).nullish(),
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
        .slice(0, EXPANDED_LINKS)
  const url = previewUrls[0] ?? null
  if (raw.imagePath && !isPostImagePath(raw.imagePath, member.auth_id)) {
    return NextResponse.json({ error: await te('이미지를 다시 올려 주세요.') }, { status: 400 })
  }
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

  // B14: group identity — root posts by that group's owner/mods; in a group timeline only that group
  let asGroup: { id: string; slug: string; name: string } | null = null
  if (raw.asGroupId && !raw.parentId) {
    const g = await getGroupById(member.id, raw.asGroupId)
    if (!g || (g.myRole !== 'owner' && g.myRole !== 'mod') || (raw.groupId && raw.groupId !== g.id)) {
      return NextResponse.json({ error: await te('그룹 이름으로는 그룹 운영자만 글을 쓸 수 있어요.') }, { status: 403 })
    }
    asGroup = { id: g.id, slug: g.slug, name: g.name }
  }

  const asCheck = canPostAs(v.value.postedAs)
  if (!asCheck.ok) return NextResponse.json({ error: await te(asCheck.reason) }, { status: 403 })

  const linkPreviews: LinkPreview[] = previewUrls.length ? await fetchLinkPreviews(previewUrls) : []
  const linkPreview: LinkPreview | undefined = linkPreviews[0]

  try {
    const { details } = await createPost(member, {
      content: v.value.body,
      parentId: v.value.parentId,
      agentInteraction: raw.groupId ? 'humans_only' : v.value.agentInteraction,
      visibility: canRestrict({ isReply: Boolean(raw.parentId), groupId: raw.groupId, asGroup: Boolean(asGroup), postedAs: v.value.postedAs }) ? raw.visibility ?? 'members' : 'members',
      postedAs: asGroup ? 'real' : v.value.postedAs,
      asGroup,
      groupId: raw.parentId ? null : raw.groupId || null,
      url: v.value.url || undefined,
      linkPreview,
      linkPreviews: linkPreviews.length ? linkPreviews : undefined,
      imagePath: raw.imagePath ?? null,
      isQuestion: raw.isQuestion === true && canAskQuestion({ isReply: Boolean(raw.parentId), groupId: raw.groupId, asGroup: Boolean(asGroup), postedAs: v.value.postedAs }),
    })
    kickWebhookWorker() // an @name.ai mention or a reply to an agent may have queued a webhook
    return NextResponse.json({ id: details.id }, { status: 201 })
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
    if (msg.includes('posts_group_real_name')) {
      return NextResponse.json({ error: await te('그룹에서는 기본 프로필로만 글을 쓸 수 있어요 (부캐 불가).') }, { status: 400 })
    }
    if (msg.includes('group_identity_')) {
      return NextResponse.json({ error: await te('그룹 이름으로는 그룹 운영자만 글을 쓸 수 있어요.') }, { status: 403 })
    }
    if (msg.includes('feed_parent_not_found')) {
      return NextResponse.json({ error: await te('원글을 찾을 수 없어요.') }, { status: 404 })
    }
    if (msg.includes('post_image_invalid')) {
      return NextResponse.json({ error: await te('이미지를 다시 올려 주세요.') }, { status: 400 })
    }
    if (msg.includes('feed_body_too_long')) {
      return NextResponse.json({ error: await te('글이 너무 길어요. 나눠서 올려 주세요.') }, { status: 400 })
    }
    console.error('[feed] create failed', e)
    return NextResponse.json({ error: await te('게시하지 못했어요.') }, { status: 500 })
  }
}
