'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { SIDE_NAV, isActive } from './nav-items'
import { signOut } from './sign-out'

const IN_TABS = new Set(['/feed', '/toolbox', '/archive', '/members/me'])

/** Mobile "더보기" bottom sheet: every side-panel item not in the tab bar. */
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
  const items = SIDE_NAV.filter((i) => !IN_TABS.has(i.href) && (!i.adminOnly || isAdmin))
  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange} title="더보기">
      <div className="grid grid-cols-3 gap-2 pt-2">
        {items.map((item) =>
          item.soon ? (
            <span key={item.href} className="more-tile opacity-50" aria-disabled="true">
              <item.icon className="w-6 h-6" />
              <span>{item.label}</span>
              <small>곧 오픈</small>
            </span>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onOpenChange(false)}
              className={`more-tile ${isActive(pathname, item.href) ? 'on' : ''}`}
            >
              <item.icon className="w-6 h-6" />
              <span>{item.label}</span>
            </Link>
          )
        )}
        <button type="button" onClick={signOut} className="more-tile">
          <LogOut className="w-6 h-6" />
          <span>로그아웃</span>
        </button>
      </div>
    </AdaptiveSheet>
  )
}
