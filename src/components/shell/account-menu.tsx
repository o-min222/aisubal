'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, LogOut, Settings, Shield, Ticket, UserRound } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { UserAvatar } from '@/components/user-avatar'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ADMIN_SECTIONS, SETTINGS_SECTIONS, type SubNavItem } from './account-nav'
import type { ShellMember } from './nav-items'
import { signOut } from './sign-out'

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

function Group({
  icon: Icon,
  label,
  href,
  items,
  onNavigate,
}: {
  icon: typeof Settings
  label: string
  href: string
  items: SubNavItem[]
  onNavigate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <div className="account-row-wrap">
        <Link href={href} onClick={onNavigate} className="account-row flex-1">
          <Icon className="w-[18px] h-[18px]" /> {label}
        </Link>
        <button
          type="button"
          className="account-expand"
          aria-expanded={expanded}
          aria-label={`${label} 하위 메뉴 ${expanded ? '접기' : '펼치기'}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && (
        <ul className="account-sub">
          {items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} onClick={onNavigate} className="account-subrow">
                <i.icon className="w-4 h-4" /> {i.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MenuBody({ me, invitesLeft, close }: { me: ShellMember; invitesLeft: number | null; close: () => void }) {
  return (
    <nav aria-label="계정 메뉴" className="account-menu-body">
      <Link href="/members/me" onClick={close} className="account-head">
        <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="md" />
        <span className="min-w-0">
          <span className="block font-semibold text-[#111] truncate">{me.displayName}</span>
          <span className="block text-xs text-[#888]">프로필 보기</span>
        </span>
      </Link>
      <div className="account-sep" />
      <Link href="/members/me" onClick={close} className="account-row">
        <UserRound className="w-[18px] h-[18px]" /> 내 프로필
      </Link>
      <Link href="/invites" onClick={close} className="account-row">
        <Ticket className="w-[18px] h-[18px]" /> 초대
        {invitesLeft !== null && <span className="account-badge">{invitesLeft}장 남음</span>}
      </Link>
      <Group icon={Settings} label="설정" href="/settings" items={SETTINGS_SECTIONS} onNavigate={close} />
      {me.isAdmin && <Group icon={Shield} label="관리" href="/admin" items={ADMIN_SECTIONS} onNavigate={close} />}
      <div className="account-sep" />
      <button type="button" onClick={signOut} className="account-row w-full text-left">
        <LogOut className="w-[18px] h-[18px]" /> 로그아웃
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
  triggerLabel = '내 계정 메뉴',
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
  const desktop = useMediaQuery('(min-width: 768px)')
  const invitesLeft = useInvitesLeft(open, initialInvites)
  const wrap = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

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
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {children}
      </button>
      {open && desktop && (
        <div className={`account-dropdown ${align === 'left' ? 'left-0' : 'right-0'}`} role="menu">
          <MenuBody me={me} invitesLeft={invitesLeft} close={close} />
        </div>
      )}
      {!desktop && (
        <AdaptiveSheet open={open} onOpenChange={setOpen} title="내 계정">
          <MenuBody me={me} invitesLeft={invitesLeft} close={close} />
        </AdaptiveSheet>
      )}
    </div>
  )
}
