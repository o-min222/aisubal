'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Menu } from 'lucide-react'
import { AccountMenu } from './account-menu'
import { UserAvatar } from '@/components/user-avatar'
import { ModeSwitch } from './mode-switch'
import { MoreSheet } from './more-sheet'
import type { ShellMember } from './nav-items'
import { useT, tx } from '@/i18n/client'

/** Minimal top bar: logo · 사람|AI switch · avatar (account menu). Content sections live in the side panel. */
export function TopBar({ me }: { me: ShellMember }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const t = useT()
  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            className="tap-target only-mobile inline-flex items-center justify-center rounded-full text-[#333]"
            aria-label={t('메뉴 더보기')}
            onClick={() => setMoreOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/feed" className="flex-shrink-0 only-desktop" aria-label={t('AI쓰발 홈')}>
            <Image src="/images/logo-black.png" alt={tx('AI쓰발')} width={100} height={30} priority className="h-7 w-auto" />
          </Link>
        </div>

        <ModeSwitch />

        <div className="flex items-center justify-end">
          <AccountMenu me={me} triggerClassName="tap-target inline-flex items-center justify-center rounded-full">
            <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="sm" />
          </AccountMenu>
        </div>
      </div>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} isAdmin={me.isAdmin} />
    </header>
  )
}
