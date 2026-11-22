import Link from 'next/link'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** One compact list row: clear title, short preview, meta line. Opens in the reading pane. */
export function CompactRow({
  href,
  active,
  leading,
  title,
  badge,
  preview,
  meta,
  trailing,
}: {
  href: string
  active?: boolean
  leading?: React.ReactNode
  title: React.ReactNode
  badge?: React.ReactNode
  preview?: React.ReactNode
  meta?: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <Link href={href} scroll={false} className={`crow${active ? ' on' : ''}`} aria-current={active ? 'true' : undefined}>
      {leading && <span className="crow-lead">{leading}</span>}
      <span className="crow-main">
        <span className="crow-top">
          <span className="crow-title">{title}</span>
          {badge}
        </span>
        {preview && <span className="crow-preview">{preview}</span>}
        {meta && <span className="crow-meta">{meta}</span>}
      </span>
      {trailing && <span className="crow-trail">{trailing}</span>}
    </Link>
  )
}

export async function CompactList({ children, label }: { children: React.ReactNode; label: string }) {
  const st = await getT()
  return (
    <div className="crow-list" role="list" aria-label={st(label)}>
      {children}
    </div>
  )
}

export function EmptyList({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-8 text-center">
      <p className="font-medium" style={{ color: '#333' }}>
        <T>{title}</T>
      </p>
      {hint && <p className="text-sm mt-1" style={{ color: '#888' }}><T>{hint}</T></p>}
    </div>
  )
}
