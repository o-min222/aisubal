import { cache } from 'react'
import { DEV_ID, mockPerson } from '@/lib/mock-social'
import type { GroupMemberStatus, GroupRole, JoinPolicy } from '@/lib/group-rules'
import { uniqueGroupSlug } from '@/lib/group-rules'
import { sb, isMock } from './client'

/**
 * Topic groups. Reads go through RLS (hidden groups only for people with a
 * membership row); every write is a SECURITY DEFINER RPC from 0007.
 */
export type Group = {
  id: string
  slug: string
  name: string
  description: string
  emoji: string | null
  joinPolicy: JoinPolicy
  isHidden: boolean
  memberCount: number
  postCount: number
  createdAt: string
  myRole: GroupRole | null
  myStatus: GroupMemberStatus | null
}
export type GroupMember = {
  id: string
  name: string
  avatarUrl: string | null
  role: GroupRole
  status: GroupMemberStatus
  message: string | null
  joinedAt: string
}

type GroupRow = {
  id: string
  slug: string
  name: string
  description: string
  emoji: string | null
  join_policy: JoinPolicy
  is_hidden: boolean
  member_count: number
  post_count: number
  created_at: string
}

function toGroup(r: GroupRow, mine?: { role: GroupRole; status: GroupMemberStatus } | null): Group {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    emoji: r.emoji,
    joinPolicy: r.join_policy,
    isHidden: r.is_hidden,
    memberCount: r.member_count,
    postCount: r.post_count,
    createdAt: r.created_at,
    myRole: mine?.status === 'active' ? mine.role : null,
    myStatus: mine?.status ?? null,
  }
}

// ------------------------------------------------------------------ mock
type MockGroups = {
  groups: GroupRow[]
  members: Array<{ group_id: string; member_id: string; role: GroupRole; status: GroupMemberStatus; message: string | null; created_at: string }>
}
const g = globalThis as unknown as { __aisubalGroups?: MockGroups }
const v = (id: string) => (id === 'dev-user-id' ? DEV_ID : id)

