import Link from 'next/link'

/** Underlined link tabs (server-renderable). Scrolls horizontally on narrow screens. */
export function LinkTabs({
  tabs,
  active,
  label,
  className = '',
}: {
  tabs: Array<{ id: string; label: string; href: string; count?: number | null; dot?: boolean }>
  active: string
  label: string
  className?: string
}) {
  return (
    <nav
      aria-label={label}
      className={`link-tabs ${className}`}
      style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid #ececec', scrollbarWidth: 'none' }}
    >
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            scroll={false}
            style={{
              flex: '0 0 auto',
              padding: '10px 12px',
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 14.5,
              fontWeight: on ? 700 : 500,
              color: on ? '#111' : '#777',
              borderBottom: on ? '2px solid #111' : '2px solid transparent',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {typeof t.count === 'number' && <span style={{ color: '#999', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>}
            {t.dot && <span aria-label="새 항목" style={{ width: 6, height: 6, borderRadius: 99, background: '#e5484d', display: 'inline-block' }} />}
          </Link>
        )
      })}
    </nav>
  )
}
