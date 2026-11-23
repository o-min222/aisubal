import { DEV_ID, MOCK_PEOPLE, mockHandle, mockPerson, mockRelation, mockSocial } from '@/lib/mock-social'
import { NO_RELATION, relationFromRow, type Relation } from '@/lib/social-rules'
import { sb, isMock } from './client'

/**
 * Follow / friend data. Real mode reads through RLS and writes through the
 * SECURITY DEFINER RPCs in 0008 (follow_set, friend_request, friend_respond,
 * friend_remove). Edges are always between real-name identities.
 */

export type SocialPerson = { id: string; name: string; avatarUrl: string | null; bio: string; relation: Relation }
export type SocialSummary = { followers: number; following: number; friends: number; incomingRequests: number | null; relation: Relation }
export type SocialListKind = 'followers' | 'following' | 'friends' | 'requests' | 'sent'

function mockViewer(id: string) {
  return id === 'dev-user-id' ? DEV_ID : id
}

function personFromRow(r: Record<string, unknown>): SocialPerson {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    bio: String(r.bio ?? ''),
    relation: relationFromRow(r.relation as Record<string, unknown>),
  }
}

export function mockSocialPerson(viewer: string, id: string): SocialPerson {
  const p = mockPerson(id)
  return { id, name: p.name, avatarUrl: null, bio: p.bio, relation: mockRelation(mockViewer(viewer), id) }
}

/** Viewer's relation to many members (feed cards, tool users, graph). */
export async function getRelations(viewerId: string, ids: string[]): Promise<Map<string, Relation>> {
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, 300)
  const out = new Map<string, Relation>()
  if (!uniq.length) return out
  if (isMock()) {
    for (const id of uniq) out.set(id, mockRelation(mockViewer(viewerId), id))
    return out
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('social_relations', { p_members: uniq })
  if (error) throw error
  for (const [k, v] of Object.entries((data || {}) as Record<string, Record<string, unknown>>)) out.set(k, relationFromRow(v))
  for (const id of uniq) if (!out.has(id)) out.set(id, { ...NO_RELATION, isMe: id === viewerId })
  return out
}

