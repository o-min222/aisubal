import { createClient } from '@/lib/supabase/server'
import type { Member, WaitlistEntry, UserState } from '@/lib/supabase/types'
import { useMockData } from '@/lib/data/client'
import { getNicknameUnlockFromConfig } from '@/lib/data/members'

const DEV_MEMBER: Member = {
  id: 'dev-user-id',
  auth_id: 'dev-auth-id',
  email: 'dev@aisubal.local',
  display_name: '개발자',
  bio: '로컬 리뷰용 시드 멤버',
  avatar_url: null,
  nickname: 'nightowl',
  nickname_bio: '어둠의 AI 클럽에서 온 별명.',
  nickname_avatar_url: null,
  nickname_created_at: '2026-11-15T00:00:00Z',
  is_admin: true,
  is_banned: false,
  banned_at: null,
  banned_reason: null,
  invited_by_id: null,
  invite_code_used: null,
  signup_completed_at: new Date('2026-10-01T00:00:00Z').toISOString(),
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-11-15T00:00:00Z',
}

export async function getUserState(): Promise<UserState> {
  if (useMockData()) {
    return { type: 'member', member: DEV_MEMBER }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: 'unauthenticated' }
  }

  // Prefer get_my_member() so email is available after column privilege revoke (0002)
  const { data: myRow, error: myErr } = await supabase.rpc('get_my_member')
  let member = (myRow as Member | null) || null
  if (myErr || !member) {
    const { data: fallback } = await supabase
      .from('members')
      .select(
        'id, auth_id, display_name, bio, avatar_url, nickname, nickname_bio, nickname_avatar_url, nickname_created_at, is_admin, is_banned, banned_at, banned_reason, invited_by_id, invite_code_used, signup_completed_at, created_at, updated_at'
      )
      .eq('auth_id', user.id)
      .maybeSingle()
    member = fallback
      ? ({ ...fallback, email: user.email || '' } as Member)
      : null
  }

  if (member?.signup_completed_at) {
    return { type: 'member', member }
  }

  const { data: waitlistEntry } = await supabase
    .from('waitlist')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (waitlistEntry) {
    return { type: 'waitlist', entry: waitlistEntry as WaitlistEntry }
  }

  // Incomplete member row (from handle_new_user) without waitlist → synthesize waitlist state
  if (member && !member.signup_completed_at) {
    return {
      type: 'waitlist',
      entry: {
        id: member.id,
        auth_id: member.auth_id,
        email: member.email,
        display_name: member.display_name,
        avatar_url: member.avatar_url,
        created_at: member.created_at,
      },
    }
  }

  // Prefer SECURITY DEFINER RPC over service-role insert
  const { error: rpcError } = await supabase.rpc('ensure_waitlist')
  if (rpcError) {
    console.error('ensure_waitlist failed:', rpcError)
    return { type: 'unauthenticated' }
  }

  const { data: ensured } = await supabase
    .from('waitlist')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (ensured) {
    return { type: 'waitlist', entry: ensured as WaitlistEntry }
  }

  return { type: 'unauthenticated' }
}

export async function getMember(): Promise<Member | null> {
  const state = await getUserState()
  if (state.type === 'member') return state.member
  return null
}

export async function requireMember(): Promise<Member> {
  const member = await getMember()
  if (!member) throw new Error('Authentication required')
  return member
}

export async function requireAdmin(): Promise<Member> {
  const member = await requireMember()
  if (!member.is_admin) throw new Error('Admin access required')
  return member
}

export function isDevMode(): boolean {
  return useMockData()
}

/** Nickname unlock — reads site_config + active member count when not in mock mode. */
export async function getNicknameUnlockState(activeCount?: number) {
  return getNicknameUnlockFromConfig(activeCount)
}
