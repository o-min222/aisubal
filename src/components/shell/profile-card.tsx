import { MemberCard } from '@/components/profile/member-card'
import type { MemberCardData } from '@/lib/data/member-card'
import type { ShellMember } from './nav-items'
import { getT } from '@/i18n/server'
import { networkHref } from '@/lib/dashboard-tabs'

/**
 * Left '내 프로필 카드': exactly the MemberCard others see (no owner-only
 * buttons). Tapping it opens 내 대시보드, where the card is edited in place.
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
      { label: st('남은 초대'), value: null, href: '/invites', sub: { label: st('초대 그래프'), href: networkHref() } },
    ],
    stack: null,
  }
  return <MemberCard data={data} variant="side" />
}
