'use client'

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
