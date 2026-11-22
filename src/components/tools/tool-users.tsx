import Link from 'next/link'
import { AuthorAvatar } from '@/components/user-avatar'
import { publicAuthorLabel } from '@/lib/profile'
import type { ToolUsers } from '@/lib/data/tools'
import { UsageToggle } from './usage-toggle'

/** 'N명이 사용 중' + avatars + the viewer's toggle. */
export function ToolUsersCard({ entryId, usage }: { entryId: string; usage: ToolUsers }) {
  const shown = usage.users.slice(0, 8)
  return (
    <section className="card p-4 flex items-center justify-between gap-3 flex-wrap" aria-label="사용 중인 멤버">
      <div className="users-strip min-w-0">
        {shown.length > 0 && (
          <div className="avatars">
            {shown.map((u) => (
              <Link key={u.id} href={`/members/${u.id}`} title={publicAuthorLabel(u)} aria-label={`${publicAuthorLabel(u)} 프로필`}>
                <AuthorAvatar author={u} size="sm" />
              </Link>
            ))}
          </div>
        )}
        <p className="text-sm text-[#333]">
          {usage.count > 0 ? (
            <>
              <strong className="tabular-nums">{usage.count}명</strong>이 사용 중
              {shown[0] && (
                <span className="text-[#888]">
                  {' '}
                  · {publicAuthorLabel(shown[0])}
                  {usage.count > 1 ? ` 외 ${usage.count - 1}명` : ''}
                </span>
              )}
            </>
          ) : (
            <span className="text-[#666]">아직 사용 중인 멤버가 없어요. 처음으로 표시해보세요.</span>
          )}
        </p>
      </div>
      <UsageToggle entryId={entryId} initialUsing={usage.usedByMe} initialCount={usage.count} size="md" />
    </section>
  )
}
