import { MOCK_MEMBERS, MOCK_POSTS, MOCK_SITE_SETTINGS } from '@/lib/mock-data'
import type { Member } from '@/lib/supabase/types'
import { sb, useMockData } from './client'
import { getSiteSettings } from './members'

export async function adminListUsers() {
  if (useMockData()) {
    return MOCK_MEMBERS.filter((m) => m.signup_completed_at).map((m) => ({
      id: m.id,
      name: m.display_name,
      email: m.email,
      posts: MOCK_POSTS.filter((p) => p.author_id === m.id).length,
      isAdmin: m.is_admin,
      isBanned: m.is_banned,
    }))
  }

  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw error
  return (data || []) as Array<{
    id: string
    name: string
    email: string
    posts: number
    isAdmin: boolean
    isBanned: boolean
  }>
}

export async function adminBanUser(id: string, reason?: string) {
  if (useMockData()) {
    return {
      id,
      isBanned: true,
      bannedReason: reason ?? null,
      bannedAt: new Date().toISOString(),
    }
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('members')
    .update({
      is_banned: true,
      banned_reason: reason || null,
      banned_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, is_banned, banned_reason, banned_at')
    .single()

  if (error) throw error
  return {
    id: data.id,
    isBanned: data.is_banned,
    bannedReason: data.banned_reason,
    bannedAt: data.banned_at,
  }
}

export async function adminUnbanUser(id: string) {
  if (useMockData()) {
    return { id, isBanned: false, bannedReason: null, bannedAt: null }
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('members')
    .update({
      is_banned: false,
      banned_reason: null,
      banned_at: null,
    })
    .eq('id', id)
    .select('id, is_banned, banned_reason, banned_at')
    .single()

  if (error) throw error
  return {
    id: data.id,
    isBanned: data.is_banned,
    bannedReason: data.banned_reason,
    bannedAt: data.banned_at,
  }
}

export async function adminListReports() {
  if (useMockData()) {
    return [
      {
        id: 'report-1',
        postTitle: '효과적인 코드 리뷰 프롬프트',
        reporter: '김개발',
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
  if (useMockData()) {
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
    const { error: delErr } = await supabase.from('posts').delete().eq('id', report.post_id)
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

export async function adminGetSettings() {
  if (useMockData()) {
    return {
      siteName: MOCK_SITE_SETTINGS.site_name,
      siteDescription: 'AI 파워유저들을 위한 초대 전용 에셋 공유 커뮤니티',
      inviteRequired: true,
      invitesPerMember: MOCK_SITE_SETTINGS.invites_per_member,
      nicknameUnlockThreshold: MOCK_SITE_SETTINGS.nickname_unlock_threshold,
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
    nicknameUnlockThreshold: settings.nickname_unlock_threshold,
  }
}

export async function adminUpdateSettings(input: {
  siteName?: string
  siteDescription?: string
  inviteRequired?: boolean
  invitesPerMember?: number
  nicknameUnlockThreshold?: number
}) {
  if (useMockData()) {
    return {
      siteName: input.siteName ?? 'AI쓰발',
      siteDescription: input.siteDescription ?? '',
      inviteRequired: input.inviteRequired ?? true,
      invitesPerMember: input.invitesPerMember ?? 2,
      nicknameUnlockThreshold: input.nicknameUnlockThreshold ?? 100,
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
  if (input.nicknameUnlockThreshold !== undefined)
    upserts.push({
      key: 'nickname_unlock_threshold',
      value: String(input.nicknameUnlockThreshold),
    })

  if (upserts.length) {
    const { error } = await supabase.from('site_config').upsert(upserts, { onConflict: 'key' })
    if (error) throw error
  }

  return adminGetSettings()
}

export async function adminSetPostHidden(id: string, hidden: boolean) {
  if (useMockData()) {
    return { id, isHidden: hidden, updatedAt: new Date().toISOString() }
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('posts')
    .update({ is_hidden: hidden })
    .eq('id', id)
    .select('id, is_hidden, updated_at')
    .single()
  if (error) throw error
  return { id: data.id, isHidden: data.is_hidden, updatedAt: data.updated_at }
}

export async function adminDeletePost(id: string) {
  if (useMockData()) return { deletedId: id }

  const supabase = await sb()
  const { error } = await supabase.from('posts').delete().eq('id', id)
  if (error) throw error
  return { deletedId: id }
}

export async function createReport(memberId: string, postId: string, reason: string) {
  if (useMockData()) {
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
