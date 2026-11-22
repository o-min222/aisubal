import { Bot, ChevronUp, Star, Users } from 'lucide-react'
import type { ToolListItem } from '@/lib/tool-rules'
import { ToolTypeChips } from '@/components/tools/type-chips'
import type { ToolSocialUser } from '@/lib/data/tools'
import { ToolIcon } from '@/components/tools/tool-icon'
import { CompactRow } from './compact-row'
import { T } from '@/i18n/t'

/** Compact 툴 row: name, kind, one-liner, the stats that matter for that kind. */
export function ToolRow({ tool, href, active, social = [] }: { tool: ToolListItem; href: string; active?: boolean; social?: ToolSocialUser[] }) {
  const isLaunch = Boolean(tool.product_id)
  const friends = social.filter((u) => u.kind === 'friend').length
  const following = social.filter((u) => u.kind === 'following').length
  return (
    <CompactRow
      save={{ kind: 'tool', refId: tool.id, hint: { title: tool.name } }}
      href={href}
      active={active}
      leading={<ToolIcon name={tool.name} iconUrl={tool.icon_url} dim="w-9 h-9" />}
      title={tool.name}
      badge={
        <>
          <ToolTypeChips entry={tool} />
          {tool.used_by_me && <span className="crow-chip" style={{ background: 'var(--c-e8f5ee)', color: 'var(--c-1f7a4d)' }}><T>사용 중</T></span>}
        </>
      }
      preview={tool.one_liner}
      meta={
        <>
          {friends + following > 0 ? (
            <span style={{ color: friends ? 'var(--c-1f7a4d)' : 'var(--n-555)', fontWeight: 600 }}>
              <Users className="w-3 h-3" /> {friends ? <T s="친구 {n}명이 써요" vars={{ n: friends }} /> : <T s="팔로잉 {n}명이 써요" vars={{ n: following }} />}
            </span>
          ) : (
            (tool.user_count ?? 0) > 0 && (
              <span>
                <Users className="w-3 h-3" /> {tool.user_count}명
              </span>
            )
          )}
          {tool.rating_count > 0 && (
            <span>
              <Star className="w-3 h-3" style={{ fill: '#f5a623', color: '#f5a623' }} /> {Number(tool.avg_rating).toFixed(1)}
            </span>
          )}
          {(tool.ai_rating_count ?? 0) > 0 && (
            <span>
              <Bot className="w-3 h-3" /> AI {Number(tool.ai_rating_avg).toFixed(1)}
            </span>
          )}
          {isLaunch && (
            <span>
              <ChevronUp className="w-3 h-3" /> {tool.upvote_count ?? 0}
            </span>
          )}
        </>
      }
    />
  )
}
