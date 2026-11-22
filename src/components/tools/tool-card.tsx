import Link from 'next/link'
import { Bot, ChevronUp, Download, Star, Users } from 'lucide-react'
import { TOOL_TYPE_CHIP, toolHref, type ToolListItem } from '@/lib/tool-rules'
import { UsageToggle } from './usage-toggle'
import { UserAvatar } from '@/components/user-avatar'
import type { ToolSocialUser } from '@/lib/data/tools'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** 'friends using' avatars first, then people I follow; plain count only when none. */
async function SocialUsers({ users, total }: { users: ToolSocialUser[]; total: number }) {
  const st = await getT()
  const friends = users.filter((u) => u.kind === 'friend')
  const following = users.filter((u) => u.kind === 'following')
  const shown = [...friends, ...following].slice(0, 4)
  const label = friends.length
    ? following.length
      ? st('친구 {friends}명 · 팔로잉 {following}명이 써요', { friends: friends.length, following: following.length })
      : st('친구 {length}명이 써요', { length: friends.length })
    : st('팔로잉 {length}명이 써요', { length: following.length })
  return (
    <span className="tool-social inline-flex items-center gap-1.5 min-w-0" title={shown.map((u) => u.name).join(', ')}>
      <span className="users-strip">
        <span className="avatars">
          {shown.map((u) => (
            <span key={u.id} style={u.kind === 'friend' ? { boxShadow: '0 0 0 2px var(--n-fff), 0 0 0 3.5px #2f9e66', borderRadius: 999 } : undefined}>
              <UserAvatar id={u.id} name={u.name} avatarUrl={u.avatarUrl} size="sm" />
            </span>
          ))}
        </span>
      </span>
      <span className="truncate" style={{ color: friends.length ? 'var(--c-1f7a4d)' : 'var(--n-555)', fontWeight: 600 }}>
        <T>{label}</T>
      </span>
      {total > users.length && <span className="text-n-999 whitespace-nowrap"><T s="· 전체 {total}명" vars={{ total }} /></span>}
    </span>
  )
}

export function ToolIcon({ name, iconUrl, dim = 'w-11 h-11' }: { name: string; iconUrl?: string | null; dim?: string }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" className={`${dim} rounded-xl object-cover border border-n-eee bg-n-fff flex-shrink-0`} />
  }
  return (
    <div className={`product-icon ${dim} text-base flex-shrink-0`} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

/** One row of the unified 툴 list: stats relevant to the kind (launch → upvotes). */
export async function ToolCard({ tool, social = [] }: { tool: ToolListItem; social?: ToolSocialUser[] }) {
  const st = await getT()
  const isLaunch = Boolean(tool.product_id)
  return (
    <article className="tool-card">
      <Link href={toolHref(tool)} className="flex gap-3 min-w-0 flex-1">
        <ToolIcon name={tool.name} iconUrl={tool.icon_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-semibold text-[15px] text-n-111 truncate max-w-full">{tool.name}</h3>
            <span className="cat-chip"><T>{TOOL_TYPE_CHIP[tool.type]}</T></span>
            {isLaunch && <span className="launch-chip"><T>런치</T></span>}
            {tool.featured && <span className="badge badge-agent"><T>추천</T></span>}
          </div>
          <p className="text-[13.5px] text-n-555 line-clamp-2 mt-0.5">{tool.one_liner}</p>
          {social.length > 0 && (
            <div className="mt-1.5 text-[12.5px]">
              <SocialUsers users={social} total={tool.user_count ?? 0} />
            </div>
          )}
          <div className="tool-stats">
            {social.length === 0 && (tool.user_count ?? 0) > 0 && (
              <span title={st('나도 써요 표시한 멤버')}>
                <Users className="w-3.5 h-3.5" /> {tool.user_count}명이 써요
              </span>
            )}
            {tool.rating_count > 0 && (
              <span title={st('멤버 리뷰')}>
                <Star className="w-3.5 h-3.5 fill-[#f5a623] text-[#f5a623]" /> {Number(tool.avg_rating).toFixed(1)}
              </span>
            )}
            {(tool.ai_rating_count ?? 0) > 0 && (
              <span title={st('Agora AI 평가')}>
                <Bot className="w-3.5 h-3.5" /> AI {Number(tool.ai_rating_avg).toFixed(1)}
              </span>
            )}
            {isLaunch ? (
              <span title={st('업보트')}>
                <ChevronUp className="w-3.5 h-3.5" /> {tool.upvote_count ?? 0}
              </span>
            ) : (
              tool.install_count > 0 && (
                <span title={st('설치')}>
                  <Download className="w-3.5 h-3.5" /> {tool.install_count}
                </span>
              )
            )}
          </div>
        </div>
      </Link>
      <div className="flex-shrink-0 self-center">
        <UsageToggle entryId={tool.id} initialUsing={tool.used_by_me} initialCount={tool.user_count ?? 0} />
      </div>
    </article>
  )
}
