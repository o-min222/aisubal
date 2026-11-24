import { MOCK_MEMBERS, MOCK_POSTS, MOCK_SITE_SETTINGS } from '@/lib/mock-data'
import { mockPeekSite } from './landing-peek'
import type { Member } from '@/lib/supabase/types'
import { sb, isMock } from './client'
import { AGENT_CAPS, AGENT_CAP_KEYS, parseAgentCaps, type AgentCaps } from '@/lib/agent-conduct'
import { getSiteSettings } from './members'

export type AdminUserRow = {
  id: string
  /** self-made public name */
  name: string
  handle: string | null
  /** private (Google) data — admin pages only */
  realName: string | null
  email: string | null
  posts: number
  isAdmin: boolean
  isBanned: boolean
}

export async function adminListUsers(): Promise<AdminUserRow[]> {
  if (isMock()) {
    return MOCK_MEMBERS.filter((m) => m.signup_completed_at).map((m) => ({
      id: m.id,
      name: m.display_name,
      handle: m.handle ?? null,
      realName: m.private_real_name ?? null,
      email: m.email ?? null,
      posts: MOCK_POSTS.filter((p) => p.author_id === m.id).length,
      isAdmin: m.is_admin,
      isBanned: m.is_banned,
    }))
  }

  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw error
  return ((data || []) as Array<Partial<AdminUserRow> & { id: string }>).map((u) => ({
    id: u.id,
    name: u.name ?? '멤버',
    handle: u.handle ?? null,
    realName: u.realName ?? null,
    email: u.email ?? null,
    posts: Number(u.posts ?? 0),
    isAdmin: Boolean(u.isAdmin),
    isBanned: Boolean(u.isBanned),
  }))
}

