import Link from 'next/link'
import { Bot } from 'lucide-react'
import type { ToolListItem, ToolSort } from '@/lib/tool-rules'
import { usageLine, type ToolUsageStack } from '@/lib/tool-usage-rules'
import { DATE_BUCKET_LABEL, type DateBucket } from '@/lib/gallery-rows'
import { ToolTypeChips } from '@/components/tools/type-chips'
import { ToolIcon } from '@/components/tools/tool-icon'
import { UpvoteBox } from '@/components/tools/upvote-box'
import { ArchiveButton } from '@/components/archive/archive-button'
import { UserAvatar } from '@/components/user-avatar'
import { T } from '@/i18n/t'

/**
 * A84: Product Hunt-style gallery row — rank (popular sort), rounded-square logo, bold name, one-line
 * tagline, small muted meta (type · tags · who uses it), a quiet bookmark and the upvote box (= 좋아요).
 * The bookmark and the vote are siblings of the row link, so a tap never opens the pane.
 */
export function GalleryRow({ tool, href, active, usage, rank, sort }: { tool: ToolListItem; href: string; active?: boolean; usage?: ToolUsageStack; rank?: number | null; sort: ToolSort }) {
  const line = usageLine(usage, tool.user_count ?? 0)
  const stack = usage?.stack ?? []
  const tags = (tool.tags ?? []).slice(0, 2)
  return (
    <div className={`ph-row${active ? ' on' : ''}`} role="listitem">
      <Link href={href} scroll={false} className="ph-link" aria-current={active ? 'true' : undefined}>
        {rank != null && <span className="ph-rank tabular-nums">{rank}</span>}
        <ToolIcon name={tool.name} iconUrl={tool.icon_url} dim="ph-logo" text="text-lg" />
        <span className="ph-main">
          <span className="ph-name">{tool.name}</span>
          {tool.one_liner && <span className="ph-tagline">{tool.one_liner}</span>}
          <span className="ph-meta">
            <ToolTypeChips entry={tool} />
            {tags.map((t) => (
              <span key={t} className="ph-tag">#{t}</span>
            ))}
            {line && (
              <span className={`ph-usage${usage?.friends ? ' is-friends' : ''}`}>
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
            {sort === 'ai' && (tool.ai_rating_count ?? 0) > 0 && (
              <span className="ph-ai"><Bot className="w-3 h-3" aria-hidden /> AI {Number(tool.ai_rating_avg).toFixed(1)}</span>
            )}
          </span>
        </span>
      </Link>
      <ArchiveButton kind="tool" refId={tool.id} hint={{ title: tool.name }} className="ph-save" />
      <UpvoteBox key={`${tool.liked_by_me}-${tool.like_count}`} entryId={tool.id} name={tool.name} voted={Boolean(tool.liked_by_me)} count={tool.like_count ?? 0} />
    </div>
  )
}

/** A84: 오늘 / 이번 주 / 이번 달 / 그 전 on the latest sort */
export function GalleryGroupHeader({ bucket }: { bucket: DateBucket }) {
  return (
    <div className="ph-group" role="listitem">
      <T>{DATE_BUCKET_LABEL[bucket]}</T>
    </div>
  )
}
