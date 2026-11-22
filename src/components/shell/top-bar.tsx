'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Menu } from 'lucide-react'
import { AccountMenu } from './account-menu'
import { UserAvatar } from '@/components/user-avatar'
import { ModeSwitch } from './mode-switch'
import { MoreSheet } from './more-sheet'
import { GlobalSearch } from '@/components/search/global-search'
import { NotificationBell } from '@/components/notifications/notification-bell'
import type { ShellMember } from './nav-items'
import { useT, tx } from '@/i18n/client'

/**
 * Top bar on the page grid's own tracks (same --left-w / --rail-w / gap / max-width as
 * .app-grid): logo over the left sidebar, the 사람|AI switch centered over the center column,
 * search + account over the right rail (right edge of the content below 1280px).
 * Mobile: menu + small logo · switch · search icon + avatar.
 */
export function TopBar({ me }: { me: ShellMember }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const t = useT()
  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <div className="tb-left">
          <button
            type="button"
            className="tap-target only-mobile inline-flex items-center justify-center rounded-full text-n-333"
            aria-label={t('메뉴 더보기')}
            onClick={() => setMoreOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/feed" className="tb-logo" aria-label={t('AI쓰발 홈')}>
            <Image src="/images/logo-black.png" alt={tx('AI쓰발')} width={100} height={30} priority className="logo-ink" />
          </Link>
        </div>

        <div className="tb-center">
          <ModeSwitch />
        </div>

        <div className="tb-right">
          <GlobalSearch />
          <NotificationBell />
          <AccountMenu me={me} triggerClassName="tap-target inline-flex items-center justify-center rounded-full">
            <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="sm" />
          </AccountMenu>
        </div>
      </div>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} isAdmin={me.isAdmin} />
    </header>
  )
}