/** Ban/unban goes through the admin-checked SECURITY DEFINER RPC (members has no client UPDATE grant). */
async function setBan(id: string, banned: boolean, reason?: string) {
  if (isMock()) {
    return { id, isBanned: banned, bannedReason: banned ? (reason ?? null) : null, bannedAt: banned ? new Date().toISOString() : null }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_set_ban', { p_member: id, p_banned: banned, p_reason: reason || null })
  if (error) throw error
  const r = data as { id: string; is_banned: boolean; banned_reason: string | null; banned_at: string | null }
  return { id: r.id, isBanned: r.is_banned, bannedReason: r.banned_reason, bannedAt: r.banned_at }
}

export async function adminBanUser(id: string, reason?: string) {
  return setBan(id, true, reason)
}

export async function adminUnbanUser(id: string) {
  return setBan(id, false)
}

export async function adminListReports() {
  if (isMock()) {
    return [
      {
        id: 'report-1',
        postTitle: '효과적인 코드 리뷰 프롬프트',
        reporter: '새벽CTO',
        reason: '중복 게시물',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, reason, created_at, status, post:posts!reports_post_id_fkey(title), reporter:members!reports_reporter_id_fkey(display_name)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map((r) => {
    const post = r.post as { title?: string } | null
    const reporter = r.reporter as { display_name?: string } | null
    return {
      id: r.id,
      postTitle: post?.title || '(삭제된 게시물)',
      reporter: reporter?.display_name || '알 수 없음',
      reason: r.reason,
      createdAt: r.created_at,
    }
  })
}

export async function adminResolveReport(
  reportId: string,
  action: 'ignore' | 'delete',
  adminId: string
) {
  if (isMock()) {
    return {
      id: reportId,
      resolved: true,
      action,
      resolvedAt: new Date().toISOString(),
    }
  }

  const supabase = await sb()
  const { data: report, error: fetchErr } = await supabase
    .from('reports')
    .select('id, post_id')
    .eq('id', reportId)
    .single()
  if (fetchErr) throw fetchErr

  if (action === 'delete') {
    const { error: delErr } = await supabase.rpc('posts__delete', { p_post_id: report.post_id })
    if (delErr) throw delErr
  }

  const { error } = await supabase
    .from('reports')
    .update({
      status: action === 'ignore' ? 'dismissed' : 'resolved',
      resolved_by_id: adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (error) throw error

  return {
    id: reportId,
    resolved: true,
    action,
    resolvedAt: new Date().toISOString(),
  }
}

/** A72/A77: agent reaction caps (site_config, read by agora__config_int in the DB); mock store shared with agent-caps.ts */
export function mockAgentCaps(set?: Partial<AgentCaps>): AgentCaps {
  const g = globalThis as unknown as { __aisubalAgentCaps?: AgentCaps }
  g.__aisubalAgentCaps = { ...(g.__aisubalAgentCaps ?? AGENT_CAPS), ...(set ?? {}) }
  return g.__aisubalAgentCaps
}

export async function adminGetSettings() {
  if (isMock()) {
    return {
      siteName: MOCK_SITE_SETTINGS.site_name,
      siteDescription: 'AI 파워유저들을 위한 초대 전용 에셋 공유 커뮤니티',
      inviteRequired: true,
      invitesPerMember: MOCK_SITE_SETTINGS.invites_per_member,
      anonUnlockThreshold: MOCK_SITE_SETTINGS.anon_unlock_threshold,
      newcomerAlertMax: mockNewcomerMax(),
      landingPeek: mockPeekSite(),
      agentCaps: mockAgentCaps(),
    }
  }

  const settings = await getSiteSettings()
  const supabase = await sb()
  const { data: rows } = await supabase.from('site_config').select('key, value')
  const map = Object.fromEntries((rows || []).map((r: { key: string; value: string }) => [r.key, r.value]))

  return {
    siteName: settings.site_name,
    siteDescription: map.site_description || '',
    inviteRequired: map.invite_required !== 'false',
    invitesPerMember: settings.invites_per_member,
    anonUnlockThreshold: settings.anon_unlock_threshold,
    // A55: first-post alerts go to every admin while completed members <= this (0 = off)
    newcomerAlertMax: map.newcomer_alert_max != null && map.newcomer_alert_max !== '' ? Number(map.newcomer_alert_max) : 100,
    // A64: blurred peek of popular posts on the signed-out landing page (kill switch)
    landingPeek: map.landing_peek !== 'false',
    agentCaps: parseAgentCaps(map),
  }
}

function mockNewcomerMax(set?: number): number {
  const g = globalThis as unknown as { __aisubalNewcomerMax?: number }
  if (set !== undefined) g.__aisubalNewcomerMax = set
  return g.__aisubalNewcomerMax ?? 100
}

export async function adminUpdateSettings(input: {
  siteName?: string
  siteDescription?: string
  inviteRequired?: boolean
  invitesPerMember?: number
  anonUnlockThreshold?: number
  newcomerAlertMax?: number
  landingPeek?: boolean
  agentCaps?: Partial<AgentCaps>
}) {
  if (isMock()) {
    if (input.anonUnlockThreshold !== undefined) MOCK_SITE_SETTINGS.anon_unlock_threshold = input.anonUnlockThreshold
    if (input.newcomerAlertMax !== undefined) mockNewcomerMax(input.newcomerAlertMax)
    if (input.landingPeek !== undefined) mockPeekSite(input.landingPeek)
    if (input.agentCaps) mockAgentCaps(input.agentCaps)
    return {
      siteName: input.siteName ?? 'AI쓰발',
      siteDescription: input.siteDescription ?? '',
      inviteRequired: input.inviteRequired ?? true,
      invitesPerMember: input.invitesPerMember ?? 2,
      anonUnlockThreshold: MOCK_SITE_SETTINGS.anon_unlock_threshold,
      newcomerAlertMax: mockNewcomerMax(),
      landingPeek: mockPeekSite(),
      agentCaps: mockAgentCaps(),
    }
  }

  const supabase = await sb()
  const upserts: { key: string; value: string }[] = []
  if (input.siteName !== undefined) upserts.push({ key: 'site_name', value: input.siteName })
  if (input.siteDescription !== undefined)
    upserts.push({ key: 'site_description', value: input.siteDescription })
  if (input.inviteRequired !== undefined)
    upserts.push({ key: 'invite_required', value: String(input.inviteRequired) })
  if (input.invitesPerMember !== undefined)
    upserts.push({ key: 'invites_per_member', value: String(input.invitesPerMember) })
  if (input.anonUnlockThreshold !== undefined)
    upserts.push({
      key: 'anon_unlock_threshold',
      value: String(input.anonUnlockThreshold),
    })

  if (input.newcomerAlertMax !== undefined) upserts.push({ key: 'newcomer_alert_max', value: String(Math.max(0, Math.floor(input.newcomerAlertMax))) })

  if (input.landingPeek !== undefined) upserts.push({ key: 'landing_peek', value: String(input.landingPeek) })
  for (const [k, v] of Object.entries(input.agentCaps ?? {}) as [keyof AgentCaps, number | undefined][]) {
    if (v !== undefined && AGENT_CAP_KEYS[k]) upserts.push({ key: AGENT_CAP_KEYS[k], value: String(Math.max(0, Math.floor(v))) })
  }

  if (upserts.length) {
    const { error } = await supabase.from('site_config').upsert(upserts, { onConflict: 'key' })
    if (error) throw error
  }

  return adminGetSettings()
}

export async function adminSetPostHidden(id: string, hidden: boolean) {
  if (isMock()) {
    return { id, isHidden: hidden, updatedAt: new Date().toISOString() }
  }

  const supabase = await sb()
  const { data: rows, error } = await supabase.rpc('posts__set_hidden', { p_post_id: id, p_hidden: hidden })
  if (error) throw error
  const data = (rows as Array<{ id: string; is_hidden: boolean; updated_at: string }> | null)?.[0]
  if (!data) throw new Error('post not found')
  return { id: data.id, isHidden: data.is_hidden, updatedAt: data.updated_at }
}

export async function adminDeletePost(id: string) {
  if (isMock()) return { deletedId: id }

  const supabase = await sb()
  const { data, error } = await supabase.rpc('posts__delete', { p_post_id: id })
  if (error) throw error
  if (data !== true) throw new Error('post not found')
  return { deletedId: id }
}

export async function createReport(memberId: string, postId: string, reason: string) {
  if (isMock()) {
    return {
      id: `report-${Date.now()}`,
      postId,
      reason,
      reporterId: memberId,
      createdAt: new Date().toISOString(),
    }
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('reports')
    .insert({
      post_id: postId,
      reporter_id: memberId,
      reason,
    })
    .select('id, post_id, reason, reporter_id, created_at')
    .single()

  if (error) throw error
  return {
    id: data.id,
    postId: data.post_id,
    reason: data.reason,
    reporterId: data.reporter_id,
    createdAt: data.created_at,
  }
}

void (null as unknown as Member)
