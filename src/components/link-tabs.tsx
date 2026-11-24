import Link from 'next/link'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { TabScroller } from '@/components/tab-scroller'

/** Underlined link tabs (server-renderable). Scrolls horizontally when they don't fit (A84: clips at the edge, no fade). */
export async function LinkTabs({
  tabs,
  active,
  label,
  className = '',
  flush = false,
}: {
  tabs: Array<{ id: string; label: string; href: string; count?: number | null; dot?: boolean }>
  active: string
  label: string
  className?: string
  /** A84: no bottom rule of its own (the row it sits in draws it) */
  flush?: boolean
}) {
  const st = await getT()
  return (
    <TabScroller
      label={st(label)}
      className={`link-tabs ${className}`}
      style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: flush ? undefined : '1px solid var(--n-ececec)', scrollbarWidth: 'none' }}
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
              color: on ? 'var(--n-111)' : 'var(--n-777)',
              borderBottom: on ? '2px solid var(--n-111)' : '2px solid transparent',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            <T>{t.label}</T>
            {typeof t.count === 'number' && <span style={{ color: 'var(--n-999)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>}
            {t.dot && <span aria-label={st('새 항목')} style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--c-e5484d)', display: 'inline-block' }} />}
          </Link>
        )
      })}
    </TabScroller>
  )
}
