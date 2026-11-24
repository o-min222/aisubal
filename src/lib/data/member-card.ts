import { networkHref } from '@/lib/dashboard-tabs'
import type { Member } from '@/lib/supabase/types'
import type { Relation } from '@/lib/social-rules'
import { getMemberById } from './members'
import { getProfileStats } from './shell'
import { getSocialSummary } from './social'
import { getProfileStack, type ProfileStack } from './profile-stack'

/**
 * Data for the unified MemberCard (left '내 프로필 카드' and other members'
 * popover). Real-name identity only: never the 부캐 nickname of others.
 */
/** sub: a small second link under the number (e.g. 남은 초대 → 초대 네트워크) */
export type MemberCardStat = { label: string; value: number | null; href?: string; sub?: { label: string; href: string } }
export type MemberCardData = {
  id: string
  displayName: string
  handle: string | null
  avatarUrl: string | null
  bio: string | null
  /** owner only */
  nickname: string | null
  isMe: boolean
  relation: Relation | null
  stats: MemberCardStat[]
  stack: ProfileStack | null
}

export async function getMemberCard(viewer: Member, memberId: string): Promise<MemberCardData | null> {
  const isMe = memberId === viewer.id
  const member = isMe ? viewer : await getMemberById(memberId)
  if (!member || !member.signup_completed_at) return null
  const [stack, social, own] = await Promise.all([
    getProfileStack(viewer.id, member.id).catch(() => null),
    isMe ? Promise.resolve(null) : getSocialSummary(viewer.id, member.id).catch(() => null),
    isMe ? getProfileStats(viewer).catch(() => null) : Promise.resolve(null),
  ])
  const base = `/members/${member.id}/social?tab=`
  const stats: MemberCardStat[] = isMe
    ? [
        { label: '게시물', value: own?.posts ?? null, href: '/me' },
        { label: '받은 좋아요', value: own?.likes ?? null },
        { label: '남은 초대', value: own?.invitesLeft ?? null, href: '/invites', sub: { label: '초대 네트워크', href: networkHref() } },
      ]
    : [
        { label: '팔로워', value: social?.followers ?? null, href: `${base}followers` },
        { label: '팔로잉', value: social?.following ?? null, href: `${base}following` },
        { label: '친구', value: social?.friends ?? null, href: `${base}friends` },
      ]
  return {
    id: member.id,
    displayName: member.display_name,
    handle: member.handle ?? null,
    avatarUrl: member.avatar_url ?? null,
    bio: member.bio ?? null,
    nickname: isMe ? member.nickname ?? null : null,
    isMe,
    relation: social?.relation ?? null,
    stats,
    stack,
  }
}
