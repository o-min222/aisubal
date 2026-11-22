import { createAnonClient } from '@/lib/supabase/anon'
import { normalizeInviteCode, type InvitePreview, type InviteStatus } from '@/lib/invite-share'
import { MOCK_MEMBERS } from '@/lib/mock-data'
import { sb, useMockData } from './client'
import { MEMBER_PUBLIC_COLUMNS } from './member-columns'
import { msg } from '@/i18n/translate'

export type InviteCodeRow = {
  code: string
  isUsed: boolean
  isActive: boolean
  usedBy: { displayName: string } | null
  usedAt: string | null
}

export async function listMyInviteCodes(memberId: string, signupCompleted: boolean) {
  if (useMockData()) {
    return {
      codes: [
        {
          code: 'AXK8M2PQ',
          isUsed: false,
          isActive: signupCompleted,
          usedBy: null,
          usedAt: null,
        },
        {
          code: 'B7NJ4TRW',
          isUsed: true,
          isActive: signupCompleted,
          usedBy: { displayName: '새벽CTO' },
          usedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ] satisfies InviteCodeRow[],
      codesActive: signupCompleted,
    }
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('invite_codes')
    .select('code, used_by_id, used_at, used_by:members!invite_codes_used_by_id_fkey(display_name)')
    .eq('created_by_id', memberId)
    .order('created_at', { ascending: true })

  if (error) throw error

  const codes: InviteCodeRow[] = (data || []).map((row) => {
    const usedBy = row.used_by as { display_name?: string } | null
    return {
      code: row.code,
      isUsed: !!row.used_by_id,
      isActive: signupCompleted,
      usedBy: usedBy?.display_name ? { displayName: usedBy.display_name } : null,
      usedAt: row.used_at,
    }
  })

  return { codes, codesActive: signupCompleted }
}

export async function validateInviteCode(code: string): Promise<{
  valid: boolean
  inviter?: { displayName: string }
  error?: string
}> {
  if (useMockData()) {
    if (code.length !== 8) return { valid: false, error: msg('초대 코드는 8자리입니다.') }
    return { valid: true, inviter: { displayName: '개발자' } }
  }

  const supabase = await sb()
  const { data, error } = await supabase.rpc('validate_invite_code', {
    p_code: code,
  })

  if (error) {
    console.error('validate_invite_code', error)
    return { valid: false, error: msg('유효하지 않은 초대 코드입니다.') }
  }

  const result = data as {
    ok?: boolean
    valid?: boolean
    inviter_display_name?: string
    error?: string
  }

  if (!result?.ok && !result?.valid) {
    return { valid: false, error: result?.error || msg('유효하지 않은 초대 코드입니다.') }
  }

  return {
    valid: true,
    inviter: { displayName: result.inviter_display_name || '멤버' },
  }
}

/**
 * Public invite landing (/i/{code}): status + inviter's self-made name/avatar.
 * Session-less on purpose (anonymous visitors and link crawlers).
 */
export async function getInvitePreview(rawCode: string): Promise<InvitePreview> {
  const code = normalizeInviteCode(rawCode)
  if (!code) return { status: 'invalid', inviter: null }
  if (useMockData()) {
    const inviter = { displayName: '개발자', avatarUrl: null }
    if (code === 'B7NJ4TRW') return { status: 'used', inviter }
    if (code === 'AXK8M2PQ' || code.startsWith('TEST')) return { status: 'valid', inviter }
    return { status: 'invalid', inviter: null }
  }
  const { data, error } = await createAnonClient().rpc('invite_preview', { p_code: code })
  if (error || !data) return { status: 'invalid', inviter: null }
  const r = data as { status?: InviteStatus; inviter?: { display_name?: string; avatar_url?: string | null } | null }
  const status: InviteStatus = r.status === 'valid' || r.status === 'used' || r.status === 'inactive' ? r.status : 'invalid'
  return {
    status,
    inviter: r.inviter?.display_name ? { displayName: r.inviter.display_name, avatarUrl: r.inviter.avatar_url ?? null } : null,
  }
}

/** Admin-only invite tree (emails via SECURITY DEFINER RPC after 0002). */
export async function getInviteTree() {
  if (useMockData()) {
    return {
      id: 'founder',
      displayName: '운영자',
      email: 'founder@example.com',
      joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      isBanned: false,
      invitedCount: 2,
      children: [
        {
          id: 'user-1',
          displayName: '새벽CTO',
          email: 'cto@example.com',
          joinedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          isBanned: false,
          invitedCount: 1,
          children: [
            {
              id: 'user-3',
              displayName: '노코드요정',
              email: 'nocode@example.com',
              joinedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
              isBanned: false,
              invitedCount: 0,
              children: [],
            },
          ],
        },
        {
          id: 'user-2',
          displayName: '픽셀마녀',
          email: 'pixel@example.com',
          joinedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          isBanned: false,
          invitedCount: 0,
          children: [],
        },
      ],
    }
  }

  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_invite_tree')
  if (error) throw error

  type Flat = {
    id: string
    displayName: string
    handle: string | null
    realName: string | null
    email: string | null
    joinedAt: string
    isBanned: boolean
    invitedCount: number
    invitedById: string | null
    depth: number
  }

  type Node = {
    id: string
    displayName: string
    handle: string | null
    realName: string | null
    email: string
    joinedAt: string
    isBanned: boolean
    invitedCount: number
    children: Node[]
  }

  const rows = (data || []) as Flat[]
  const byId = new Map<string, Node>()
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      displayName: r.displayName,
      handle: r.handle ?? null,
      realName: r.realName ?? null,
      email: r.email ?? '',
      joinedAt: r.joinedAt,
      isBanned: r.isBanned,
      invitedCount: r.invitedCount,
      children: [],
    })
  }
  const roots: Node[] = []
  for (const r of rows) {
    const node = byId.get(r.id)!
    if (r.invitedById && byId.has(r.invitedById)) {
      byId.get(r.invitedById)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  // API historically returned a single root; if multiple founders, wrap
  if (roots.length === 1) return roots[0]
  return {
    id: 'root',
    displayName: '커뮤니티',
    handle: null,
    realName: null,
    email: '',
    joinedAt: new Date(0).toISOString(),
    isBanned: false,
    invitedCount: roots.length,
    children: roots,
  }
}
