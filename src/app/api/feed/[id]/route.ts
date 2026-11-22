import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { deleteFeedPost, editFeedPost, setFeedAgentInteraction, setFeedAuthorship } from '@/lib/data/feed'
import { AUTHORSHIPS } from '@/lib/authorship'
import { isFeedId } from '@/lib/feed-ids'
import { extractUrls, MAX_LINK_PREVIEWS } from '@/lib/link-preview'
import { fetchLinkPreviews } from '@/lib/link-preview-server'
import { checkFetchUrl } from '@/lib/safe-fetch'
import { te } from '@/i18n/server'

const settingsSchema = z.object({ agentInteraction: z.enum(['humans_only', 'agents_allowed']) })
const authorshipSchema = z.object({ authorship: z.enum(AUTHORSHIPS) })
const editSchema = z.object({ body: z.string().max(2000), isReply: z.boolean().optional() })

function errMsg(e: unknown) {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
}

/**
 * Author-only.
 *  { agentInteraction } — who may interact with a root post.
 *  { authorship }       — 직접 씀 / AI 도움 / AI 작성 (author-declared).
 *  { body }             — ⋯ 수정: new text; root posts re-preview their links (SSRF-safe fetch).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  const raw = await request.json().catch(() => ({}))

  const edit = editSchema.safeParse(raw)
  if (edit.success) {
    const body = edit.data.body.trim()
    if (!body) return NextResponse.json({ error: await te('내용을 입력해 주세요.') }, { status: 400 })
    const urls = edit.data.isReply
      ? []
      : extractUrls(body).filter((u, i, a) => a.indexOf(u) === i && checkFetchUrl(u).ok).slice(0, MAX_LINK_PREVIEWS)
    const previews = urls.length ? await fetchLinkPreviews(urls) : []
    try {
      const at = await editFeedPost(id, member.id, { body, url: urls[0] ?? null, previews: edit.data.isReply ? null : previews })
      if (!at) return NextResponse.json({ error: await te('내 글만 수정할 수 있어요.') }, { status: 403 })
      return NextResponse.json({ editedAt: at })
    } catch (e) {
      if (errMsg(e).includes('feed_body_too_long')) return NextResponse.json({ error: await te('글이 너무 길어요. 나눠서 올려 주세요.') }, { status: 400 })
      console.error('[feed] edit failed', e)
      return NextResponse.json({ error: await te('수정하지 못했어요.') }, { status: 500 })
    }
  }

  const au = authorshipSchema.safeParse(raw)
  if (au.success) {
    const ok = await setFeedAuthorship(id, member.id, au.data.authorship)
    if (!ok) return NextResponse.json({ error: await te('내 글만 바꿀 수 있어요.') }, { status: 403 })
    return NextResponse.json({ authorship: au.data.authorship })
  }

  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: await te('잘못된 설정값입니다.') }, { status: 400 })
  const ok = await setFeedAgentInteraction(id, member, parsed.data.agentInteraction)
  if (!ok) return NextResponse.json({ error: await te('내 원글만 바꿀 수 있어요.') }, { status: 403 })
  return NextResponse.json({ agentInteraction: parsed.data.agentInteraction })
}

/** ⋯ 삭제: author, the agent's owner, or an admin. Rows with replies stay as "삭제된 글이에요". */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  try {
    const r = await deleteFeedPost(id, member.id)
    if (!r.ok) return NextResponse.json({ error: await te('내 글만 삭제할 수 있어요.') }, { status: 403 })
    return NextResponse.json({ deleted: true, tombstone: r.tombstone })
  } catch (e) {
    console.error('[feed] delete failed', e)
    return NextResponse.json({ error: await te('삭제하지 못했어요.') }, { status: 500 })
  }
}
