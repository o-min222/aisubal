'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SIDE_NAV, isActive } from './nav-items'

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  return (
    <nav className="side-nav" aria-label="주 메뉴">
      {SIDE_NAV.filter((i) => !i.adminOnly || isAdmin).map((item) =>
        item.soon ? (
          <span key={item.href} className="side-nav-item is-soon" aria-disabled="true" title="곧 오픈">
            <item.icon />
            {item.label}
            <span className="ml-auto text-[10px] text-[#aaa]">곧 오픈</span>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`side-nav-item ${isActive(pathname, item.href) ? 'active' : ''}`}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
          >
            <item.icon />
            {item.label}
          </Link>
        )
      )}
    </nav>
  )
}
