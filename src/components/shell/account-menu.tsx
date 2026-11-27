'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bot, Download, LogOut, MessageSquareText, Settings, Shield, Ticket, Users, LayoutDashboard } from 'lucide-react'
import { useFeedbackMode } from '@/components/feedback/feedback-context'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { UserAvatar } from '@/components/user-avatar'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { ShellMember } from './nav-items'
import { signOut } from './sign-out'
import { useT } from '@/i18n/client'
import { LocaleSwitch } from '@/components/i18n/locale-switch'
import { ThemeSwitch } from '@/components/theme/theme-switch'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { InstallHelpSheet } from '@/components/pwa/install-help-sheet'
import { useFriendRequests } from '@/hooks/use-friend-requests'
import { FRIEND_REQUESTS_HREF } from '@/lib/friend-requests'

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
  const requests = useFriendRequests()
  const feedback = useFeedbackMode()
  return (
    <nav aria-label={t('계정 메뉴')} className="account-menu-body">
      {/* A89: '앱 설치' sits beside the profile row until the app is installed (hidden where install isn't possible) */}
      <div className="account-head-row">
        <Link href="/members/me" onClick={close} className="account-head">
          <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="md" />
          <span className="min-w-0">
            <span className="block font-semibold text-n-111 truncate">{me.displayName}</span>
            <span className="block text-xs text-n-888">{t('프로필 보기')}</span>
          </span>
        </Link>
        {onInstall && (
          <button type="button" onClick={onInstall} className="account-install">
            <Download className="w-3.5 h-3.5" aria-hidden /> {t('앱 설치')}
          </button>
        )}
      </div>
      <div className="account-sep" />
      <Link href="/me" onClick={close} className="account-row">
        <LayoutDashboard className="w-[18px] h-[18px]" /> {t('내 대시보드')}
      </Link>
      {/* A71: the header row above is the profile link (no second 내 프로필 row) */}
      <Link href="/agents" onClick={close} className="account-row">
        <Bot className="w-[18px] h-[18px]" /> {t('내 에이전트')}
      </Link>
      {/* A86: pending friend requests show here until answered, and the row opens straight to them */}
      <Link href={requests > 0 ? FRIEND_REQUESTS_HREF : '/members/me/social'} onClick={close} className="account-row">
        <Users className="w-[18px] h-[18px]" /> {t('친구·팔로워')}
        {requests > 0 && <span className="account-badge is-alert" aria-label={t('받은 친구 신청 {n}개', { n: requests })}>{t('신청 {n}', { n: requests })}</span>}
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
      {feedback.allowed && (
        <button
          type="button"
          className="account-row w-full text-left"
          aria-pressed={feedback.on}
          onClick={() => {
            close()
            feedback.setOn(!feedback.on)
          }}
        >
          <MessageSquareText className="w-[18px] h-[18px]" /> {t('화면 피드백')}
          <span className={feedback.on ? 'account-badge is-alert' : 'account-badge'}>{feedback.on ? t('켜짐') : t('꺼짐')}</span>
        </button>
      )}
      <div className="account-sep" />
      <LocaleSwitch variant="row" />
      <ThemeSwitch variant="row" />
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
  const requests = useFriendRequests()
  const desktop = useMediaQuery('(min-width: 768px)')
  const invitesLeft = useInvitesLeft(open, initialInvites)
  const wrap = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  const install = usePwaInstall()
  const [installHelp, setInstallHelp] = useState(false)
  // Chromium: one tap → the browser's install dialog; iOS Safari / Android without a prompt: how-to sheet (rendered outside the menu so closing it doesn't unmount it)
  const onInstall = install.mode
    ? () => {
        close()
        if (install.mode === 'prompt') void install.prompt()
        else setInstallHelp(true)
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
        className={`${triggerClassName} account-trigger`}
        aria-label={(triggerLabel ? t(triggerLabel) : t('내 계정 메뉴')) + (requests > 0 ? ` · ${t('받은 친구 신청 {n}개', { n: requests })}` : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {children}
        {requests > 0 && <span className="account-dot" aria-hidden />}
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
      {(install.mode === 'ios' || install.mode === 'android') && <InstallHelpSheet platform={install.mode} open={installHelp} onOpenChange={setInstallHelp} />}
    </div>
  )
}
