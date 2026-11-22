'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wrench, PlusSquare, Archive, UserRound, PenLine } from 'lucide-react'
import { isActive } from './nav-items'

const TABS = [
  { href: '/feed', label: '홈', icon: Home },
  { href: '/tools', label: '툴', icon: Wrench },
  { href: '/posts/new', label: '작성', icon: PlusSquare },
  { href: '/archive', label: '아카이브', icon: Archive },
  { href: '/members/me', label: '프로필', icon: UserRound },
]

/** Mobile bottom tab bar (Instagram/Threads style). 작성 always writes to the human feed. */
export function BottomTabs() {
  const pathname = usePathname()
  return (
    <nav className="bottom-tabs md:hidden" aria-label="하단 탭">
      {TABS.map((t) => {
        const on = t.href === '/posts/new' ? pathname === '/posts/new' : t.href === '/feed' ? pathname === '/feed' || (pathname.startsWith('/posts/') && pathname !== '/posts/new') : isActive(pathname, t.href)
        return (
          <Link key={t.href} href={t.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
            <t.icon className="w-6 h-6" strokeWidth={on ? 2.4 : 1.8} />
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/** Floating compose button — human feed and 익명 board only (agents never write there). */
export function ComposeFab() {
  const pathname = usePathname()
  if (pathname === '/anon') {
    return (
      <Link href="/anon/new" className="compose-fab md:hidden" aria-label="익명으로 글쓰기">
        <PenLine className="w-6 h-6" />
      </Link>
    )
  }
  if (pathname !== '/feed') return null
  return (
    <Link href="/posts/new" className="compose-fab md:hidden" aria-label="새 글 쓰기">
      <PlusSquare className="w-6 h-6" />
    </Link>
  )
}
