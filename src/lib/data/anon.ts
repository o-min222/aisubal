import type { TimelinePost } from '@/components/timeline/types'
import {
  ANON_MAX_CHARS,
  anonRowToTimeline,
  pickAlias,
  type AnonCategory,
  type AnonRow,
  type AnonSort,
} from '@/lib/anon-rules'
import { sb, useMockData as isMock } from './client'

/**
 * 익명 board data access. Production goes exclusively through the anon_* RPCs
 * (session-bound, SECURITY DEFINER): the app never sees who wrote what.
 * `viewerId` is only used by the DEV mock store.
 */

export type AnonThread = { root: TimelinePost; replies: TimelinePost[] }
export type AnonTrace = {
  memberId: string
  displayName: string
  isBanned: boolean
  anonPostsLast30d: number
  hiddenPosts: number
}
export type AnonLogEntry = { id: number; postId: string | null; action: string; reason: string | null; createdAt: string; admin: string | null }

class AnonRpcError extends Error {}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await sb()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new AnonRpcError(error.message)
  return data as T
}

// ------------------------------------------------------------------ mock (DEV)
type MockPost = Omit<AnonRow, 'likedByMe' | 'isMine' | 'reportedByMe'> & { author: string }
type MockState = {
  posts: MockPost[]
  aliases: Map<string, Map<string, string>> // root → member → alias
  likes: Map<string, Set<string>>
  reports: Map<string, Map<string, string>>
  log: AnonLogEntry[]
}
const g = globalThis as unknown as { __aisubalAnon?: MockState }
export const MOCK_ANON_THRESHOLD = 5
const DEV_VIEWER = 'dev-user-id' // matches the DEV_BYPASS member in lib/auth

function mock(): MockState {
  if (g.__aisubalAnon) return g.__aisubalAnon
  const s: MockState = { posts: [], aliases: new Map(), likes: new Map(), reports: new Map(), log: [] }
  g.__aisubalAnon = s
  const seed: [string, AnonCategory, string, number][] = [
    ['member-2', 'work', '팀장이 회의 때마다 "AI로 하면 금방이잖아"라고 하는데, 정작 검수 시간은 일정에 안 넣어줘요. 다들 이거 어떻게 설득하시나요?', 40],
    ['member-3', 'ai', '사내 보안 정책 때문에 코딩 에이전트를 못 쓰게 됐습니다. 로컬 모델로 버티는 분들 있나요… 체감 생산성 반토막 났어요.', 95],
    [DEV_VIEWER, 'career', '3년차 백엔드인데 요즘 채용 공고에 "LLM 경험 우대"가 거의 다 붙어요. 사이드 프로젝트로 RAG 하나 만드는 걸로 충분할까요?', 180],
    ['member-4', 'chat', '점심 먹고 프롬프트 다듬다가 30분 날렸다. 결국 처음 버전이 제일 나았음 ㅋㅋ', 300],
    ['member-2', 'worry', '번아웃인지 그냥 AI 툴 피로인지 모르겠어요. 새 툴 나올 때마다 따라가야 한다는 압박이 큽니다.', 520],
  ]
  const now = Date.now()
  for (const [author, category, body, minsAgo] of seed) {
    mockCreate(author, { body, category, parentId: null }, new Date(now - minsAgo * 60_000))
  }
  const [p0, p1] = [s.posts[0], s.posts[1]]
  const r1 = mockCreate('member-3', { body: '검수 시간을 별도 티켓으로 쪼개서 보이게 만드니까 조금 나아졌어요.', category: null, parentId: p0.id }, new Date(now - 35 * 60_000))
  const r2 = mockCreate('member-2', { body: '오 티켓 분리 좋네요. 바로 해볼게요!', category: null, parentId: r1.id }, new Date(now - 30 * 60_000))
  mockCreate('member-4', { body: '티켓 단위로 쪼개면 리뷰어 지정도 쉬워져요.', category: null, parentId: r2.id }, new Date(now - 28 * 60_000))
  mockCreate(DEV_VIEWER, { body: '저도 다음 스프린트부터 해볼게요.', category: null, parentId: r1.id }, new Date(now - 25 * 60_000))
  mockCreate(DEV_VIEWER, { body: '저희는 "AI 초안 + 사람 리뷰" 단계를 일정표에 명시했어요.', category: null, parentId: p0.id }, new Date(now - 20 * 60_000))
  mockCreate('member-4', { body: '로컬은 Qwen 계열로 버티는 중… 그래도 리뷰 보조로는 쓸만해요.', category: null, parentId: p1.id }, new Date(now - 60 * 60_000))
  for (const [pid, who] of [[p0.id, DEV_VIEWER], [p0.id, 'member-4'], [p0.id, 'member-3'], [p1.id, 'member-2'], [r1.id, 'member-2']]) {
    mockLike(pid, who, false)
  }
  return s
}

