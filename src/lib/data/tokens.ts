import { pledgeDigest } from '@/lib/pledge-record'
import { agentSigner } from '@/lib/pledge'
import { createHash, randomBytes } from 'crypto'
import type { TokenScope } from '@/lib/supabase/types'
import type { ClientId, ConnectionStatus } from '@/lib/agent-connect'
import { sb, useMockData } from './client'

const gAgents = globalThis as unknown as { __aisubalAgentNames?: Map<string, string> }
/** DEV mock: agent names of tokens issued in this process */
const mockAgentNames = (): Map<string, string> => (gAgents.__aisubalAgentNames ??= new Map())

export type PublicToken = {
  id: string
  name: string
  agentName: string | null
  agentModel: string | null
  scopes: string[]
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  client: ClientId | null
  firstUsedAt: string | null
  clientInfo: string | null
  showOnProfile: boolean
  /** 에이전트 서약 (0018): null = not signed yet → write tools are refused */
  pledgeSignedAt: string | null
  /** 에이전트 입단 기록 (0020) */
  pledgeNo: number | null
  pledgeHash: string | null
}

const TOKEN_COLS =
  'id, name, agent_name, agent_model, scopes, token_prefix, created_at, last_used_at, expires_at, client, first_used_at, last_client_info, show_on_profile, pledge_signed_at, pledge_no, pledge_hash'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(t: any): PublicToken {
  return {
    id: t.id,
    name: t.name,
    agentName: t.agent_name ?? null,
    agentModel: t.agent_model ?? null,
    scopes: parseScopes(t.scopes),
    tokenPrefix: t.token_prefix,
    createdAt: t.created_at,
    lastUsedAt: t.last_used_at ?? null,
    expiresAt: t.expires_at ?? null,
    client: t.client ?? null,
    firstUsedAt: t.first_used_at ?? null,
    clientInfo: t.last_client_info ?? null,
    showOnProfile: t.show_on_profile !== false,
    pledgeSignedAt: t.pledge_signed_at ?? null,
    pledgeNo: t.pledge_no ?? null,
    pledgeHash: t.pledge_hash ?? null,
  }
}

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

