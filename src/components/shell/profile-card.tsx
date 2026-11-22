import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import type { ProfileStats } from '@/lib/data/shell'
import type { ShellMember } from './nav-items'

/** Side-panel identity card; clicking it opens '내 대시보드' (/me). The top-bar avatar keeps the account menu. */
export function ProfileCard({ me, stats }: { me: ShellMember; stats: ProfileStats | null }) {
  return (
    // overflow visible so the account dropdown can open out of the card
    <section className="profile-card" style={{ overflow: 'visible', position: 'relative', zIndex: 5 }}>
      <div className="profile-card-cover" style={{ borderRadius: '13px 13px 0 0' }} aria-hidden />
      <div className="px-3 pb-3 -mt-7">
        <Link href="/me" className="profile-card-trigger p-1" aria-label={`${me.displayName} — 내 대시보드`}>
          <span className="flex flex-col items-start min-w-0 flex-1">
            <span className="inline-block rounded-full ring-4 ring-white">
              <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="lg" />
            </span>
            <span className="flex items-center gap-1 mt-2 w-full">
              <span className="pc-name font-semibold text-[#111] truncate">{me.displayName}</span>
              <ChevronRight className="w-4 h-4 text-[#888] flex-shrink-0" />
            </span>
            {me.nickname && <span className="text-xs text-[#888] truncate">별명 @{me.nickname}</span>}
            {me.bio && <span className="text-xs text-[#666] mt-1 line-clamp-2">{me.bio}</span>}
          </span>
        </Link>
      </div>
      <dl className="profile-stats">
        <Link href="/me">
          <dt>게시물</dt>
          <dd>{stats ? stats.posts : '–'}</dd>
        </Link>
        <div>
          <dt>받은 좋아요</dt>
          <dd>{stats ? stats.likes : '–'}</dd>
        </div>
        <Link href="/invites">
          <dt>남은 초대</dt>
          <dd>{stats ? stats.invitesLeft : '–'}</dd>
        </Link>
      </dl>
    </section>
  )
}