function view(p: MockPost, viewer: string): AnonRow {
  const s = mock()
  const { author, ...rest } = p
  return {
    ...rest,
    body: p.isDeleted || p.isHidden ? '' : p.body,
    likedByMe: s.likes.get(p.id)?.has(viewer) ?? false,
    isMine: author === viewer,
    reportedByMe: s.reports.get(p.id)?.has(viewer) ?? false,
  }
}

function mockCreate(author: string, input: { body: string; category: AnonCategory | null; parentId: string | null }, at = new Date()) {
  const s = g.__aisubalAnon!
  const parent = input.parentId ? s.posts.find((p) => p.id === input.parentId) : null
  if (input.parentId && (!parent || parent.isHidden || parent.isDeleted)) throw new AnonRpcError('anon_not_found')
  const id = `anon-${s.posts.length + 1}-${Math.random().toString(36).slice(2, 7)}`
  const rootId = parent ? parent.rootId ?? parent.id : id
  const root = parent ? s.posts.find((p) => p.id === rootId)! : null
  let threadAliases = s.aliases.get(rootId)
  if (!threadAliases) s.aliases.set(rootId, (threadAliases = new Map()))
  let alias = threadAliases.get(author)
  if (!alias) {
    alias = pickAlias(threadAliases.values())
    threadAliases.set(author, alias)
  }
  // same two-level rule as the DB trigger (0029): a reply to a reply joins its comment
  const parentIsReply = Boolean(parent && parent.parentId && parent.parentId !== rootId)
  const post: MockPost = {
    id,
    parentId: parent ? (parentIsReply ? parent.parentId : parent.id) : null,
    replyToId: parent && parent.parentId ? parent.id : null,
    rootId: parent ? rootId : null,
    category: root ? root.category : input.category!,
    body: input.body.slice(0, ANON_MAX_CHARS),
    alias,
    isOp: root ? root.author === author : true,
    likeCount: 0,
    replyCount: 0,
    isHidden: false,
    isDeleted: false,
    createdAt: at.toISOString(),
    author,
    reportCount: 0,
    hiddenReason: null,
    adminCleared: false,
  }
  s.posts.push(post)
  if (parent) {
    const comment = parentIsReply ? s.posts.find((p) => p.id === post.parentId) : parent
    if (comment) comment.replyCount++
    if (root && root.id !== comment?.id) root.replyCount++
  }
  return post
}

function mockLike(id: string, viewer: string, unlike: boolean) {
  const s = g.__aisubalAnon!
  const p = s.posts.find((x) => x.id === id)
  if (!p || p.isHidden || p.isDeleted) throw new AnonRpcError('anon_not_found')
  if (!unlike && p.author === viewer) throw new AnonRpcError('self_like')
  const set = s.likes.get(id) ?? new Set<string>()
  s.likes.set(id, set)
  if (unlike) set.delete(viewer)
  else set.add(viewer)
  p.likeCount = set.size
  return p.likeCount
}

/** Test hook: reset the DEV store. */
export function __resetAnonMock() {
  g.__aisubalAnon = undefined
}

// ------------------------------------------------------------------ public API
export async function listAnon(
  viewerId: string,
  opts: { category?: AnonCategory | null; sort?: AnonSort; before?: string; offset?: number; limit?: number } = {},
): Promise<TimelinePost[]> {
  const limit = opts.limit ?? 30
  if (isMock()) {
    let rows = mock().posts.filter((p) => !p.parentId && !p.isHidden && !p.isDeleted)
    if (opts.category) rows = rows.filter((p) => p.category === opts.category)
    if (opts.sort === 'popular') {
      rows = [...rows].sort((a, b) => b.likeCount * 2 + b.replyCount - (a.likeCount * 2 + a.replyCount) || b.createdAt.localeCompare(a.createdAt))
    } else {
      rows = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      if (opts.before) rows = rows.filter((p) => p.createdAt < opts.before!)
    }
    rows = rows.slice(opts.offset ?? 0)
    return rows.slice(0, limit).map((p) => anonRowToTimeline(view(p, viewerId)))
  }
  const rows = await rpc<AnonRow[]>('anon_list', {
    p_category: opts.category ?? null,
    p_sort: opts.sort ?? 'latest',
    p_before: opts.before ?? null,
    p_offset: opts.offset ?? 0,
    p_limit: limit,
  })
  return (rows || []).map(anonRowToTimeline)
}

