import { sb, isMock } from './client'
import { listFeedLikers, mockFeedPost, setMemberFeedLike } from './feed'
import { listAgoraLikers, setMemberAgoraLike } from './agora'
import { MOCK_AGORA_POSTS, MOCK_AGORA_REPLIES } from '@/lib/mock-agora'
import { MOCK_MEMBERS } from '@/lib/mock-data'
import { CUSTOM_EMOJI_MAX_BYTES, CUSTOM_EMOJI_TYPES, THUMBS, sortSummary, type CustomEmoji, type ReactionSummary } from '@/lib/emoji-rules'
import type { TimelineLiker } from '@/components/timeline/types'

/** A39: emoji reactions on feed posts/comments. 👍 delegates to post_likes; the rest live in post_reactions.
 *  A60: the same for 아고라 (agora_likes / agora_reactions, 0102). */
export type ReactionSurface = 'feed' | 'agora'
const TABLE = { feed: 'post_reactions', agora: 'agora_reactions' } as const
function mockPost(surface: ReactionSurface, id: string) {
  return surface === 'agora' ? [...MOCK_AGORA_POSTS, ...MOCK_AGORA_REPLIES].find((p) => p.id === id) : mockFeedPost(id)
}

type MockReactions = { byPost: Map<string, Array<{ emoji: string; memberId: string; at: string }>>; customs: Array<{ shortcode: string; url: string; createdBy: string }> }
function mock(): MockReactions {
  const g = globalThis as unknown as { __aisubalReactions?: MockReactions }
  if (!g.__aisubalReactions) {
    const byPost = new Map<string, Array<{ emoji: string; memberId: string; at: string }>>()
    byPost.set('post-1', [
      { emoji: '🎉', memberId: 'member-2', at: '2026-11-20T00:00:00Z' },
      { emoji: '🎉', memberId: 'member-3', at: '2026-11-20T00:01:00Z' },
      { emoji: '🔥', memberId: 'member-4', at: '2026-11-20T00:02:00Z' },
    ])
    g.__aisubalReactions = { byPost, customs: [] }
  }
  return g.__aisubalReactions
}

function summarize(rows: Array<{ emoji: string; member_id: string }>, viewerId: string): ReactionSummary[] {
  const out: ReactionSummary[] = []
  for (const r of rows) {
    let cur = out.find((x) => x.emoji === r.emoji)
    if (!cur) out.push((cur = { emoji: r.emoji, count: 0, mine: false }))
    cur.count++
    if (r.member_id === viewerId) cur.mine = true
  }
  return sortSummary(out)
}

/** non-👍 reactions for many posts at once */
export async function listReactions(viewerId: string, ids: string[], surface: ReactionSurface = 'feed'): Promise<Record<string, ReactionSummary[]>> {
  const out: Record<string, ReactionSummary[]> = {}
  if (!ids.length) return out
  if (isMock()) {
    for (const id of ids) out[id] = summarize((mock().byPost.get(id) || []).map((r) => ({ emoji: r.emoji, member_id: r.memberId })), viewerId)
    return out
  }
  const supabase = await sb()
  const { data, error } = await supabase.from(TABLE[surface]).select('post_id, emoji, member_id').in('post_id', ids).order('created_at').limit(5000)
  if (error) throw error
  const by = new Map<string, Array<{ emoji: string; member_id: string }>>()
  for (const r of (data || []) as Array<{ post_id: string; emoji: string; member_id: string }>) {
    if (!by.has(r.post_id)) by.set(r.post_id, [])
    by.get(r.post_id)!.push(r)
  }
  for (const id of ids) out[id] = summarize(by.get(id) || [], viewerId)
  return out
}

export class ReactionError extends Error {}

/** add/remove one reaction; returns the post's fresh state */
export async function setReaction(
  postId: string,
  memberId: string,
  emoji: string,
  on: boolean,
  surface: ReactionSurface = 'feed'
): Promise<{ reactions: ReactionSummary[]; likeCount?: number; liked?: boolean }> {
  const fresh = async () => (await listReactions(memberId, [postId], surface))[postId] ?? []
  if (emoji === THUMBS) {
    const likeCount = surface === 'agora' ? await setMemberAgoraLike(postId, memberId, on) : await setMemberFeedLike(postId, memberId, on)
    return { reactions: await fresh(), likeCount, liked: on }
  }
  if (isMock()) {
    const p = mockPost(surface, postId)
    if (!p || p.isDeleted) throw new ReactionError('reaction_post_gone')
    const st = mock()
    const list = st.byPost.get(postId) || []
    if (/^:[a-z0-9_]+:$/.test(emoji) && !st.customs.some((c) => `:${c.shortcode}:` === emoji)) throw new ReactionError('reaction_unknown_emoji')
    const has = list.some((r) => r.emoji === emoji && r.memberId === memberId)
    if (on && !has) {
      if (list.filter((r) => r.memberId === memberId).length >= 20) throw new ReactionError('reaction_limit')
      list.push({ emoji, memberId, at: new Date().toISOString() })
    }
    st.byPost.set(postId, on ? list : list.filter((r) => !(r.emoji === emoji && r.memberId === memberId)))
    p.reactionCount = (st.byPost.get(postId) || []).length
    return { reactions: await fresh() }
  }
  const supabase = await sb()
  if (on) {
    const { error } = await supabase.from(TABLE[surface]).insert({ post_id: postId, member_id: memberId, emoji })
    if (error && error.code !== '23505') throw new ReactionError(error.message)
  } else {
    const { error } = await supabase.from(TABLE[surface]).delete().eq('post_id', postId).eq('member_id', memberId).eq('emoji', emoji)
    if (error) throw new ReactionError(error.message)
  }
  return { reactions: await fresh() }
}

