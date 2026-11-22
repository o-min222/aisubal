'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { LogOut, Menu, UserRound } from 'lucide-react'
import { signOut } from './sign-out'
import { UserAvatar } from '@/components/user-avatar'
import { ModeSwitch } from './mode-switch'
import { MoreSheet } from './more-sheet'
import type { ShellMember } from './nav-items'

/** Minimal top bar: logo · 사람|AI switch · avatar. Everything else lives in the side panel. */
export function TopBar({ me }: { me: ShellMember }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            className="tap-target only-mobile inline-flex items-center justify-center rounded-full text-[#333]"
            aria-label="메뉴 더보기"
            onClick={() => setMoreOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/feed" className="flex-shrink-0 only-desktop" aria-label="AI쓰발 홈">
            <Image src="/images/logo-black.png" alt="AI쓰발" width={100} height={30} priority className="h-7 w-auto" />
          </Link>
        </div>

        <ModeSwitch />

        <div className="flex items-center justify-end relative">
          <button
            type="button"
            className="tap-target inline-flex items-center justify-center rounded-full"
            aria-label="내 계정"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="sm" />
          </button>
          {menuOpen && (
            <>
              <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="닫기" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-48 z-50 bg-white border border-[#e5e5e5] rounded-xl shadow-lg overflow-hidden">
                <div className="p-3 border-b border-[#eee] text-sm font-medium text-[#111] truncate">{me.displayName}</div>
                <Link href="/members/me" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 min-h-[44px] text-sm text-[#444] hover:bg-[#f5f5f5]">
                  <UserRound className="w-4 h-4" /> 내 프로필
                </Link>
                <button type="button" onClick={signOut} className="w-full flex items-center gap-2 px-3 min-h-[44px] text-sm text-[#444] hover:bg-[#f5f5f5]">
                  <LogOut className="w-4 h-4" /> 로그아웃
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} isAdmin={me.isAdmin} />
    </header>
  )
}
