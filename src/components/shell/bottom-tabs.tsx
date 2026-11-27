'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wrench, PlusSquare, Archive, LayoutDashboard, PenLine, type LucideIcon } from 'lucide-react'
import { isActive } from './nav-items'
import { useT } from '@/i18n/client'
import { useRetapNav } from './retap-nav'
import { msg } from '@/i18n/translate'

const TABS: Array<{ href: string; label: string; icon: LucideIcon; solid: boolean }> = [
  { href: '/feed', label: msg('홈'), icon: Home, solid: true },
  { href: '/gallery', label: msg('갤러리'), icon: Wrench, solid: true },
  { href: '/posts/new', label: msg('작성'), icon: PlusSquare, solid: false },
  { href: '/archive', label: msg('아카이브'), icon: Archive, solid: true },
  { href: '/me', label: msg('대시보드'), icon: LayoutDashboard, solid: true },
]

/** Mobile bottom tab bar (Instagram/Threads style). 작성 always writes to the human feed. */
export function BottomTabs() {
  const pathname = usePathname()
  const t = useT()
  const { onRetap } = useRetapNav()
  return (
    <nav className="bottom-tabs md:hidden" aria-label={t('하단 탭')}>
      {TABS.map((tab) => {
        const on = tab.href === '/posts/new' ? pathname === '/posts/new' : tab.href === '/feed' ? pathname === '/feed' || (pathname.startsWith('/posts/') && pathname !== '/posts/new') : isActive(pathname, tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={on ? 'on' : ''}
            aria-label={t(tab.label)}
            title={t(tab.label)}
            aria-current={on ? 'page' : undefined}
            onClick={(e) => onRetap(tab.href, e)}
          >
            <span className="tab-ico-wrap">
              <tab.icon className="tab-icon" strokeWidth={on ? 2.35 : 1.75} fill={tab.solid && on ? 'currentColor' : 'none'} aria-hidden />
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

/** Floating compose button — only on the 익명 board, where it differs from the bottom-tab 작성 (posts anonymously). */
export function ComposeFab() {
  const pathname = usePathname()
  const t = useT()
  if (pathname === '/anon') {
    return (
      <Link href="/anon/new" className="compose-fab md:hidden" aria-label={t('익명으로 글쓰기')}>
        <PenLine className="w-6 h-6" />
      </Link>
    )
  }
  // the human feed already has the bottom-tab 작성 (QA B-7): no duplicate floating button there
  return null
}
