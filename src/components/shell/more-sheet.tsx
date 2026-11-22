'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { SIDE_NAV, isActive } from './nav-items'
import { useT } from '@/i18n/client'

const IN_TABS = new Set(['/feed', '/tools', '/archive', '/members/me'])

/** Mobile menu sheet: content sections not in the tab bar (account items live in the account menu). */
export function MoreSheet({
  open,
  onOpenChange,
  isAdmin,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  isAdmin: boolean
}) {
  const pathname = usePathname()
  const t = useT()
  const items = SIDE_NAV.filter((i) => !IN_TABS.has(i.href) && (!i.adminOnly || isAdmin))
  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange} title={t('메뉴')}>
      <div className="grid grid-cols-3 gap-2 pt-2">
        {items.map((item) =>
          item.soon ? (
            <span key={item.href} className="more-tile opacity-50" aria-disabled="true">
              <item.icon className="w-6 h-6" />
              <span>{t(item.label)}</span>
              <small>{t('곧 오픈')}</small>
            </span>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onOpenChange(false)}
              className={`more-tile ${isActive(pathname, item.href) ? 'on' : ''}`}
            >
              <item.icon className="w-6 h-6" />
              <span>{t(item.label)}</span>
            </Link>
          )
        )}
      </div>
      <p className="text-xs text-[#888] text-center mt-3">{t('프로필·초대·설정은 오른쪽 위 프로필 사진을 눌러 열어요.')}</p>
    </AdaptiveSheet>
  )
}