export function mockGroups(): MockGroups {
  if (g.__aisubalGroups) return g.__aisubalGroups
  const t = (d: number) => new Date(Date.now() - d * 86400_000).toISOString()
  const groups: GroupRow[] = [
    { id: 'grp-claude-code', slug: 'claude-code', name: 'Claude Code 실전', description: 'Claude Code·에이전트 코딩 워크플로를 공유해요. 설정 파일, 훅, 서브에이전트 팁 환영.', emoji: '🧑‍💻', join_policy: 'open', is_hidden: false, member_count: 0, post_count: 2, created_at: t(20) },
    { id: 'grp-ai-design', slug: 'ai-design', name: 'AI 디자인 랩', description: '이미지·영상 생성, 디자인 시스템 자동화. 승인 후 가입돼요.', emoji: '🎨', join_policy: 'approval', is_hidden: false, member_count: 0, post_count: 0, created_at: t(15) },
    { id: 'grp-founders', slug: 'founders', name: '파운더 라운지', description: '창업자끼리 조용히 이야기하는 비공개 그룹.', emoji: '🚀', join_policy: 'approval', is_hidden: true, member_count: 0, post_count: 0, created_at: t(12) },
    { id: 'grp-mcp', slug: 'mcp-builders', name: 'MCP 빌더스', description: 'MCP 서버를 만들고 서로 리뷰해요.', emoji: '🔌', join_policy: 'open', is_hidden: false, member_count: 0, post_count: 0, created_at: t(9) },
  ]
  const members: MockGroups['members'] = [
    { group_id: 'grp-claude-code', member_id: DEV_ID, role: 'owner', status: 'active', message: null, created_at: t(20) },
    { group_id: 'grp-claude-code', member_id: 'member-4', role: 'mod', status: 'active', message: null, created_at: t(19) },
    { group_id: 'grp-claude-code', member_id: 'member-2', role: 'member', status: 'active', message: null, created_at: t(18) },
    { group_id: 'grp-claude-code', member_id: 'member-3', role: 'member', status: 'active', message: null, created_at: t(17) },
    { group_id: 'grp-claude-code', member_id: 'member-1', role: 'member', status: 'active', message: null, created_at: t(16) },
    { group_id: 'grp-claude-code', member_id: 'member-6', role: 'member', status: 'pending', message: '훅 설정 같이 보고 싶어요!', created_at: t(1) },
    { group_id: 'grp-ai-design', member_id: 'member-4', role: 'owner', status: 'active', message: null, created_at: t(15) },
    { group_id: 'grp-ai-design', member_id: DEV_ID, role: 'member', status: 'pending', message: '디자인 자동화 관심 있어요', created_at: t(2) },
    { group_id: 'grp-founders', member_id: 'member-1', role: 'owner', status: 'active', message: null, created_at: t(12) },
    { group_id: 'grp-founders', member_id: DEV_ID, role: 'mod', status: 'active', message: null, created_at: t(11) },
    { group_id: 'grp-mcp', member_id: 'member-3', role: 'owner', status: 'active', message: null, created_at: t(9) },
    { group_id: 'grp-mcp', member_id: 'member-8', role: 'member', status: 'active', message: null, created_at: t(8) },
  ]
  g.__aisubalGroups = { groups, members }
  recount()
  return g.__aisubalGroups
}
function recount() {
  const s = g.__aisubalGroups!
  for (const gr of s.groups) gr.member_count = s.members.filter((m) => m.group_id === gr.id && m.status === 'active').length
}
function mockMine(groupId: string, viewer: string) {
  return mockGroups().members.find((m) => m.group_id === groupId && m.member_id === v(viewer)) || null
}
function mockVisible(gr: GroupRow, viewer: string) {
  return !gr.is_hidden || Boolean(mockMine(gr.id, viewer))
}
/** DEV mock: the viewer's active role in a group (feed's group-identity check) */
export function mockGroupRoleOf(groupId: string, viewer: string): GroupRole | null {
  return mockRole(groupId, viewer)
}
function mockRole(groupId: string, viewer: string): GroupRole | null {
  const m = mockMine(groupId, viewer)
  return m?.status === 'active' ? m.role : null
}

