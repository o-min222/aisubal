import { pledgeDigest } from '@/lib/pledge-record'
import { parseBrand, resolveAgentBrand, type AgentBrand } from '@/lib/agent-brand'
import { agentSigner } from '@/lib/pledge'
import { createHash, randomBytes } from 'crypto'
import type { TokenScope } from '@/lib/supabase/types'
import type { ClientId, ConnectionStatus } from '@/lib/agent-connect'
import { mockOAuthAgents } from './oauth'
import { sb, isMock } from './client'
import { agentHandleBase } from '@/lib/agent-handle'
import { MCP_CONFIG_VERSION } from '@/lib/mcp/config-version'

const gAgents = globalThis as unknown as {
  __aisubalAgentNames?: Map<string, string>
  __aisubalIssuedTokens?: PublicToken[]
  __aisubalIssuedRaw?: Map<string, string>
  __aisubalPendingRaw?: Map<string, string>
}
/** DEV mock: agent names of tokens issued in this process */
const mockAgentNames = (): Map<string, string> => (gAgents.__aisubalAgentNames ??= new Map())
const mockIssuedTokens = (): PublicToken[] => (gAgents.__aisubalIssuedTokens ??= [])
const mockIssuedRaw = (): Map<string, string> => (gAgents.__aisubalIssuedRaw ??= new Map())
const mockPendingRaw = (): Map<string, string> => (gAgents.__aisubalPendingRaw ??= new Map())

/** Map a raw bearer token to the mock agent that minted it (never logs the secret). */
export function mockAgentForToken(raw: string | null | undefined): { id: string; name: string } {
  if (raw) {
    for (const [id, secret] of mockPendingRaw()) {
      if (secret === raw) {
        mockIssuedRaw().set(id, secret)
        mockPendingRaw().delete(id)
        const row = mockIssuedTokens().find((x) => x.id === id)
        if (row) {
          row.tokenPrefix = secret.slice(0, 12)
          row.pendingPrefix = null
          row.pendingAt = null
          row.lastUsedAt = new Date().toISOString()
          row.firstUsedAt = row.firstUsedAt ?? row.lastUsedAt
          row.mcpConfigVersion = MCP_CONFIG_VERSION
        }
        return { id, name: row?.agentName || row?.name || 'AI' }
      }
    }
    for (const [id, secret] of mockIssuedRaw()) {
      if (secret === raw) {
        const row = mockIssuedTokens().find((x) => x.id === id)
        if (row) {
          row.lastUsedAt = new Date().toISOString()
          row.firstUsedAt = row.firstUsedAt ?? row.lastUsedAt
          row.mcpConfigVersion = MCP_CONFIG_VERSION
        }
        return { id, name: row?.agentName || row?.name || 'AI' }
      }
    }
  }
  return { id: 'token-1', name: '야간 리서처' }
}
/** DEV mock: photos saved through the profile editor (agent-profiles.ts keeps the same map) */
const mockPhoto = (id: string): string | null | undefined => (globalThis as unknown as { __aisubalAgentProfiles?: Map<string, { avatarUrl?: string | null }> }).__aisubalAgentProfiles?.get(id)?.avatarUrl

export type PublicToken = {
  id: string
  name: string
  agentName: string | null
  /** 0066: mention handle (@<handle>.ai) */
  agentHandle?: string | null
  agentModel: string | null
  scopes: string[]
  tokenPrefix: string
  /** A66 P4: connected by signing in from the app (OAuth); the app refreshes its own token */
  oauth?: boolean
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
  /** 0050 agent profile */
  agentBio?: string | null
  agentAvatarUrl?: string | null
  /** A69: api_tokens.agent_brand (0122), the one brand mark for this agent */
  brand?: AgentBrand | null
  /** A122: MCP server/config version seen at last call */
  mcpConfigVersion?: string | null
  /** A137: toolsVersion last served on tools/list (null = never listed since the column existed) */
  toolsVersion?: string | null
  /** A122: prefix of a prepared replacement secret (hash is never exposed) */
  pendingPrefix?: string | null
  pendingAt?: string | null
  /** OAuth access expiry; past means the client must refresh or re-authorize */
  accessExpiresAt?: string | null
}

