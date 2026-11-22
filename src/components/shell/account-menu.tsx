'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LogOut, Settings, Shield, SquarePlus, Ticket, UserRound, LayoutDashboard } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { UserAvatar } from '@/components/user-avatar'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { ShellMember } from './nav-items'
import { signOut } from './sign-out'
import { useT } from '@/i18n/client'
import { LocaleSwitch } from '@/components/i18n/locale-switch'
import { ThemeSwitch } from '@/components/theme/theme-switch'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { IosInstallSheet } from '@/components/pwa/ios-install-sheet'

function useInvitesLeft(open: boolean, initial: number | null) {
  const [left, setLeft] = useState<number | null>(initial)
  useEffect(() => {
    if (!open || left !== null) return
    let alive = true
    fetch('/api/invites')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { codes?: Array<{ isUsed: boolean }> } | null) => {
        if (alive && d?.codes) setLeft(d.codes.filter((c) => !c.isUsed).length)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, left])
  return left
}

function MenuBody({ me, invitesLeft, close, onInstall }: { me: ShellMember; invitesLeft: number | null; close: () => void; onInstall: (() => void) | null }) {
  const t = useT()
  return (
    <nav aria-label={t('계정 메뉴')} className="account-menu-body">
      <Link href="/members/me" onClick={close} className="account-head">
        <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="md" />
        <span className="min-w-0">
          <span className="block font-semibold text-n-111 truncate">{me.displayName}</span>
          <span className="block text-xs text-n-888">{t('프로필 보기')}</span>
        </span>
      </Link>
      <div className="account-sep" />
      <Link href="/me" onClick={close} className="account-row">
        <LayoutDashboard className="w-[18px] h-[18px]" /> {t('내 대시보드')}
      </Link>
      <Link href="/members/me" onClick={close} className="account-row">
        <UserRound className="w-[18px] h-[18px]" /> {t('내 프로필')}
      </Link>
      <Link href="/invites" onClick={close} className="account-row">
        <Ticket className="w-[18px] h-[18px]" /> {t('초대')}
        {invitesLeft !== null && <span className="account-badge">{t('{n}장 남음', { n: invitesLeft })}</span>}
      </Link>
      <Link href="/settings" onClick={close} className="account-row">
        <Settings className="w-[18px] h-[18px]" /> {t('설정')}
      </Link>
      {me.isAdmin && (
        <Link href="/admin" onClick={close} className="account-row">
          <Shield className="w-[18px] h-[18px]" /> {t('관리')}
        </Link>
      )}
      <div className="account-sep" />
      <LocaleSwitch variant="row" />
      <ThemeSwitch variant="row" />
      {onInstall && (
        <button type="button" onClick={onInstall} className="account-row w-full text-left">
          <SquarePlus className="w-[18px] h-[18px]" /> {t('홈 화면에 추가')}
        </button>
      )}
      <button type="button" onClick={signOut} className="account-row w-full text-left">
        <LogOut className="w-[18px] h-[18px]" /> {t('로그아웃')}
      </button>
    </nav>
  )
}

/**
 * Account menu behind the top-bar avatar and the side-panel profile card:
 * a dropdown on desktop, a bottom sheet on mobile.
 */
export function AccountMenu({
  me,
  invitesLeft: initialInvites = null,
  align = 'right',
  triggerClassName = '',
  triggerLabel,
  children,
}: {
  me: ShellMember
  invitesLeft?: number | null
  align?: 'left' | 'right'
  triggerClassName?: string
  triggerLabel?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const desktop = useMediaQuery('(min-width: 768px)')
  const invitesLeft = useInvitesLeft(open, initialInvites)
  const wrap = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  const install = usePwaInstall()
  const [iosHelp, setIosHelp] = useState(false)
  // Chromium: one tap → the browser's install dialog; iOS Safari: how-to sheet (rendered outside the menu so closing it doesn't unmount it)
  const onInstall = install.mode
    ? () => {
        close()
        if (install.mode === 'prompt') void install.prompt()
        else setIosHelp(true)
      }
    : null

  useEffect(() => {
    if (!open || !desktop) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, desktop])

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel ? t(triggerLabel) : t('내 계정 메뉴')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {children}
      </button>
      {open && desktop && (
        <div className={`account-dropdown ${align === 'left' ? 'left-0' : 'right-0'}`} role="menu">
          <MenuBody me={me} invitesLeft={invitesLeft} close={close} onInstall={onInstall} />
        </div>
      )}
      {!desktop && (
        <AdaptiveSheet open={open} onOpenChange={setOpen} title={t('내 계정')}>
          <MenuBody me={me} invitesLeft={invitesLeft} close={close} onInstall={onInstall} />
        </AdaptiveSheet>
      )}
      {install.mode === 'ios' && <IosInstallSheet open={iosHelp} onOpenChange={setIosHelp} />}
    </div>
  )
}
