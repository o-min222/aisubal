import { createAnonClient } from '@/lib/supabase/anon'
import { normalizeInviteCode, type InvitePreview, type InviteStatus } from '@/lib/invite-share'
import { sb, isMock } from './client'
import { msg } from '@/i18n/translate'
import { batchProgress, needsRefill, sortByBatch, type BatchProgress } from '@/lib/invite-batch'
import { getSiteSettings } from './members'

export type InviteCodeRow = {
  code: string
  isUsed: boolean
  isActive: boolean
  usedBy: { displayName: string } | null
  usedAt: string | null
  /** 0085 batch: the next N codes arrive once every code of the current batch has joined */
  batch: number
}

type MyInvites = { codes: InviteCodeRow[]; codesActive: boolean; allowance: number; progress: BatchProgress }

function mockCodes(active: boolean, allowance: number): InviteCodeRow[] {
  // batch 1 fully joined (already refilled), batch 2 with two joined
  const ago = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()
  const names = ['새벽CTO', '프롬프트장인', '코드요정', '데이터곰', '모델러', '야간빌더', '에이전트러']
  const g = globalThis as unknown as { __mockInvites?: Record<number, InviteCodeRow[]> }
  g.__mockInvites ??= {}
  g.__mockInvites[allowance] ??= [
    ...Array.from({ length: allowance }, (_, i) => ({ code: `AX${i}K8M2P`.slice(0, 8), isUsed: i < 2, isActive: true, usedBy: i < 2 ? { displayName: names[i] } : null, usedAt: i < 2 ? ago(i + 1) : null, batch: 2 })),
    ...Array.from({ length: allowance }, (_, i) => ({ code: `F${i}MXA2VT`.slice(0, 8), isUsed: true, isActive: true, usedBy: { displayName: names[(i + 2) % names.length] }, usedAt: ago(10 + i), batch: 1 })),
  ]
  return g.__mockInvites[allowance].map((c) => ({ ...c, isActive: active }))
}

export async function listMyInviteCodes(memberId: string, signupCompleted: boolean): Promise<MyInvites> {
  const allowance = (await getSiteSettings()).invites_per_member
  if (isMock()) {
    const codes = mockCodes(signupCompleted, allowance)
    return { codes: sortByBatch(codes), codesActive: signupCompleted, allowance, progress: batchProgress(codes, allowance) }
  }

  const supabase = await sb()
  const load = () =>
    supabase
      .from('invite_codes')
      .select('code, used_by_id, used_at, batch, used_by:members!invite_codes_used_by_id_fkey(display_name)')
      .eq('created_by_id', memberId)
      .order('created_at', { ascending: true })
  let { data, error } = await load()
  if (error) throw error

  // the database refills in the redeem path (0085); this only tops up a short batch or heals a missed refill
  const toBatch = (rows: NonNullable<typeof data>) => rows.map((r) => ({ batch: Number(r.batch) || 1, isUsed: !!r.used_by_id }))
  if (signupCompleted && needsRefill(toBatch(data || []), allowance)) {
    const { data: n, error: renewError } = await supabase.rpc('invites__renew_mine')
    if (renewError) console.error('invites__renew_mine', renewError)
    else if (Number(n) > 0) ({ data, error } = await load())
    if (error) throw error
  }

  const codes: InviteCodeRow[] = (data || []).map((row) => {
    const usedBy = row.used_by as { display_name?: string } | null
    return {
      code: row.code,
      isUsed: !!row.used_by_id,
      isActive: signupCompleted,
      usedBy: usedBy?.display_name ? { displayName: usedBy.display_name } : null,
      usedAt: row.used_at,
      batch: Number(row.batch) || 1,
    }
  })

  return { codes: sortByBatch(codes), codesActive: signupCompleted, allowance, progress: batchProgress(codes, allowance) }
}

export async function validateInviteCode(code: string): Promise<{
  valid: boolean
  inviter?: { displayName: string }
  error?: string
}> {
  if (isMock()) {
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
  if (isMock()) {
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
  if (isMock()) {
    // A132: include the names that used to wrap mid-word on a 390px admin tree
    // (제니나이, 조이리) plus a handle-less '새 멤버' so local shots cover the fix.
    return {
      id: 'founder',
      displayName: '0mins',
      handle: '0mins',
      realName: 'YoungMin Song',
      email: 'dudals2014@example.com',
      joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      isBanned: false,
      invitedCount: 9,
      children: [
        {
          id: 'user-1',
          displayName: '새벽CTO',
          handle: 'dawn',
          realName: '김새벽',
          email: 'cto@example.com',
          joinedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          isBanned: false,
          invitedCount: 4,
          children: [
            {
              id: 'user-3',
              displayName: '노코드요정',
              handle: 'nocode',
              realName: '이노코',
              email: 'nocode@example.com',
              joinedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
              isBanned: false,
              invitedCount: 0,
              children: [],
            },
            {
              id: 'user-jenny',
              displayName: '제니나이',
              handle: 'jennyage',
              realName: '김제니',
              email: 'jenny.very.long.address@example.com',
              joinedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
              isBanned: false,
              invitedCount: 0,
              children: [],
            },
            {
              id: 'user-joie',
              displayName: '조이리',
              handle: 'joie',
              realName: '이조이',
              email: 'joie@example.com',
              joinedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              isBanned: false,
              invitedCount: 0,
              children: [],
            },
            {
              id: 'user-younseul',
              displayName: '새 멤버',
              handle: null,
              realName: '윤슬',
              email: 'younseul@example.com',
              joinedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              isBanned: false,
              invitedCount: 0,
              children: [],
            },
          ],
        },
        {
          id: 'user-2',
          displayName: '픽셀마녀',
          handle: 'pixel',
          realName: '박픽셀',
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
