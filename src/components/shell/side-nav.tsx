'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SIDE_NAV, isActive } from './nav-items'
import { useT } from '@/i18n/client'

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const t = useT()
  return (
    <nav className="side-nav" aria-label={t('주 메뉴')}>
      {SIDE_NAV.filter((i) => !i.adminOnly || isAdmin).map((item) =>
        item.soon ? (
          <span key={item.href} className="side-nav-item is-soon" aria-disabled="true" title={t('곧 오픈')}>
            <item.icon />
            {t(item.label)}
            <span className="ml-auto text-[10px] text-[#aaa]">{t('곧 오픈')}</span>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`side-nav-item ${isActive(pathname, item.href) ? 'active' : ''}`}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
          >
            <item.icon />
            {t(item.label)}
          </Link>
        )
      )}
    </nav>
  )
}
