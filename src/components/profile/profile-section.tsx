import Link from 'next/link'
import type { ReactNode } from 'react'
import { Pencil, Plus } from 'lucide-react'

/**
 * A91: one profile section card (LinkedIn-style): a title row (count, owner tools, pencil) and a
 * body. Empty sections are not rendered for others; the owner gets a gentle '추가' prompt instead.
 */
export function ProfileSection({
  id,
  title,
  icon,
  count,
  editHref,
  editLabel,
  tools,
  children,
}: {
  id: string
  title: ReactNode
  icon?: ReactNode
  count?: number
  editHref?: string | null
  editLabel?: string
  tools?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="card pf-section scroll-mt-20" aria-labelledby={`${id}-title`}>
      <div className="pf-section-head">
        <h2 id={`${id}-title`} className="pf-section-title">
          {icon}
          {title}
          {typeof count === 'number' && count > 0 && <span className="pf-section-count">{count}</span>}
        </h2>
        <div className="pf-section-tools">
          {tools}
          {editHref && (
            <Link href={editHref} className="pf-pencil" aria-label={editLabel} title={editLabel}>
              <Pencil className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

/** The owner's prompt in an empty section. */
export function ProfileEmpty({ text, href, action }: { text: ReactNode; href: string; action: ReactNode }) {
  return (
    <div className="pf-empty">
      <p>{text}</p>
      <Link href={href} className="pf-empty-cta">
        <Plus className="w-3.5 h-3.5" /> {action}
      </Link>
    </div>
  )
}