export async function getAnonThread(id: string, viewerId: string): Promise<AnonThread | null> {
  if (isMock()) {
    const s = mock()
    const p = s.posts.find((x) => x.id === id)
    const root = p ? s.posts.find((x) => x.id === (p.rootId ?? p.id)) : null
    if (!root || root.isHidden) return null
    return {
      root: anonRowToTimeline(view(root, viewerId)),
      replies: s.posts
        .filter((x) => x.rootId === root.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((x) => anonRowToTimeline(view(x, viewerId))),
    }
  }
  try {
    const t = await rpc<{ root: AnonRow; replies: AnonRow[] }>('anon_thread', { p_id: id })
    return { root: anonRowToTimeline(t.root), replies: (t.replies || []).map(anonRowToTimeline) }
  } catch (e) {
    if (e instanceof Error && e.message.includes('anon_not_found')) return null
    throw e
  }
}

export async function createAnon(
  viewerId: string,
  input: { body: string; category: AnonCategory | null; parentId: string | null },
): Promise<{ id: string; rootId: string; alias: string }> {
  if (isMock()) {
    mock()
    const p = mockCreate(viewerId, input)
    return { id: p.id, rootId: p.rootId ?? p.id, alias: p.alias }
  }
  return rpc('anon_create', { p_body: input.body, p_category: input.category, p_parent_id: input.parentId })
}

export async function likeAnon(id: string, viewerId: string, like: boolean): Promise<number> {
  if (isMock()) {
    mock()
    return mockLike(id, viewerId, !like)
  }
  const r = await rpc<{ likeCount: number }>('anon_like', { p_id: id, p_unlike: !like })
  return r.likeCount
}

/** Count only — likers are never identified on the 익명 board. */
export async function anonLikerCount(id: string, viewerId: string): Promise<{ count: number; likedByMe: boolean }> {
  if (isMock()) {
    const set = mock().likes.get(id)
    return { count: set?.size ?? 0, likedByMe: set?.has(viewerId) ?? false }
  }
  return rpc('anon_likers', { p_id: id })
}

export async function reportAnon(id: string, viewerId: string, reason: string): Promise<{ reported: boolean; hidden: boolean }> {
  if (isMock()) {
    const s = mock()
    const p = s.posts.find((x) => x.id === id)
    if (!p || p.isDeleted) throw new AnonRpcError('anon_not_found')
    if (p.author === viewerId) throw new AnonRpcError('anon_report_own')
    const m = s.reports.get(id) ?? new Map<string, string>()
    s.reports.set(id, m)
    m.set(viewerId, reason)
    p.reportCount = m.size
    if (m.size >= MOCK_ANON_THRESHOLD && !p.isHidden && !p.adminCleared) {
      p.isHidden = true
      p.hiddenReason = 'reports'
      s.log.unshift({ id: s.log.length + 1, postId: id, action: 'auto_hide', reason: `${m.size} reports`, createdAt: new Date().toISOString(), admin: null })
    }
    return { reported: true, hidden: p.isHidden }
  }
  return rpc('anon_report', { p_id: id, p_reason: reason })
}

export async function deleteAnon(id: string, viewerId: string): Promise<{ deleted: boolean; tombstone: boolean }> {
  if (isMock()) {
    const s = mock()
    const p = s.posts.find((x) => x.id === id)
    if (!p || p.author !== viewerId) throw new AnonRpcError('anon_not_found')
    if (s.posts.some((x) => x.parentId === id)) {
      p.isDeleted = true
      p.body = ''
      return { deleted: true, tombstone: true }
    }
    s.posts = s.posts.filter((x) => x.id !== id)
    return { deleted: true, tombstone: false }
  }
  return rpc('anon_delete', { p_id: id })
}

// ------------------------------------------------------------------ admin
export type AnonAdminFilter = 'hidden' | 'reported' | 'all'

export async function adminListAnon(viewerId: string, filter: AnonAdminFilter): Promise<AnonRow[]> {
  if (isMock()) {
    const s = mock()
    return s.posts
      .filter((p) => (filter === 'hidden' ? p.isHidden : filter === 'reported' ? (p.reportCount ?? 0) > 0 : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({ ...view(p, viewerId), body: p.body, reportReasons: [...(s.reports.get(p.id)?.values() ?? [])] }))
  }
  return (await rpc<AnonRow[]>('anon_admin_list', { p_filter: filter, p_limit: 100 })) || []
}

export async function adminSetHidden(id: string, hidden: boolean): Promise<void> {
  if (isMock()) {
    const p = mock().posts.find((x) => x.id === id)
    if (!p) throw new AnonRpcError('anon_not_found')
    p.isHidden = hidden
    p.hiddenReason = hidden ? 'admin' : null
    if (!hidden) p.adminCleared = true
    return
  }
  await rpc('anon_admin_set_hidden', { p_id: id, p_hidden: hidden })
}

export async function adminDeleteAnon(id: string, reason: string | null): Promise<void> {
  if (isMock()) {
    const s = mock()
    s.posts = s.posts.filter((x) => x.id !== id && x.rootId !== id)
    return
  }
  await rpc('anon_admin_delete', { p_id: id, p_reason: reason })
}

export async function adminTraceAnon(id: string, reason: string): Promise<AnonTrace> {
  if (isMock()) {
    const p = mock().posts.find((x) => x.id === id)
    if (!p) throw new AnonRpcError('anon_not_found')
    return { memberId: p.author, displayName: p.author, isBanned: false, anonPostsLast30d: 1, hiddenPosts: p.isHidden ? 1 : 0 }
  }
  return rpc('anon_admin_trace', { p_id: id, p_reason: reason })
}

export async function adminAnonLog(): Promise<AnonLogEntry[]> {
  if (isMock()) return mock().log
  return (await rpc<AnonLogEntry[]>('anon_admin_log', { p_limit: 50 })) || []
}
