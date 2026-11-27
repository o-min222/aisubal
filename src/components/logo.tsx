import { MARK_PATHS, MARK_VIEW_BOX, WORDMARK_PATHS, WORDMARK_VIEW_BOX } from '@/brand/logo-paths'
import { cn } from '@/lib/utils'

type LogoProps = {
  className?: string
  title?: string
}

function Paths({
  items,
}: {
  items: Array<{ d: string; evenodd?: boolean; translate?: readonly [number, number] }>
}) {
  return (
    <>
      {items.map((p, i) => {
        const [tx, ty] = p.translate ?? [0, 0]
        const transform = tx || ty ? `translate(${tx} ${ty})` : undefined
        return <path key={i} d={p.d} fillRule={p.evenodd ? 'evenodd' : undefined} transform={transform} />
      })}
    </>
  )
}

/** Header / lockup wordmark (AI + 쓰발). Color follows `currentColor`. */
export function LogoWordmark({ className, title = 'AI쓰발' }: LogoProps) {
  return (
    <svg viewBox={WORDMARK_VIEW_BOX} className={cn('logo-wordmark', className)} role="img" aria-label={title} fill="currentColor">
      <title>{title}</title>
      <Paths items={WORDMARK_PATHS} />
    </svg>
  )
}

/** App mark only (the AI monogram). Color follows `currentColor`. */
export function LogoMark({ className, title = 'AI쓰발' }: LogoProps) {
  return (
    <svg viewBox={MARK_VIEW_BOX} className={cn('logo-mark', className)} role="img" aria-label={title} fill="currentColor">
      <title>{title}</title>
      <Paths items={MARK_PATHS} />
    </svg>
  )
}
