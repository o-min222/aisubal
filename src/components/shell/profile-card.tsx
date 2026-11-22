import { MemberCard } from '@/components/profile/member-card'
import type { MemberCardData } from '@/lib/data/member-card'
import type { ShellMember } from './nav-items'
import { getT } from '@/i18n/server'

/**
 * Left '내 프로필 카드': the same MemberCard others see when they click you,
 * with the owner action (프로필 편집) instead of follow/friend.
 */
export async function ProfileCard({ me, card }: { me: ShellMember; card: MemberCardData | null }) {
  const st = await getT()
  const data: MemberCardData = card ?? {
    id: me.id,
    displayName: me.displayName,
    handle: null,
    avatarUrl: me.avatarUrl,
    bio: me.bio,
    nickname: me.nickname,
    isMe: true,
    relation: null,
    stats: [
      { label: st('게시물'), value: null, href: '/me' },
      { label: st('받은 좋아요'), value: null },
      { label: st('남은 초대'), value: null, href: '/invites' },
    ],
    stack: null,
  }
  return <MemberCard data={data} variant="side" />
}
