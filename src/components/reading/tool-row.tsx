import { Bot, ChevronUp, Star } from 'lucide-react'
import type { ToolListItem } from '@/lib/tool-rules'
import { ToolTypeChips } from '@/components/tools/type-chips'
import { usageLine, type ToolUsageStack } from '@/lib/tool-usage-rules'
import { ToolIcon } from '@/components/tools/tool-icon'
import { UserAvatar } from '@/components/user-avatar'
import { CompactRow } from './compact-row'
import { T } from '@/i18n/t'

/** Compact 툴 row: name, kind, one-liner, the stats that matter for that kind. */
export function ToolRow({ tool, href, active, usage }: { tool: ToolListItem; href: string; active?: boolean; usage?: ToolUsageStack }) {
  const isLaunch = Boolean(tool.product_id)
  const line = usageLine(usage, tool.user_count ?? 0)
  const stack = usage?.stack ?? []
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
          {line && (
            <span className="tool-usage" style={usage?.friends ? { color: 'var(--c-1f7a4d)', fontWeight: 600 } : usage?.following ? { color: 'var(--n-555)', fontWeight: 600 } : undefined}>
              {stack.length > 0 && (
                <span className="tool-usage-stack" aria-hidden>
                  {stack.map((u) => (
                    <span key={u.id} className={u.kind === 'friend' ? 'is-friend' : undefined}>
                      <UserAvatar id={u.id} name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                    </span>
                  ))}
                </span>
              )}
              <T s={line.s} vars={line.vars} />
            </span>
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
