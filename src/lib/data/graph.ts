import { DEV_ID, MOCK_PEOPLE, mockPerson, mockRelation } from '@/lib/mock-social'
import { relationFromRow, type Relation } from '@/lib/social-rules'
import { sb, isMock } from './client'

/**
 * Invite network graph (members only). The first load returns up to 3 hops
 * around a center member; children beyond that are fetched page by page via
 * invite_children — never the full tree.
 */
export type GraphNode = {
  id: string
  name: string
  avatarUrl: string | null
  bio: string
  parentId: string | null
  depth: number | null
  childCount: number
  joinedAt: string | null
  relation: Relation
}
export type GraphPayload = { rootId: string; perNode: number; nodes: GraphNode[] }
export type ChildrenPage = { parentId: string; total: number; offset: number; hasMore: boolean; nodes: GraphNode[] }

export const GRAPH_HOPS = 3
export const GRAPH_PER_NODE = 12

function nodeFromRow(r: Record<string, unknown>): GraphNode {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    bio: String(r.bio ?? ''),
    parentId: (r.parent_id as string | null) ?? null,
    depth: r.depth == null ? null : Number(r.depth),
    childCount: Number(r.child_count ?? 0),
    joinedAt: (r.joined_at as string | null) ?? null,
    relation: relationFromRow(r.relation as Record<string, unknown>),
  }
}

// ------------------------------------------------------------------ mock
function mockChildren(id: string) {
  return MOCK_PEOPLE.filter((p) => p.invitedBy === id).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id))
}
/** DEV mock: every other person has a photo-like avatar so the graph's image path is exercised. */
function mockAvatar(id: string): string | null {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  if (h % 2) return null
  const hue = h % 360
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='hsl(${hue},45%,62%)'/><circle cx='32' cy='25' r='12' fill='hsl(${hue},30%,92%)'/><ellipse cx='32' cy='60' rx='22' ry='17' fill='hsl(${hue},30%,92%)'/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
function mockNode(viewer: string, id: string, depth: number | null): GraphNode {
  const p = mockPerson(id)
  return {
    id,
    name: p.name,
    avatarUrl: mockAvatar(id),
    bio: p.bio,
    parentId: p.invitedBy,
    depth,
    childCount: mockChildren(id).length,
    joinedAt: p.joinedAt,
    relation: mockRelation(viewer === 'dev-user-id' ? DEV_ID : viewer, id),
  }
}
export function mockInviteGraph(viewer: string, rootId: string, hops = GRAPH_HOPS, perNode = GRAPH_PER_NODE): GraphPayload {
  const nodes: GraphNode[] = []
  let cur = mockPerson(rootId).invitedBy
  for (let d = -1; cur && d >= -hops; d--) {
    nodes.push(mockNode(viewer, cur, d))
    cur = mockPerson(cur).invitedBy
  }
  const walk = (id: string, depth: number) => {
    nodes.push(mockNode(viewer, id, depth))
    if (depth >= hops) return
    for (const c of mockChildren(id).slice(0, perNode)) walk(c.id, depth + 1)
  }
  walk(rootId, 0)
  return { rootId, perNode, nodes: nodes.slice(0, 400) }
}
export function mockInviteChildren(viewer: string, memberId: string, offset: number, limit: number): ChildrenPage {
  const all = mockChildren(memberId)
  return {
    parentId: memberId,
    total: all.length,
    offset,
    hasMore: offset + limit < all.length,
    nodes: all.slice(offset, offset + limit).map((c) => mockNode(viewer, c.id, null)),
  }
}

// ------------------------------------------------------------------ real
export async function getInviteGraph(viewerId: string, rootId?: string | null): Promise<GraphPayload> {
  if (isMock()) return mockInviteGraph(viewerId, rootId || DEV_ID)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('invite_graph', { p_root: rootId || null, p_hops: GRAPH_HOPS, p_per_node: GRAPH_PER_NODE })
  if (error) throw new Error(error.message)
  const d = data as Record<string, unknown>
  return {
    rootId: String(d.root_id),
    perNode: Number(d.per_node ?? GRAPH_PER_NODE),
    nodes: ((d.nodes || []) as Array<Record<string, unknown>>).map(nodeFromRow),
  }
}

export async function getInviteChildren(viewerId: string, memberId: string, offset = 0, limit = GRAPH_PER_NODE): Promise<ChildrenPage> {
  if (isMock()) return mockInviteChildren(viewerId, memberId, offset, limit)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('invite_children', { p_member: memberId, p_offset: offset, p_limit: limit })
  if (error) throw new Error(error.message)
  const d = data as Record<string, unknown>
  return {
    parentId: String(d.parent_id),
    total: Number(d.total ?? 0),
    offset: Number(d.offset ?? 0),
    hasMore: Boolean(d.has_more),
    nodes: ((d.nodes || []) as Array<Record<string, unknown>>).map(nodeFromRow),
  }
}
