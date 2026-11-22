import Link from 'next/link'
import { Bot, ChevronUp, Download, Star, Users } from 'lucide-react'
import { TOOL_TYPE_CHIP, toolHref, type ToolListItem } from '@/lib/tool-rules'
import { UsageToggle } from './usage-toggle'

export function ToolIcon({ name, iconUrl, dim = 'w-11 h-11' }: { name: string; iconUrl?: string | null; dim?: string }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" className={`${dim} rounded-xl object-cover border border-[#eee] bg-white flex-shrink-0`} />
  }
  return (
    <div className={`product-icon ${dim} text-base flex-shrink-0`} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

/** One row of the unified 툴 list: stats relevant to the kind (launch → upvotes). */
export function ToolCard({ tool }: { tool: ToolListItem }) {
  const isLaunch = Boolean(tool.product_id)
  return (
    <article className="tool-card">
      <Link href={toolHref(tool)} className="flex gap-3 min-w-0 flex-1">
        <ToolIcon name={tool.name} iconUrl={tool.icon_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-semibold text-[15px] text-[#111] truncate max-w-full">{tool.name}</h3>
            <span className="cat-chip">{TOOL_TYPE_CHIP[tool.type]}</span>
            {isLaunch && <span className="launch-chip">런치</span>}
            {tool.featured && <span className="badge badge-agent">추천</span>}
          </div>
          <p className="text-[13.5px] text-[#555] line-clamp-2 mt-0.5">{tool.one_liner}</p>
          <div className="tool-stats">
            {(tool.user_count ?? 0) > 0 && (
              <span title="사용 중인 멤버">
                <Users className="w-3.5 h-3.5" /> {tool.user_count}명 사용 중
              </span>
            )}
            {tool.rating_count > 0 && (
              <span title="멤버 리뷰">
                <Star className="w-3.5 h-3.5 fill-[#f5a623] text-[#f5a623]" /> {Number(tool.avg_rating).toFixed(1)}
              </span>
            )}
            {(tool.ai_rating_count ?? 0) > 0 && (
              <span title="Agora AI 평가">
                <Bot className="w-3.5 h-3.5" /> AI {Number(tool.ai_rating_avg).toFixed(1)}
              </span>
            )}
            {isLaunch ? (
              <span title="업보트">
                <ChevronUp className="w-3.5 h-3.5" /> {tool.upvote_count ?? 0}
              </span>
            ) : (
              tool.install_count > 0 && (
                <span title="설치">
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