export async function getSocialSummary(viewerId: string, memberId: string): Promise<SocialSummary> {
  if (isMock()) {
    const s = mockSocial()
    const v = mockViewer(viewerId)
    return {
      followers: s.follows.filter((f) => f.followee === memberId).length,
      following: s.follows.filter((f) => f.follower === memberId).length,
      friends: s.friendships.filter((f) => f.status === 'accepted' && (f.requester === memberId || f.addressee === memberId)).length,
      incomingRequests: memberId === v ? s.friendships.filter((f) => f.addressee === v && f.status === 'pending').length : null,
      relation: mockRelation(v, memberId),
    }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('social_summary', { p_member: memberId })
  if (error) throw error
  const d = data as Record<string, unknown>
  return {
    followers: Number(d.followers ?? 0),
    following: Number(d.following ?? 0),
    friends: Number(d.friends ?? 0),
    incomingRequests: d.incoming_requests == null ? null : Number(d.incoming_requests),
    relation: relationFromRow(d.relation as Record<string, unknown>),
  }
}

export async function listSocial(viewerId: string, memberId: string, kind: SocialListKind, offset = 0, limit = 50): Promise<SocialPerson[]> {
  if (isMock()) {
    const s = mockSocial()
    const v = mockViewer(viewerId)
    if ((kind === 'requests' || kind === 'sent') && memberId !== v) return []
    let ids: string[] = []
    if (kind === 'followers') ids = s.follows.filter((f) => f.followee === memberId).map((f) => f.follower)
    if (kind === 'following') ids = s.follows.filter((f) => f.follower === memberId).map((f) => f.followee)
    if (kind === 'friends')
      ids = s.friendships
        .filter((f) => f.status === 'accepted' && (f.requester === memberId || f.addressee === memberId))
        .map((f) => (f.requester === memberId ? f.addressee : f.requester))
    if (kind === 'requests') ids = s.friendships.filter((f) => f.addressee === memberId && f.status === 'pending').map((f) => f.requester)
    if (kind === 'sent') ids = s.friendships.filter((f) => f.requester === memberId && f.status === 'pending').map((f) => f.addressee)
    return ids.slice(offset, offset + limit).map((id) => mockSocialPerson(viewerId, id))
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('social_list', { p_member: memberId, p_kind: kind, p_offset: offset, p_limit: limit })
  if (error) throw error
  return ((data || []) as Array<Record<string, unknown>>).map(personFromRow)
}

export type FriendAction = 'request' | 'accept' | 'decline' | 'remove'

export async function setFollow(viewerId: string, memberId: string, follow: boolean): Promise<Relation> {
  if (isMock()) {
    const v = mockViewer(viewerId)
    if (v === memberId) throw new Error('social_self')
    const s = mockSocial()
    s.follows = s.follows.filter((f) => !(f.follower === v && f.followee === memberId))
    if (follow) s.follows.push({ follower: v, followee: memberId, at: new Date().toISOString() })
    return mockRelation(v, memberId)
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('follow_set', { p_member: memberId, p_follow: follow })
  if (error) throw new Error(error.message)
  return relationFromRow(data as Record<string, unknown>)
}

export async function friendAction(viewerId: string, memberId: string, action: FriendAction): Promise<Relation> {
  if (isMock()) {
    const v = mockViewer(viewerId)
    if (v === memberId) throw new Error('social_self')
    const s = mockSocial()
    const idx = s.friendships.findIndex(
      (f) => (f.requester === v && f.addressee === memberId) || (f.requester === memberId && f.addressee === v)
    )
    const f = idx >= 0 ? s.friendships[idx] : null
    const now = new Date().toISOString()
    if (action === 'request') {
      if (f?.status === 'pending' && f.requester === memberId) Object.assign(f, { status: 'accepted', respondedAt: now })
      else if (!f || f.status === 'declined') {
        if (f && f.requester === v && f.respondedAt && Date.now() - Date.parse(f.respondedAt) < 14 * 86400_000) throw new Error('social_friend_cooldown')
        if (f) s.friendships.splice(idx, 1)
        s.friendships.push({ requester: v, addressee: memberId, status: 'pending', at: now, respondedAt: null })
      }
    } else if (action === 'accept' || action === 'decline') {
      if (!f || f.status !== 'pending' || f.requester !== memberId) throw new Error('social_request_not_found')
      Object.assign(f, { status: action === 'accept' ? 'accepted' : 'declined', respondedAt: now })
    } else if (f && (f.status === 'accepted' || (f.status === 'pending' && f.requester === v))) {
      s.friendships.splice(idx, 1)
    }
    return mockRelation(v, memberId)
  }
  const supabase = await sb()
  const call =
    action === 'request'
      ? supabase.rpc('friend_request', { p_member: memberId })
      : action === 'remove'
        ? supabase.rpc('friend_remove', { p_member: memberId })
        : supabase.rpc('friend_respond', { p_member: memberId, p_accept: action === 'accept' })
  const { data, error } = await call
  if (error) throw new Error(error.message)
  return relationFromRow(data as Record<string, unknown>)
}

/** Author ids for the feed's 팔로잉 / 친구 tabs. */
export async function socialAuthorIds(viewerId: string, scope: 'following' | 'friends'): Promise<string[]> {
  if (isMock()) {
    const v = mockViewer(viewerId)
    const s = mockSocial()
    if (scope === 'following') return s.follows.filter((f) => f.follower === v).map((f) => f.followee)
    return s.friendships
      .filter((f) => f.status === 'accepted' && (f.requester === v || f.addressee === v))
      .map((f) => (f.requester === v ? f.addressee : f.requester))
  }
  const supabase = await sb()
  if (scope === 'following') {
    const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', viewerId).limit(1000)
    return ((data || []) as Array<{ followee_id: string }>).map((r) => r.followee_id)
  }
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`)
    .limit(1000)
  return ((data || []) as Array<{ requester_id: string; addressee_id: string }>).map((r) =>
    r.requester_id === viewerId ? r.addressee_id : r.requester_id
  )
}

/** Members (real names) for pickers, e.g. inviting to a hidden group. */
export async function searchMembers(q: string, limit = 8): Promise<Array<{ id: string; name: string; avatarUrl: string | null }>> {
  const term = q.trim()
  if (!term) return []
  if (isMock()) {
    const t = term.replace(/^@/, '').toLowerCase()
    return MOCK_PEOPLE.filter((p) => p.name.includes(term) || mockHandle(p.id).includes(t)).slice(0, limit).map((p) => ({ id: p.id, name: p.name, handle: mockHandle(p.id), avatarUrl: null }))
  }
  const safe = term.replace(/[%_,().*\\]/g, '')
  if (!safe) return []
  const supabase = await sb()
  const { data } = await supabase
    .from('members')
    .select('id, display_name, handle, avatar_url')
    .not('signup_completed_at', 'is', null)
    .eq('is_banned', false)
    .or(`display_name.ilike.%${safe}%,handle.ilike.%${safe.replace(/^@/, '').toLowerCase()}%`)
    .limit(limit)
  return ((data || []) as Array<{ id: string; display_name: string; handle: string | null; avatar_url: string | null }>).map((m) => ({
    id: m.id,
    name: m.display_name,
    handle: m.handle,
    avatarUrl: m.avatar_url,
  }))
}
