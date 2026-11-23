import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifiedUser } from '@/lib/supabase/verified-user'
import type { Member, WaitlistEntry, UserState } from '@/lib/supabase/types'
import { isMock } from '@/lib/data/client'
import { getAnonUnlockFromConfig } from '@/lib/data/members'
import { mockProfileOf } from '@/lib/data/profile'
import { mockAgentInteractionDefault, mockPostVisibilityDefault } from '@/lib/data/agent-interaction-default'

const DEV_MEMBER: Member = {
  id: 'dev-user-id',
  auth_id: 'dev-auth-id',
  email: 'dev@aisubal.local',
  display_name: '개발자',
  handle: 'dev',
  show_real_name: false,
  public_real_name: null,
  profile_completed_at: '2026-10-01T00:00:00Z',
  private_real_name: '김구글',
  private_google_avatar_url: null,
  bio: '로컬 리뷰용 시드 멤버',
  avatar_url: null,
  nickname: 'nightowl',
  nickname_bio: '어둠의 AI 클럽에서 온 별명.',
  nickname_avatar_url: null,
  nickname_created_at: '2026-11-15T00:00:00Z',
  nickname_id: '8b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
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

// Deduped per request: layouts/pages/components can all call this without
// repeating the Supabase auth + member round trips.
export const getUserState = cache(async function getUserState(): Promise<UserState> {
  if (isMock()) {
    const saved = mockProfileOf(DEV_MEMBER.id)
    const dev = { ...DEV_MEMBER, agent_interaction_default: mockAgentInteractionDefault(), post_visibility_default: mockPostVisibilityDefault() }
    return {
      type: 'member',
      member: saved
        ? { ...dev, handle: saved.handle, display_name: saved.displayName, bio: saved.bio, avatar_url: saved.avatarUrl, show_real_name: saved.showRealName, public_real_name: saved.showRealName ? DEV_MEMBER.private_real_name : null }
        : dev,
    }
  }

  const supabase = await createClient()
  const user = await verifiedUser(supabase)

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
        'id, auth_id, display_name, handle, bio, avatar_url, show_real_name, public_real_name, profile_completed_at, is_admin, is_banned, banned_at, invited_by_id, invite_code_used, signup_completed_at, created_at, updated_at'
      )
      .eq('auth_id', user.id)
      .maybeSingle()
    member = fallback
      ? ({ ...fallback, email: user.email || '', nickname: null, nickname_bio: null, nickname_avatar_url: null, nickname_created_at: null } as Member)
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
})

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
  return isMock()
}

/** 익명 라운지 unlock (A42) — reads site_config + active member count when not in mock mode. */
export async function getAnonUnlockState(activeCount?: number) {
  return getAnonUnlockFromConfig(activeCount)
}