/** who reacted with one emoji (👍 = the liker list, agents included) */
export async function listReactors(postId: string, emoji: string, surface: ReactionSurface = 'feed'): Promise<TimelineLiker[]> {
  if (emoji === THUMBS) return surface === 'agora' ? listAgoraLikers(postId) : listFeedLikers(postId)
  if (isMock()) {
    return (mock().byPost.get(postId) || [])
      .filter((r) => r.emoji === emoji)
      .map((r) => {
        const m = MOCK_MEMBERS.find((x) => x.id === r.memberId)
        return { kind: 'member' as const, id: r.memberId, name: m?.display_name ?? '개발자', avatarUrl: m?.avatar_url ?? null, createdAt: r.at }
      })
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from(TABLE[surface])
    .select(`member_id, created_at, member:members!${TABLE[surface]}_member_id_fkey(id, display_name, avatar_url)`)
    .eq('post_id', postId)
    .eq('emoji', emoji)
    .order('created_at')
    .limit(200)
  if (error) throw error
  type R = { member_id: string; created_at: string; member: { id: string; display_name: string; avatar_url: string | null } | null }
  return ((data || []) as unknown as R[]).map((r) => ({
    kind: 'member' as const,
    id: r.member_id,
    name: r.member?.display_name || '멤버',
    avatarUrl: r.member?.avatar_url ?? null,
    createdAt: r.created_at,
  }))
}

// ---------------------------------------------------------------- custom emoji

export async function listCustomEmoji(viewerId: string): Promise<CustomEmoji[]> {
  if (isMock()) return mock().customs.map((c) => ({ shortcode: c.shortcode, url: c.url, mine: c.createdBy === viewerId }))
  const supabase = await sb()
  const { data, error } = await supabase.from('custom_emojis').select('shortcode, storage_path, created_by').order('shortcode').limit(1000)
  if (error) throw error
  return ((data || []) as Array<{ shortcode: string; storage_path: string; created_by: string }>).map((r) => ({
    shortcode: r.shortcode,
    url: supabase.storage.from('emoji').getPublicUrl(r.storage_path).data.publicUrl,
    mine: r.created_by === viewerId,
  }))
}

export async function addCustomEmoji(authId: string, memberId: string, shortcode: string, file: File): Promise<CustomEmoji> {
  const ext = CUSTOM_EMOJI_TYPES[file.type]
  if (!ext) throw new ReactionError('emoji_type')
  if (file.size > CUSTOM_EMOJI_MAX_BYTES) throw new ReactionError('emoji_size')
  if (isMock()) {
    const st = mock()
    if (st.customs.some((c) => c.shortcode === shortcode)) throw new ReactionError('duplicate')
    const url = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`
    st.customs.push({ shortcode, url, createdBy: memberId })
    return { shortcode, url, mine: true }
  }
  const supabase = await sb()
  const { data: taken } = await supabase.from('custom_emojis').select('shortcode').eq('shortcode', shortcode).maybeSingle()
  if (taken) throw new ReactionError('duplicate')
  const path = `${authId}/${shortcode}-${Date.now().toString(36)}.${ext}`
  const up = await supabase.storage.from('emoji').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (up.error) throw new ReactionError(up.error.message)
  const { error } = await supabase.from('custom_emojis').insert({ shortcode, storage_path: path, created_by: memberId })
  if (error) {
    await supabase.storage.from('emoji').remove([path])
    throw new ReactionError(error.message)
  }
  return { shortcode, url: supabase.storage.from('emoji').getPublicUrl(path).data.publicUrl, mine: true }
}

/** the uploader or an admin (RLS decides); returns false when nothing was deleted */
export async function deleteCustomEmoji(shortcode: string, memberId: string, isAdmin: boolean): Promise<boolean> {
  if (isMock()) {
    const st = mock()
    const c = st.customs.find((x) => x.shortcode === shortcode)
    if (!c || (c.createdBy !== memberId && !isAdmin)) return false
    st.customs = st.customs.filter((x) => x !== c)
    for (const [k, list] of st.byPost) st.byPost.set(k, list.filter((r) => r.emoji !== `:${shortcode}:`))
    return true
  }
  const supabase = await sb()
  const { data, error } = await supabase.from('custom_emojis').delete().eq('shortcode', shortcode).select('storage_path')
  if (error) throw new ReactionError(error.message)
  const rows = (data || []) as Array<{ storage_path: string }>
  if (!rows.length) return false
  await supabase.storage.from('emoji').remove(rows.map((r) => r.storage_path))
  return true
}