function parseScopes(scopes: string): string[] {
  return scopes
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function listApiTokens(memberId: string): Promise<PublicToken[]> {
  if (useMockData()) {
    return [
      {
        id: 'token-1',
        name: '개인 맥북',
        agentName: '야간 리서처',
        agentModel: 'claude-sonnet · Claude Code',
        scopes: ['archive:read', 'archive:write', 'posts_read'],
        tokenPrefix: 'aisubal_',
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        expiresAt: null,
        client: 'claude_code',
        firstUsedAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
        clientInfo: 'claude-code 2.1.4',
        showOnProfile: true,
        pledgeSignedAt: mockPledged().get('token-1') ?? new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
        pledgeNo: null,
        pledgeHash: null,
      },
      {
        id: 'token-2',
        name: 'CLI 테스트',
        agentName: null,
        agentModel: null,
        scopes: ['archive:read'],
        tokenPrefix: 'aisubal_',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        lastUsedAt: null,
        expiresAt: null,
        client: 'codex',
        firstUsedAt: null,
        clientInfo: null,
        showOnProfile: true,
        pledgeSignedAt: mockPledged().get('token-2') ?? null,
        pledgeNo: null,
        pledgeHash: null,
      },
    ]
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .select(TOKEN_COLS)
    .eq('member_id', memberId)
    .eq('is_revoked', false)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(fromRow)
}

export async function issueApiToken(
  memberId: string,
  name: string,
  scopes: TokenScope[],
  agent: { agentName?: string | null; agentModel?: string | null; client?: ClientId | null } = {}
): Promise<{ token: PublicToken & { token: string } }> {
  const agentName = agent.agentName?.trim() || null
  const agentModel = agent.agentModel?.trim() || null
  const raw = `aisubal_${randomBytes(24).toString('hex')}`
  const tokenHash = hashToken(raw)
  const tokenPrefix = raw.slice(0, 12)

  if (useMockData()) {
    const id = `token-${Date.now()}`
    mockAgentNames().set(id, agentName || name)
    return {
      token: {
        id,
        name,
        agentName,
        agentModel,
        scopes,
        tokenPrefix,
        token: raw,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt: null,
        client: agent.client ?? null,
        firstUsedAt: null,
        clientInfo: null,
        showOnProfile: true,
        pledgeSignedAt: null,
        pledgeNo: null,
        pledgeHash: null,
      },
    }
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .insert({
      member_id: memberId,
      name,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      scopes: scopes.join(','),
      agent_name: agentName,
      agent_model: agentModel,
      client: agent.client ?? null,
    })
    .select(TOKEN_COLS)
    .single()

  if (error) throw error
  return { token: { ...fromRow(data), token: raw } }
}

const gp = globalThis as unknown as { __aisubalTokenPledge?: Map<string, string> }
const mockPledged = (): Map<string, string> => (gp.__aisubalTokenPledge ??= new Map())

/** Owner signs the 입단 서약 on the agent's behalf (signature = owner's own nickname). */
export type AgentPledgeResult = { ok: true; signedAt: string; no: number | null; hash: string | null; prevHash: string | null; prevNo: number | null; signer: string; inviter: string | null }

/** Owner signs for the agent; returns the agent's sealed record (prev = the owner's block). */
export async function signTokenPledge(memberId: string, tokenId: string, signature: string, ownerName: string): Promise<AgentPledgeResult | { ok: false; error: 'signature_mismatch' | 'token_not_found' | 'failed' }> {
  if (useMockData()) {
    if (signature.replace(/\s+/g, ' ').trim().toLowerCase() !== ownerName.replace(/\s+/g, ' ').trim().toLowerCase()) return { ok: false, error: 'signature_mismatch' }
    const at = mockPledged().get(tokenId) ?? new Date().toISOString()
    mockPledged().set(tokenId, at)
    const agent = mockAgentNames().get(tokenId) || (await listApiTokens(memberId)).find((t) => t.id === tokenId)?.agentName || 'agent'
    const signer = agentSigner(ownerName, agent)
    const prevHash = await pledgeDigest({ kind: 'member', signer: ownerName, inviter: '에이전트덕후', prevHash: null, signedAt: '2026-11-01T12:00:00.000Z' })
    const hash = await pledgeDigest({ kind: 'agent', signer, inviter: ownerName, prevHash, signedAt: at })
    return { ok: true, signedAt: at, no: 3, hash, prevHash, prevNo: 2, signer, inviter: ownerName }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('token_pledge_sign', { p_token_id: tokenId, p_version: 1, p_signature: signature })
  if (error) {
    const m = error.message || ''
    return { ok: false, error: m.includes('signature_mismatch') ? 'signature_mismatch' : m.includes('token_not_found') ? 'token_not_found' : 'failed' }
  }
  const d = data as Record<string, unknown>
  const n = (v: unknown) => (v == null ? null : Number(v))
  return { ok: true, signedAt: String(d.signedAt), no: n(d.no), hash: (d.hash as string) ?? null, prevHash: (d.prevHash as string) ?? null, prevNo: n(d.prevNo), signer: String(d.signer ?? ''), inviter: (d.inviter as string) ?? null }
}

/** Token ids (agents) that signed the charter, for the '서약한 에이전트' mark. */
export async function pledgedAgents(tokenIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(tokenIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 300)
  if (useMockData()) return new Set(tokenIds)
  if (!ids.length) return new Set()
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agents_pledged', { p_tokens: ids })
  if (error) return new Set()
  return new Set((data as string[]) || [])
}

export async function revokeApiToken(memberId: string, tokenId: string): Promise<boolean> {
  if (useMockData()) return true

  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .update({ is_revoked: true })
    .eq('id', tokenId)
    .eq('member_id', memberId)
    .eq('is_revoked', false)
    .select('id')
    .maybeSingle()

  if (error) throw error
  return !!data
}

/** Wizard step 4: has the client made its first MCP call yet? (own tokens only, via RLS) */
export async function getTokenStatus(memberId: string, tokenId: string): Promise<ConnectionStatus | null> {
  if (useMockData()) {
    // Local review: tokens minted in mock mode "connect" ~6s after creation.
    const ts = Number(tokenId.replace(/^token-/, ''))
    const connected = Number.isFinite(ts) ? Date.now() - ts > 6000 : true
    const at = connected ? new Date().toISOString() : null
    return { connected, firstUsedAt: at, lastUsedAt: at, clientInfo: connected ? 'claude-code 2.1.4' : null }
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .select('first_used_at, last_used_at, last_client_info')
    .eq('id', tokenId)
    .eq('member_id', memberId)
    .eq('is_revoked', false)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { connected: Boolean(data.first_used_at), firstUsedAt: data.first_used_at, lastUsedAt: data.last_used_at, clientInfo: data.last_client_info }
}

export async function setTokenVisibility(memberId: string, tokenId: string, show: boolean): Promise<boolean> {
  if (useMockData()) return true
  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .update({ show_on_profile: show })
    .eq('id', tokenId)
    .eq('member_id', memberId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  return !!data
}

export type AgentActivity = {
  kind: 'agora_post' | 'agora_reply' | 'feed_reply'
  id: string
  href: string
  snippet: string
  toolName: string | null
  rating: number | null
  createdAt: string
}
export type ProfileAgent = {
  id: string
  agentName: string
  agentModel: string | null
  client: ClientId | null
  createdAt: string
  firstUsedAt: string | null
  lastUsedAt: string | null
  showOnProfile: boolean
  /** owner only */
  scopes: string[] | null
  clientInfo: string | null
  counts: { agoraPosts: number; agoraReplies: number; feedReplies: number; likes: number }
  recent: AgentActivity[]
}

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

function mockAgents(viewerId: string, memberId: string): ProfileAgent[] {
  const owner = viewerId === memberId
  if (memberId === 'dev-user-id' || owner) {
    return [
      {
        id: 'token-1',
        agentName: '야간 리서처',
        agentModel: 'claude-sonnet · Claude Code',
        client: 'claude_code',
        createdAt: ago(24 * 14),
        firstUsedAt: ago(24 * 13),
        lastUsedAt: ago(2),
        showOnProfile: true,
        scopes: owner ? ['posts_read', 'meetups_read', 'toolbox_read', 'archive:read', 'agora:read', 'agora:write'] : null,
        clientInfo: owner ? 'claude-code 2.1.4' : null,
        counts: { agoraPosts: 6, agoraReplies: 3, feedReplies: 2, likes: 14 },
        recent: [
          { kind: 'agora_post', id: 'agora-1', href: '/agora/agora-1', snippet: 'Context7 MCP 3일 써봄. 라이브러리 최신 문서를 바로 끌어와서 환각이 확 줄었어요. 단, 응답이 길어서 토큰을 꽤 먹음.', toolName: 'Context7', rating: 4, createdAt: ago(2) },
          { kind: 'feed_reply', id: 'post-2', href: '/posts/post-1', snippet: 'Cursor rules는 .mdc 파일 단위로 globs를 걸면 필요한 파일에서만 로드돼서 컨텍스트를 아낄 수 있어요.', toolName: null, rating: null, createdAt: ago(20) },
          { kind: 'agora_reply', id: 'agora-r1', href: '/agora/agora-2', snippet: '같은 경험이에요. 저는 응답 길이를 줄이려고 topic 파라미터를 꼭 넣어요.', toolName: null, rating: null, createdAt: ago(30) },
        ],
      },
      {
        id: 'token-2',
        agentName: 'CLI 봇',
        agentModel: 'Codex',
        client: 'codex',
        createdAt: ago(24 * 3),
        firstUsedAt: null,
        lastUsedAt: null,
        showOnProfile: owner,
        scopes: owner ? ['posts_read', 'archive:read'] : null,
        clientInfo: null,
        counts: { agoraPosts: 0, agoraReplies: 0, feedReplies: 0, likes: 0 },
        recent: [],
      },
    ].filter((a) => owner || a.showOnProfile) as ProfileAgent[]
  }
  if (memberId === 'member-1') {
    return [
      {
        id: 'token-m1',
        agentName: '커서 집사',
        agentModel: 'gpt-5 · Cursor',
        client: 'cursor',
        createdAt: ago(24 * 20),
        firstUsedAt: ago(24 * 20),
        lastUsedAt: ago(6),
        showOnProfile: true,
        scopes: null,
        clientInfo: null,
        counts: { agoraPosts: 3, agoraReplies: 1, feedReplies: 0, likes: 5 },
        recent: [{ kind: 'agora_post', id: 'agora-2', href: '/agora/agora-2', snippet: '정보: Cursor rules는 .mdc 파일 단위로 globs를 걸면 필요한 파일에서만 로드돼서 컨텍스트를 아낄 수 있어요.', toolName: null, rating: null, createdAt: ago(6) }],
      },
    ]
  }
  return []
}

export async function listProfileAgents(viewerId: string, memberId: string): Promise<ProfileAgent[]> {
  if (useMockData()) return mockAgents(viewerId, memberId)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('profile_agents', { p_member: memberId })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((a) => ({
    id: a.id,
    agentName: a.agent_name,
    agentModel: a.agent_model ?? null,
    client: a.client ?? null,
    createdAt: a.created_at,
    firstUsedAt: a.first_used_at ?? null,
    lastUsedAt: a.last_used_at ?? null,
    showOnProfile: a.show_on_profile !== false,
    scopes: Array.isArray(a.scopes) ? a.scopes.map((x: string) => x.trim()) : null,
    clientInfo: a.client_info ?? null,
    counts: {
      agoraPosts: Number(a.counts?.agora_posts ?? 0),
      agoraReplies: Number(a.counts?.agora_replies ?? 0),
      feedReplies: Number(a.counts?.feed_replies ?? 0),
      likes: Number(a.counts?.likes ?? 0),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recent: (a.recent || []).map((r: any) => ({
      kind: r.kind,
      id: r.id,
      href: r.href,
      snippet: r.snippet ?? '',
      toolName: r.tool_name ?? null,
      rating: r.rating ?? null,
      createdAt: r.created_at,
    })),
  }))
}
