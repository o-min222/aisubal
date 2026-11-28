import { sb, isMock } from './client'
import { getTokenStatus } from './tokens'
import { formatAgentHandle } from '@/lib/agent-handle'
import { mockRecordAgentMention } from './agent-mentions'
import { MCP_CONFIG_VERSION, mcpConfigBehind } from '@/lib/mcp/config-version'
import { listApiTokens } from './tokens'

export type OnboardingTest = {
  mentionId: string
  postId: string
  rootId: string
  url: string
  createdAt: string
  replied: boolean
  replyId: string | null
  replyUrl: string | null
  replyBody: string | null
}

export type OnboardingStatus = {
  connected: boolean
  firstUsedAt: string | null
  lastUsedAt: string | null
  clientInfo: string | null
  mcpConfigVersion?: string | null
  currentVersion?: string | null
  needsUpdate?: boolean
  pendingPrefix?: string | null
  pendingAt?: string | null
  test: OnboardingTest | null
}

type MockTest = OnboardingTest & { tokenId: string; handle: string; ownerId: string }

const g = globalThis as unknown as { __aisubalOnboardTests?: MockTest[] }
const mockTests = () => (g.__aisubalOnboardTests ??= [])

function asStatus(
  row: MockTest | undefined,
  conn: Awaited<ReturnType<typeof getTokenStatus>>,
  extra: { mcpConfigVersion?: string | null; pendingPrefix?: string | null; pendingAt?: string | null } = {},
): OnboardingStatus {
  const lastUsedAt = conn?.lastUsedAt ?? null
  const mcpConfigVersion = extra.mcpConfigVersion ?? null
  return {
    connected: Boolean(conn?.connected),
    firstUsedAt: conn?.firstUsedAt ?? null,
    lastUsedAt,
    clientInfo: conn?.clientInfo ?? null,
    mcpConfigVersion,
    currentVersion: MCP_CONFIG_VERSION,
    needsUpdate: mcpConfigBehind({ version: mcpConfigVersion, lastUsedAt }),
    pendingPrefix: extra.pendingPrefix ?? null,
    pendingAt: extra.pendingAt ?? null,
    test: row
      ? {
          mentionId: row.mentionId,
          postId: row.postId,
          rootId: row.rootId,
          url: row.url,
          createdAt: row.createdAt,
          replied: row.replied,
          replyId: row.replyId,
          replyUrl: row.replyUrl,
          replyBody: row.replyBody,
        }
      : null,
  }
}

export async function getOnboardingStatus(memberId: string, tokenId: string): Promise<OnboardingStatus | null> {
  const conn = await getTokenStatus(memberId, tokenId)
  if (!conn && !isMock()) return null
  if (isMock()) {
    // getTokenStatus always returns a row in mock; treat missing tokens as still ok for issued ids
    const row = mockTests().find((t) => t.tokenId === tokenId && t.ownerId === memberId)
    const listed = (await listApiTokens(memberId)).find((x) => x.id === tokenId)
    return asStatus(row, conn ?? { connected: false, firstUsedAt: null, lastUsedAt: null, clientInfo: null }, {
      mcpConfigVersion: listed?.mcpConfigVersion ?? null,
      pendingPrefix: listed?.pendingPrefix ?? null,
      pendingAt: listed?.pendingAt ?? null,
    })
  }
  if (!conn) return null
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agent_onboarding_status', { p_token_id: tokenId })
  if (error) throw new Error(error.message)
  const d = data as OnboardingStatus
  return { ...d, connected: Boolean(d.connected || conn.connected), firstUsedAt: d.firstUsedAt ?? conn.firstUsedAt, lastUsedAt: d.lastUsedAt ?? conn.lastUsedAt, clientInfo: d.clientInfo ?? conn.clientInfo }
}

export async function startOnboardingTest(
  memberId: string,
  tokenId: string,
  opts: { handle: string; ownerName: string; locale: 'ko' | 'en' }
): Promise<OnboardingStatus> {
  if (isMock()) {
    const open = mockTests().find((t) => t.tokenId === tokenId && t.ownerId === memberId && !t.replied)
    if (open) return (await getOnboardingStatus(memberId, tokenId)) as OnboardingStatus
    const recent = mockTests().filter((t) => t.ownerId === memberId && Date.now() - Date.parse(t.createdAt) < 60 * 60 * 1000)
    if (recent.length >= 10) throw new Error('api_rate_limited')
    const handle = opts.handle
    const id = `onboard-${tokenId}-${Date.now()}`
    const mentionId = `mention-${id}`
    const createdAt = new Date().toISOString()
    const body =
      opts.locale === 'en'
        ? `${formatAgentHandle(handle)} this is a connection test. Reply once under this post with agent_mention_reply.`
        : `${formatAgentHandle(handle)} 연결 테스트예요. agent_mention_reply 로 이 글 아래에 한 줄만 답해 주세요.`
    const gfeed = globalThis as unknown as { __aisubalFeed?: { posts: Array<Record<string, unknown>> } }
    const feed = gfeed.__aisubalFeed
    if (feed) {
      feed.posts.unshift({
        id,
        parentId: null,
        rootId: null,
        author: { kind: 'member', id: memberId, name: opts.ownerName },
        title: null,
        body,
        likeCount: 0,
        likedByMe: false,
        replyCount: 0,
        createdAt,
        visibility: 'private',
        isHidden: true,
        onboardingTest: true,
        agentsAllowed: true,
      })
    }
    mockRecordAgentMention({
      tokenId,
      mentionId,
      kind: 'feed',
      id,
      rootId: id,
      url: `/posts/${id}`,
      actor: { kind: 'member', name: opts.ownerName },
      body,
      createdAt,
    })
    mockTests().unshift({
      tokenId,
      ownerId: memberId,
      handle,
      mentionId,
      postId: id,
      rootId: id,
      url: `/posts/${id}`,
      createdAt,
      replied: false,
      replyId: null,
      replyUrl: null,
      replyBody: null,
    })
    return (await getOnboardingStatus(memberId, tokenId)) as OnboardingStatus
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agent_onboarding_test_start', { p_token_id: tokenId, p_locale: opts.locale })
  if (error) throw new Error(error.message)
  return data as OnboardingStatus
}


export async function cleanupOnboardingTest(memberId: string, tokenId: string): Promise<void> {
  if (isMock()) {
    const ids = new Set(mockTests().filter((t) => t.tokenId === tokenId && t.ownerId === memberId).map((t) => t.postId))
    const left = mockTests().filter((t) => !(t.tokenId === tokenId && t.ownerId === memberId))
    g.__aisubalOnboardTests = left
    const feed = (globalThis as unknown as { __aisubalFeed?: { posts: Array<{ id: string; rootId?: string | null; isDeleted?: boolean; isHidden?: boolean }> } }).__aisubalFeed
    if (feed) {
      for (const p of feed.posts) {
        if (ids.has(p.id) || (p.rootId && ids.has(p.rootId))) {
          p.isDeleted = true
          p.isHidden = true
        }
      }
    }
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('agent_onboarding_test_cleanup', { p_token_id: tokenId })
  if (error) throw new Error(error.message)
}

