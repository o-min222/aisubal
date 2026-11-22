import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'
import type { ProfileStats } from '@/lib/data/shell'
import type { ShellMember } from './nav-items'

export function ProfileCard({ me, stats }: { me: ShellMember; stats: ProfileStats | null }) {
  return (
    <section className="profile-card">
      <div className="profile-card-cover" aria-hidden />
      <div className="px-4 pb-4 -mt-7">
        <Link href="/members/me" className="inline-block rounded-full ring-4 ring-white">
          <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="lg" />
        </Link>
        <Link href="/members/me" className="block mt-2 font-semibold text-[#111] hover:underline truncate">
          {me.displayName}
        </Link>
        {me.nickname && <div className="text-xs text-[#888] truncate">별명 @{me.nickname}</div>}
        {me.bio && <p className="text-xs text-[#666] mt-1 line-clamp-2">{me.bio}</p>}
      </div>
      <dl className="profile-stats">
        <div>
          <dt>게시물</dt>
          <dd>{stats ? stats.posts : '–'}</dd>
        </div>
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
