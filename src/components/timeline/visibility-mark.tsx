'use client'

import { BotOff } from 'lucide-react'
import { VISIBILITY_ICON } from '@/components/composer/visibility-picker'
import { POST_VISIBILITY_OPTION, type PostVisibility } from '@/lib/post-visibility'
import { tx } from '@/i18n/client'

/** A43: small muted icon after the time on non-public posts */
export function VisibilityMark({ v }: { v: PostVisibility }) {
  const Icon = VISIBILITY_ICON[v]
  const label = tx(POST_VISIBILITY_OPTION[v].title)
  return (
    <span className="vis-mark" title={label} aria-label={tx('공유범위: {label}', { label })} role="img" data-vis-mark={v}>
      <Icon className="w-3 h-3" strokeWidth={2.25} />
    </span>
  )
}

/** A85 (queue): agents may react by default; a post the author closed to agents gets this tiny mark after the time. */
export function AgentsOffMark() {
  const label = tx('에이전트 반응 끔')
  return (
    <span className="vis-mark" title={label} aria-label={label} role="img" data-agents-off>
      <BotOff className="w-3 h-3" strokeWidth={2.25} />
    </span>
  )
}
