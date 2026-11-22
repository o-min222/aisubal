'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageCircleQuestion, UserRound, Users } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { Composer, type ComposerIdentity } from '@/components/feed/composer'
import { UserAvatar } from '@/components/user-avatar'
import { RelationBadge } from '@/components/social/relation-badge'
import { FollowButton } from '@/components/social/follow-button'
import { askPrompt } from '@/lib/ask-rules'
import { socialProofLine } from '@/lib/social-rules'
import type { ToolUser, ToolUsers } from '@/lib/data/tools'
import { UsageToggle } from './usage-toggle'

const COLLAPSED = 6

/**
 * Who uses this tool: a people list (friends → people I follow → others) under
 * a social-proof header, each with a relation badge and '물어보기'.
 */
export function ToolUsersCard({
  entryId,
  usage,
  tool,
  me,
}: {
  entryId: string
  usage: ToolUsers
  tool: { name: string; url: string }
  me: ComposerIdentity
}) {
  const [expanded, setExpanded] = useState(false)
  const [asking, setAsking] = useState<ToolUser | null>(null)
  const others = usage.users.filter((u) => !u.relation.isMe)
  const shown = expanded ? usage.users : usage.users.slice(0, COLLAPSED)
  const header = socialProofLine(usage.users.map((u) => u.relation))
  const friends = others.filter((u) => u.relation.friend === 'friends').length

  return (
    <section className="card overflow-hidden" aria-labelledby="tool-people-title">
      <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id="tool-people-title" className="text-[15px] font-bold inline-flex items-center gap-1.5" style={{ color: friends > 0 ? '#1f7a4d' : '#111' }}>
            <Users className="w-4 h-4" /> {header}
          </h2>
          <p className="text-[12.5px] mt-0.5" style={{ color: '#777' }}>
            {usage.count > 0 ? `전체 ${usage.count}명이 ‘나도 써요’로 표시했어요` : '써봤다면 표시해서 다른 멤버가 물어볼 수 있게 해주세요'}
          </p>
        </div>
        <UsageToggle entryId={entryId} initialUsing={usage.usedByMe} initialCount={usage.count} size="md" />
      </div>

      {shown.length > 0 && (
        <ul className="border-t border-[#f0f0f0] divide-y divide-[#f4f4f4]" aria-label="쓰는 사람">
          {shown.map((u) => (
            <li key={u.id} className="tool-person flex items-center gap-3 px-4 py-2.5">
              <Link href={`/members/${u.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                <UserAvatar id={u.id} name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="font-medium text-[14.5px] truncate" style={{ color: '#111' }}>
                    {u.name}
                  </span>
                  {u.relation.isMe ? <span className="text-xs text-[#888]">(나)</span> : <RelationBadge relation={u.relation} />}
                </span>
              </Link>
              {!u.relation.isMe && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!u.relation.iFollow && <FollowButton memberId={u.id} initialFollowing={false} variant="chip" refresh={false} />}
                  <button
                    type="button"
                    onClick={() => setAsking(u)}
                    className="btn btn-secondary btn-sm rounded-full min-h-[36px] px-3"
                    aria-label={`${u.name}님에게 ${tool.name} 물어보기`}
                  >
                    <MessageCircleQuestion className="w-4 h-4" /> 물어보기
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {usage.users.length > COLLAPSED && (
        <button type="button" onClick={() => setExpanded((x) => !x)} className="w-full text-sm py-3 border-t border-[#f0f0f0] min-h-[44px]" style={{ color: '#0066cc' }}>
          {expanded ? '접기' : `${usage.users.length - COLLAPSED}명 더 보기`}
        </button>
      )}

      <AdaptiveSheet open={Boolean(asking)} onOpenChange={(o) => !o && setAsking(null)} title={asking ? `${asking.name}님에게 물어보기` : '물어보기'}>
        {asking && (
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed" style={{ color: '#666' }}>
              아직 1:1 메시지가 없어서, 질문은 <b>피드 글</b>로 올라가요. 같은 게 궁금한 다른 멤버도 답을 볼 수 있어요.
            </p>
            <Composer me={me} initialBody={askPrompt(asking, tool.name, tool.url)} autoFocus onPosted={() => setAsking(null)} className="!p-0 !border-0 !shadow-none" />
            <Link href={`/members/${asking.id}`} className="btn btn-secondary btn-sm w-full min-h-[44px] justify-center">
              <UserRound className="w-4 h-4" /> 프로필 먼저 보기
            </Link>
          </div>
        )}
      </AdaptiveSheet>
    </section>
  )
}