// ------------------------------------------------------------------ reads
/** Groups I'm in (active), plus invitations / pending requests when asked. */
export const listMyGroups = cache(async (viewerId: string, includePending = false): Promise<Group[]> => {
  if (isMock()) {
    const s = mockGroups()
    return s.members
      .filter((m) => m.member_id === v(viewerId) && (includePending || m.status === 'active'))
      .map((m) => toGroup(s.groups.find((x) => x.id === m.group_id)!, m))
  }
  const supabase = await sb()
  let q = supabase
    .from('group_members')
    .select('role, status, group:groups(id, slug, name, description, emoji, join_policy, is_hidden, member_count, post_count, created_at)')
    .eq('member_id', viewerId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (!includePending) q = q.eq('status', 'active')
  const { data, error } = await q
  if (error) throw error
  return ((data || []) as unknown as Array<{ role: GroupRole; status: GroupMemberStatus; group: GroupRow | null }>)
    .filter((r) => r.group)
    .map((r) => toGroup(r.group!, r))
})

/** B14: groups I run (owner/mod): the composer offers their identity for root posts. */
export async function managedGroupIdentities(viewerId: string): Promise<Array<{ id: string; name: string }>> {
  const mine = await listMyGroups(viewerId)
  return mine.filter((g) => g.myRole === 'owner' || g.myRole === 'mod').map((g) => ({ id: g.id, name: g.name }))
}

/** Listed groups for discovery (hidden groups never show up here). */
export async function listDiscoverGroups(viewerId: string, q?: string | null): Promise<Group[]> {
  const term = (q || '').trim().toLowerCase()
  if (isMock()) {
    const s = mockGroups()
    return s.groups
      .filter((gr) => !gr.is_hidden && (!term || gr.name.toLowerCase().includes(term) || gr.description.toLowerCase().includes(term)))
      .sort((a, b) => b.member_count - a.member_count)
      .map((gr) => toGroup(gr, mockMine(gr.id, viewerId)))
  }
  const supabase = await sb()
  let query = supabase
    .from('groups')
    .select('id, slug, name, description, emoji, join_policy, is_hidden, member_count, post_count, created_at')
    .eq('is_hidden', false)
    .order('member_count', { ascending: false })
    .limit(60)
  if (term) query = query.or(`name.ilike.%${term.replace(/[%_,()]/g, '')}%,description.ilike.%${term.replace(/[%_,()]/g, '')}%`)
  const [{ data, error }, mine] = await Promise.all([query, listMyGroups(viewerId, true)])
  if (error) throw error
  const byId = new Map(mine.map((m) => [m.id, m]))
  return ((data || []) as GroupRow[]).map((r) => {
    const m = byId.get(r.id)
    return toGroup(r, m ? { role: m.myRole || 'member', status: m.myStatus || 'active' } : null)
  })
}

const gr = globalThis as unknown as { __aisubalGroupRedirects?: Map<string, string> }
const mockRedirects = () => (gr.__aisubalGroupRedirects ??= new Map())

export const getGroupBySlug = cache(async (viewerId: string, slug: string): Promise<Group | null> => {
  if (isMock()) {
    const gr = mockGroups().groups.find((x) => x.slug === slug)
    if (!gr || !mockVisible(gr, viewerId)) return null
    return toGroup(gr, mockMine(gr.id, viewerId))
  }
  const supabase = await sb()
  const { data } = await supabase
    .from('groups')
    .select('id, slug, name, description, emoji, join_policy, is_hidden, member_count, post_count, created_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!data) return null
  const { data: mine } = await supabase
    .from('group_members')
    .select('role, status')
    .eq('group_id', (data as GroupRow).id)
    .eq('member_id', viewerId)
    .maybeSingle()
  return toGroup(data as GroupRow, (mine as { role: GroupRole; status: GroupMemberStatus } | null) ?? null)
})

export async function getGroupById(viewerId: string, id: string): Promise<Group | null> {
  if (isMock()) {
    const gr = mockGroups().groups.find((x) => x.id === id)
    return gr && mockVisible(gr, viewerId) ? toGroup(gr, mockMine(gr.id, viewerId)) : null
  }
  const supabase = await sb()
  const { data } = await supabase.from('groups').select('slug').eq('id', id).maybeSingle()
  return data ? getGroupBySlug(viewerId, (data as { slug: string }).slug) : null
}

/** Active members (everyone who can see the group) + pending/invited rows (mods only, via RLS). */
export async function listGroupMembers(viewerId: string, groupId: string): Promise<GroupMember[]> {
  const order = { owner: 0, mod: 1, member: 2 } as const
  if (isMock()) {
    const role = mockRole(groupId, viewerId)
    return mockGroups()
      .members.filter((m) => m.group_id === groupId && (m.status === 'active' || role === 'owner' || role === 'mod' || m.member_id === v(viewerId)))
      .map((m) => ({ id: m.member_id, name: mockPerson(m.member_id).name, avatarUrl: null, role: m.role, status: m.status, message: m.message, joinedAt: m.created_at }))
      .sort((a, b) => order[a.role] - order[b.role] || a.joinedAt.localeCompare(b.joinedAt))
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('group_members')
    .select('member_id, role, status, message, created_at, member:members!group_members_member_id_fkey(display_name, avatar_url)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) throw error
  return ((data || []) as unknown as Array<{ member_id: string; role: GroupRole; status: GroupMemberStatus; message: string | null; created_at: string; member: { display_name: string; avatar_url: string | null } | null }>)
    .map((r) => ({ id: r.member_id, name: r.member?.display_name ?? '멤버', avatarUrl: r.member?.avatar_url ?? null, role: r.role, status: r.status, message: r.message, joinedAt: r.created_at }))
    .sort((a, b) => order[a.role] - order[b.role] || a.joinedAt.localeCompare(b.joinedAt))
}

// ------------------------------------------------------------------ writes
export type GroupInput = { name: string; slug?: string; description: string; emoji: string | null; joinPolicy: JoinPolicy; isHidden: boolean }

export async function createGroup(viewerId: string, input: GroupInput): Promise<Group> {
  if (isMock()) {
    const s = mockGroups()
    if (input.slug && s.groups.some((x) => x.slug === input.slug)) throw new Error('group_slug_taken')
    const slug = input.slug || uniqueGroupSlug(input.name, (c) => s.groups.some((x) => x.slug === c))
    const row: GroupRow = { id: `grp-${slug}`, slug, name: input.name, description: input.description, emoji: input.emoji, join_policy: input.joinPolicy, is_hidden: input.isHidden, member_count: 1, post_count: 0, created_at: new Date().toISOString() }
    s.groups.push(row)
    s.members.push({ group_id: row.id, member_id: v(viewerId), role: 'owner', status: 'active', message: null, created_at: row.created_at })
    recount()
    return toGroup(row, { role: 'owner', status: 'active' })
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('group_create', {
    p_name: input.name,
    p_slug: input.slug ?? null,
    p_description: input.description,
    p_emoji: input.emoji,
    p_join_policy: input.joinPolicy,
    p_hidden: input.isHidden,
  })
  if (error) throw new Error(error.message)
  const r = data as GroupRow & { my_role: GroupRole }
  return toGroup(r, { role: r.my_role || 'owner', status: 'active' })
}

export async function updateGroup(viewerId: string, groupId: string, input: GroupInput): Promise<{ slug: string | null }> {
  if (isMock()) {
    if (mockRole(groupId, viewerId) !== 'owner') throw new Error('group_forbidden')
    const gr = mockGroups().groups.find((x) => x.id === groupId)!
    if (input.slug && input.slug !== gr.slug) {
      if (mockGroups().groups.some((x) => x.slug === input.slug)) throw new Error('group_slug_taken')
      mockRedirects().set(gr.slug, gr.id)
    }
    Object.assign(gr, { name: input.name, description: input.description, emoji: input.emoji, join_policy: input.joinPolicy, is_hidden: input.isHidden, slug: input.slug || gr.slug })
    return { slug: gr.slug }
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('group_update', {
    p_group: groupId,
    p_name: input.name,
    p_description: input.description,
    p_emoji: input.emoji,
    p_join_policy: input.joinPolicy,
    p_hidden: input.isHidden,
  })
  if (error) throw new Error(error.message)
  if (!input.slug) return { slug: null }
  const { data, error: slugErr } = await supabase.rpc('group_set_slug', { p_group: groupId, p_slug: input.slug })
  if (slugErr) throw new Error(slugErr.message)
  return { slug: (data as { slug?: string } | null)?.slug ?? input.slug }
}

/** An old group address → the current one (0060), or null. */
export async function resolveGroupSlug(slug: string): Promise<string | null> {
  if (isMock()) {
    const id = mockRedirects().get(slug)
    return id ? mockGroups().groups.find((x) => x.id === id)?.slug ?? null : null
  }
  const supabase = await sb()
  const { data } = await supabase.rpc('group_resolve_slug', { p_slug: slug })
  return typeof data === 'string' && data ? data : null
}

export type MembershipAction =
  | { action: 'join'; message?: string | null }
  | { action: 'leave' }
  | { action: 'decide'; memberId: string; accept: boolean }
  | { action: 'invite'; memberId: string }
  | { action: 'role'; memberId: string; role: GroupRole }
  | { action: 'remove'; memberId: string }
  | { action: 'delete' }

export async function groupMembership(viewerId: string, groupId: string, a: MembershipAction): Promise<string> {
  if (isMock()) return mockMembership(viewerId, groupId, a)
  const supabase = await sb()
  const res =
    a.action === 'join'
      ? await supabase.rpc('group_join', { p_group: groupId, p_message: a.message ?? null })
      : a.action === 'leave'
        ? await supabase.rpc('group_leave', { p_group: groupId })
        : a.action === 'decide'
          ? await supabase.rpc('group_decide', { p_group: groupId, p_member: a.memberId, p_accept: a.accept })
          : a.action === 'invite'
            ? await supabase.rpc('group_invite', { p_group: groupId, p_member: a.memberId })
            : a.action === 'role'
              ? await supabase.rpc('group_set_role', { p_group: groupId, p_member: a.memberId, p_role: a.role })
              : a.action === 'remove'
                ? await supabase.rpc('group_remove', { p_group: groupId, p_member: a.memberId })
                : await supabase.rpc('group_delete', { p_group: groupId })
  if (res.error) throw new Error(res.error.message)
  return String(res.data)
}

function mockMembership(viewerId: string, groupId: string, a: MembershipAction): string {
  const s = mockGroups()
  const gr = s.groups.find((x) => x.id === groupId)
  if (!gr) throw new Error('group_not_found')
  const me = v(viewerId)
  const myRole = mockRole(groupId, viewerId)
  const row = (id: string) => s.members.find((m) => m.group_id === groupId && m.member_id === id)
  const drop = (id: string) => (s.members = s.members.filter((m) => !(m.group_id === groupId && m.member_id === id)))
  let out = 'ok'
  switch (a.action) {
    case 'join': {
      const mine = row(me)
      if (mine?.status === 'invited') mine.status = 'active'
      else if (!mine) {
        if (gr.is_hidden) throw new Error('group_not_found')
        s.members.push({ group_id: groupId, member_id: me, role: 'member', status: gr.join_policy === 'open' ? 'active' : 'pending', message: a.message ?? null, created_at: new Date().toISOString() })
      }
      out = row(me)!.status
      break
    }
    case 'leave':
      if (myRole === 'owner') throw new Error('group_owner_cannot_leave')
      drop(me)
      break
    case 'decide': {
      if (myRole !== 'owner' && myRole !== 'mod') throw new Error('group_forbidden')
      const r = row(a.memberId)
      if (!r || r.status !== 'pending') throw new Error('group_request_not_found')
      if (a.accept) r.status = 'active'
      else drop(a.memberId)
      out = a.accept ? 'active' : 'declined'
      break
    }
    case 'invite':
      if (myRole !== 'owner' && myRole !== 'mod') throw new Error('group_forbidden')
      if (!row(a.memberId)) s.members.push({ group_id: groupId, member_id: a.memberId, role: 'member', status: 'invited', message: null, created_at: new Date().toISOString() })
      out = row(a.memberId)!.status
      break
    case 'role': {
      if (myRole !== 'owner' || a.memberId === me) throw new Error('group_forbidden')
      const r = row(a.memberId)
      if (!r || r.status !== 'active') throw new Error('group_member_not_found')
      if (a.role === 'owner') row(me)!.role = 'mod'
      r.role = a.role
      out = a.role
      break
    }
    case 'remove': {
      const r = row(a.memberId)
      if (!r) break
      const ok = a.memberId !== me && r.role !== 'owner' && (myRole === 'owner' || (myRole === 'mod' && r.role === 'member'))
      if (!ok) throw new Error('group_forbidden')
      drop(a.memberId)
      break
    }
    case 'delete':
      if (myRole !== 'owner') throw new Error('group_forbidden')
      s.groups = s.groups.filter((x) => x.id !== groupId)
      s.members = s.members.filter((m) => m.group_id !== groupId)
      break
  }
  recount()
  return out
}