const TOKEN_COLS =
  'id, name, agent_name, agent_handle, agent_model, scopes, token_prefix, created_at, last_used_at, expires_at, client, first_used_at, last_client_info, show_on_profile, pledge_signed_at, pledge_no, pledge_hash, agent_bio, agent_avatar_url, oauth_client_id, agent_brand, mcp_config_version, tools_version, pending_token_prefix, pending_created_at, access_expires_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(t: any): PublicToken {
  return {
    id: t.id,
    name: t.name,
    agentName: t.agent_name ?? null,
    agentHandle: t.agent_handle ?? null,
    agentModel: t.agent_model ?? null,
    scopes: parseScopes(t.scopes),
    tokenPrefix: t.token_prefix,
    oauth: Boolean(t.oauth_client_id),
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
    agentBio: t.agent_bio ?? null,
    agentAvatarUrl: t.agent_avatar_url ?? null,
    brand: parseBrand(t.agent_brand),
    mcpConfigVersion: t.mcp_config_version ?? null,
    toolsVersion: t.tools_version ?? null,
    pendingPrefix: t.pending_token_prefix ?? null,
    pendingAt: t.pending_created_at ?? null,
    accessExpiresAt: t.access_expires_at ?? null,
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

/** DEV mock: agents deleted in this process (so 삭제 visibly removes them in local review). */
const mockDeletedAgents = ((globalThis as unknown as { __aisubalDeletedAgents?: Set<string> }).__aisubalDeletedAgents ??= new Set<string>())

export async function listApiTokens(memberId: string): Promise<PublicToken[]> {
  if (isMock()) {
    return ([
      ...mockIssuedTokens().map((row) => ({ ...row, pledgeSignedAt: mockPledged().get(row.id) ?? row.pledgeSignedAt })),
      {
        id: 'token-1',
        name: '개인 맥북',
        agentName: '야간 리서처',
        agentHandle: '야간_리서처',
        agentModel: 'claude-sonnet · Claude Code',
        scopes: ['archive:read', 'archive:write', 'posts_read', 'feed:interact', 'agora:write'],
        tokenPrefix: 'aisubal_',
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        toolsVersion: 'stale-catalog',
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
      ...mockOAuthAgents().map((a) => ({
        id: a.id, name: a.name, agentName: a.name, agentModel: null, scopes: a.scopes, tokenPrefix: 'aisubal_', oauth: true,
        createdAt: new Date().toISOString(), lastUsedAt: null, expiresAt: null, client: null, firstUsedAt: null, clientInfo: null,
        showOnProfile: true, pledgeSignedAt: mockPledged().get(a.id) ?? null, pledgeNo: null, pledgeHash: null,
        oauthClientName: a.oauthClientName,
      })),
    ] as Array<PublicToken & { oauthClientName?: string | null }>).filter((t) => !mockDeletedAgents.has(t.id)).map(({ oauthClientName, ...t }) => ({ ...t, agentAvatarUrl: mockPhoto(t.id) ?? t.agentAvatarUrl ?? null, brand: resolveAgentBrand({ model: t.agentModel, client: t.client, oauthClientName, clientInfo: t.clientInfo }) }))
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

  if (isMock()) {
    const id = `token-${Date.now()}`
    const agentHandle = agentName ? agentHandleBase(agentName) : null
    mockAgentNames().set(id, agentName || name)
    const row: PublicToken = {
      id,
      name,
      agentName,
      agentHandle,
      agentModel,
      scopes,
      tokenPrefix,
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
    }
    mockIssuedTokens().unshift(row)
    mockIssuedRaw().set(id, raw)
    return { token: { ...row, token: raw } }
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
      show_on_profile: true, // AI-6 (t293u): public by default (was P-3 opt-in); the owner can hide it in 내 에이전트
    })
    .select(TOKEN_COLS)
    .single()

  if (error) throw error
  return { token: { ...fromRow(data), token: raw } }
}

const gp = globalThis as unknown as { __aisubalTokenPledge?: Map<string, string> }
const mockPledged = (): Map<string, string> => (gp.__aisubalTokenPledge ??= new Map())

/** Owner signs the 입단 서약 on the agent's behalf (signature = owner's own nickname). */
type AgentPledgeResult = { ok: true; signedAt: string; no: number | null; hash: string | null; prevHash: string | null; prevNo: number | null; signer: string; inviter: string | null }

/** Owner signs for the agent; returns the agent's sealed record (prev = the owner's block). */
export async function signTokenPledge(memberId: string, tokenId: string, signature: string, ownerName: string): Promise<AgentPledgeResult | { ok: false; error: 'signature_mismatch' | 'token_not_found' | 'failed' }> {
  if (isMock()) {
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

/**
 * AI-6 (t292u) 삭제: soft delete in one RPC (0119 agent_delete) — token revoked, hidden from profiles,
 * OAuth refresh tokens and pending codes dead, webhook off. Posts keep their author. Owner only.
 */
export async function deleteAgent(memberId: string, tokenId: string): Promise<boolean> {
  if (isMock()) {
    if (mockDeletedAgents.has(tokenId)) return false
    mockDeletedAgents.add(tokenId)
    return true
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agent_delete', { p_token_id: tokenId })
  if (error) throw error
  return data === true
}

/** Wizard step 4: has the client made its first MCP call yet? (own tokens only, via RLS) */
export async function getTokenStatus(memberId: string, tokenId: string): Promise<ConnectionStatus | null> {
  if (isMock()) {
    const issued = mockIssuedTokens().find((x) => x.id === tokenId)
    if (issued) {
      const ts = Number(tokenId.replace(/^token-/, ''))
      const connected = Number.isFinite(ts) && Date.now() - ts > 6000
      const at = connected ? new Date().toISOString() : null
      return { connected, firstUsedAt: at, lastUsedAt: at, clientInfo: connected ? 'claude-code 2.1.4' : null }
    }
    const listed = (await listApiTokens(memberId)).find((x) => x.id === tokenId)
    if (!listed) return null
    const connected = Boolean(listed.firstUsedAt || listed.lastUsedAt)
    return { connected, firstUsedAt: listed.firstUsedAt, lastUsedAt: listed.lastUsedAt, clientInfo: listed.clientInfo }
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
  if (isMock()) return true
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

/** 내 에이전트 › 이름 바꾸기 (owner only). 0076 rewrites the name on every post, like and notification of this agent. */
export async function renameToken(memberId: string, tokenId: string, agentName: string): Promise<boolean> {
  if (isMock()) return true
  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .update({ agent_name: agentName })
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
  avatarUrl?: string | null
  /** A69: api_tokens.agent_brand */
  brand?: AgentBrand | null
  bio?: string | null
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
  if (isMock()) return mockAgents(viewerId, memberId).map((a) => ({ ...a, avatarUrl: mockPhoto(a.id) ?? a.avatarUrl ?? null, brand: resolveAgentBrand({ model: a.agentModel, client: a.client, clientInfo: a.clientInfo }) }))
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
    avatarUrl: a.avatar_url ?? null,
    brand: parseBrand(a.brand),
    bio: a.bio ?? null,
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

/**
 * 토큰 재발급 (0145): prepare a fresh secret for the same agent row.
 * The current secret stays valid until the new one is used, or the owner confirms (commitRotateApiToken).
 */
export async function rotateApiToken(tokenId: string): Promise<{ token: string; preparedAt: string; pending: true; forced: boolean }> {
  const raw = `aisubal_${randomBytes(24).toString('hex')}`
  const at = new Date().toISOString()
  if (isMock()) {
    mockPendingRaw().set(tokenId, raw)
    const row = mockIssuedTokens().find((x) => x.id === tokenId)
    if (row) {
      row.pendingPrefix = raw.slice(0, 12)
      row.pendingAt = at
    }
    return { token: raw, preparedAt: at, pending: true, forced: false }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('api_token_rotate', { p_token: tokenId, p_hash: hashToken(raw), p_prefix: raw.slice(0, 12) })
  if (error) throw new Error(error.message)
  const d = data as { prepared_at: string; forced: boolean }
  return { token: raw, preparedAt: d.prepared_at, pending: true, forced: Boolean(d.forced) }
}

/** Promote a prepared secret now and retire the previous one. */
export async function commitRotateApiToken(tokenId: string): Promise<{ rotatedAt: string }> {
  const at = new Date().toISOString()
  if (isMock()) {
    const pending = mockPendingRaw().get(tokenId)
    if (!pending) throw new Error('rotate_not_pending')
    mockIssuedRaw().set(tokenId, pending)
    mockPendingRaw().delete(tokenId)
    const row = mockIssuedTokens().find((x) => x.id === tokenId)
    if (row) {
      row.tokenPrefix = pending.slice(0, 12)
      row.pendingPrefix = null
      row.pendingAt = null
    }
    return { rotatedAt: at }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('api_token_rotate_commit', { p_token: tokenId })
  if (error) throw new Error(error.message)
  const d = data as { rotated_at: string }
  return { rotatedAt: d.rotated_at }
}

/** Drop a prepared secret; the current one keeps working. */
export async function cancelRotateApiToken(tokenId: string): Promise<void> {
  if (isMock()) {
    mockPendingRaw().delete(tokenId)
    const row = mockIssuedTokens().find((x) => x.id === tokenId)
    if (row) {
      row.pendingPrefix = null
      row.pendingAt = null
    }
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('api_token_rotate_cancel', { p_token: tokenId })
  if (error) throw new Error(error.message)
}
