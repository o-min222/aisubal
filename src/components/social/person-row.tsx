import Link from 'next/link'
import type { ReactNode } from 'react'
import { UserAvatar } from '@/components/user-avatar'
import type { Relation } from '@/lib/social-rules'
import { FollowButton } from './follow-button'
import { FriendButton } from './friend-button'
import { RelationBadge } from './relation-badge'

/** A person in a list: avatar, name, relation badge, follow (and optionally friend) action. */
export function PersonRow({
  person,
  showFriend = false,
  extra,
  subtitle,
}: {
  person: { id: string; name: string; avatarUrl: string | null; bio?: string; relation: Relation }
  showFriend?: boolean
  extra?: ReactNode
  subtitle?: ReactNode
}) {
  const r = person.relation
  return (
    <div className="person-row flex items-center gap-3 px-4 py-3">
      <Link href={`/members/${person.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <UserAvatar id={person.id} name={person.name} avatarUrl={person.avatarUrl} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-[15px] truncate" style={{ color: '#111' }}>
              {person.name}
            </span>
            {r.isMe ? <span className="text-xs text-[#888]">(나)</span> : <RelationBadge relation={r} />}
          </span>
          {subtitle ? (
            <span className="block text-[12.5px] text-[#777] truncate">{subtitle}</span>
          ) : person.bio ? (
            <span className="block text-[12.5px] text-[#777] truncate">{person.bio}</span>
          ) : null}
        </span>
      </Link>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {extra}
        {!r.isMe && showFriend && r.friend !== 'none' && <FriendButton memberId={person.id} initialState={r.friend} compact />}
        {!r.isMe && <FollowButton memberId={person.id} initialFollowing={r.iFollow} variant="chip" />}
      </div>
    </div>
  )
}
